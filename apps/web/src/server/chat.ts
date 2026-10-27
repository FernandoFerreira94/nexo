import {
  buildHandoffSummary,
  checkMessageLimit,
  HANDOFF_REPLIES,
  runTurn,
  type HistoryMessage,
  type TurnResult,
} from '@nexo/agent'
import type { HandoffReason, StreamEvent } from '@nexo/shared'
import {
  addMessage,
  countEmployeeMessage,
  getActiveConversation,
  getConversation,
  getPendingDraft,
  handOff,
  listMessages,
  noteOverdueTickets,
  saveDraft,
  type Conversation,
} from './conversations'
import type { Runtime } from './runtime'

export type SessionUser = { id: string; name: string }

/**
 * Uma mensagem do funcionário, do recebimento até a resposta salva.
 * Devolve eventos para a tela à medida que acontecem (streaming).
 */
export async function* handleEmployeeMessage(
  rt: Runtime,
  user: SessionUser,
  text: string,
): AsyncGenerator<StreamEvent> {
  const conversation = getActiveConversation(rt.db, user.id)
  const history = toHistory(listMessages(rt.db, conversation.id))
  addMessage(rt.db, {
    conversationId: conversation.id,
    role: 'employee',
    authorId: user.id,
    content: text,
  })

  // Com analista (ou aguardando), o agent fica calado: a mensagem vai para a pessoa.
  if (conversation.status !== 'with_agent') {
    yield { type: 'status', status: conversation.status, reason: conversation.handoffReason }
    yield { type: 'done', messageId: null }
    return
  }

  const limit = checkMessageLimit(
    countEmployeeMessage(rt.db, conversation),
    rt.config.messageLimit,
    rt.config.messageWarnAt,
  )
  if (limit.status === 'blocked') {
    yield* transfer(rt, conversation, user, 'message_limit', text, history)
    return
  }

  const turn = runTurn({
    config: rt.config,
    model: rt.model,
    decision: rt.decision,
    tickets: rt.tickets,
    requesterId: user.id,
    userName: user.name,
    text,
    history,
    pendingDraft: getPendingDraft(rt.db, conversation.id),
  })

  let step = await turn.next()
  while (!step.done) {
    yield step.value
    step = await turn.next()
  }
  const messageId = persistTurn(rt, conversation, step.value)

  if (limit.status === 'warn') {
    yield {
      type: 'notice',
      level: 'info',
      text: `Faltam ${limit.remaining} mensagens nesta conversa. Depois disso, um analista assume.`,
    }
  }
  yield { type: 'done', messageId }
}

/** Botão "Falar com analista" (quick reply): transfere sem passar pelo LLM. */
export async function* handleQuickHandoff(
  rt: Runtime,
  user: SessionUser,
  reason: HandoffReason,
): AsyncGenerator<StreamEvent> {
  const conversation = getActiveConversation(rt.db, user.id)
  if (conversation.status !== 'with_agent') {
    yield { type: 'status', status: conversation.status, reason: conversation.handoffReason }
    yield { type: 'done', messageId: null }
    return
  }
  const history = toHistory(listMessages(rt.db, conversation.id))
  const lastEmployeeText = [...history].reverse().find((m) => m.role === 'user')?.content ?? ''
  yield* transfer(rt, conversation, user, reason, lastEmployeeText, history)
}

async function* transfer(
  rt: Runtime,
  conversation: Conversation,
  user: SessionUser,
  reason: HandoffReason,
  lastText: string,
  history: HistoryMessage[],
): AsyncGenerator<StreamEvent> {
  const current = getConversation(rt.db, conversation.id)
  const summary = buildHandoffSummary({
    userName: user.name,
    reason,
    understoodSummary: lastText.slice(0, 200),
    history,
    ticketIds: current.overdueTicketIds,
  })
  handOff(rt.db, conversation.id, reason, summary)
  const text = HANDOFF_REPLIES[reason]
  const message = addMessage(rt.db, {
    conversationId: conversation.id,
    role: 'agent',
    content: text,
  })
  yield { type: 'text-delta', text }
  yield { type: 'status', status: 'waiting_analyst', reason }
  yield { type: 'done', messageId: message.id }
}

function persistTurn(rt: Runtime, conversation: Conversation, result: TurnResult): string {
  if (result.draft) saveDraft(rt.db, conversation.id, result.draft)
  const overdue = result.cards.flatMap((card) =>
    card.type === 'tickets' ? card.tickets.filter((t) => t.overdue).map((t) => t.id) : [],
  )
  if (overdue.length > 0) noteOverdueTickets(rt.db, conversation, overdue)
  if (result.handoff) {
    handOff(rt.db, conversation.id, result.handoff.reason, result.handoff.summary)
  }
  const message = addMessage(rt.db, {
    conversationId: conversation.id,
    role: 'agent',
    content: result.text,
    cards: result.cards,
    quickReplies: result.quickReplies,
    trace: result.trace,
  })
  return message.id
}

/** Histórico para o modelo: falas do analista entram marcadas; avisos do sistema ficam de fora. */
function toHistory(messages: { role: string; content: string }[]): HistoryMessage[] {
  return messages.flatMap((m): HistoryMessage[] => {
    if (m.role === 'employee') return [{ role: 'user', content: m.content }]
    if (m.role === 'agent') return [{ role: 'assistant', content: m.content }]
    if (m.role === 'analyst') return [{ role: 'assistant', content: `[Analista] ${m.content}` }]
    return []
  })
}
