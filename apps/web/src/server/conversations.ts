import type {
  Card,
  ConversationStatus,
  DecisionTrace,
  Draft,
  HandoffReason,
  MessageRole,
  QuickReply,
} from '@nexo/shared'
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { AppDb } from './db/client'
import { conversations, decisionTraces, drafts, messages, users } from './db/schema'

/**
 * Regras das conversas, sem nada de HTTP: as rotas da API só validam a entrada,
 * pegam o usuário da sessão e chamam estas funções.
 */
export type Conversation = typeof conversations.$inferSelect
export type Message = typeof messages.$inferSelect
export type MessageWithTrace = Message & { trace: DecisionTrace | null }

export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}
export class ConflictError extends Error {}

const nowIso = () => new Date().toISOString()

/** Retoma a última conversa não encerrada ou abre uma nova (decisão D13). */
export function getActiveConversation(db: AppDb, userId: string): Conversation {
  const existing = db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), ne(conversations.status, 'closed')))
    .orderBy(desc(conversations.updatedAt))
    .get()
  if (existing) return existing

  const created: Conversation = {
    id: randomUUID(),
    userId,
    status: 'with_agent',
    handoffReason: null,
    handoffSummary: null,
    handoffAt: null,
    assignedAnalystId: null,
    overdueTicketIds: [],
    employeeMessageCount: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  db.insert(conversations).values(created).run()
  return created
}

export function getConversation(db: AppDb, id: string): Conversation {
  const conversation = db.select().from(conversations).where(eq(conversations.id, id)).get()
  if (!conversation) throw new NotFoundError('Conversa não encontrada.')
  return conversation
}

/** Funcionário só enxerga a própria conversa; quem não é dono recebe 404 (decisão D11). */
export function getOwnConversation(db: AppDb, id: string, userId: string): Conversation {
  const conversation = getConversation(db, id)
  if (conversation.userId !== userId) throw new NotFoundError('Conversa não encontrada.')
  return conversation
}

/** Mensagens com o trace e com os cartões de rascunho no estado atual (enviado, descartado). */
export function listMessages(db: AppDb, conversationId: string): MessageWithTrace[] {
  const draftStatus = new Map(
    db
      .select()
      .from(drafts)
      .where(eq(drafts.conversationId, conversationId))
      .all()
      .map((row) => [row.id, row.data] as const),
  )
  return db
    .select({ message: messages, trace: decisionTraces.data })
    .from(messages)
    .leftJoin(decisionTraces, eq(decisionTraces.id, messages.traceId))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt), sql`messages.rowid`)
    .all()
    .map(({ message, trace }) => ({
      ...message,
      trace,
      cards: message.cards.map((card): Card => {
        const current = card.type === 'draft' ? draftStatus.get(card.draft.id) : undefined
        if (card.type !== 'draft' || !current || current.version !== card.draft.version) return card
        return { type: 'draft', draft: { ...card.draft, status: current.status } }
      }),
    }))
}

export function addMessage(
  db: AppDb,
  input: {
    conversationId: string
    role: MessageRole
    content: string
    authorId?: string | null
    cards?: Card[]
    quickReplies?: QuickReply[]
    trace?: DecisionTrace | null
  },
): Message {
  let traceId: string | null = null
  if (input.trace) {
    traceId = randomUUID()
    db.insert(decisionTraces)
      .values({
        id: traceId,
        conversationId: input.conversationId,
        data: input.trace,
        createdAt: nowIso(),
      })
      .run()
  }
  const message: Message = {
    id: randomUUID(),
    conversationId: input.conversationId,
    role: input.role,
    authorId: input.authorId ?? null,
    content: input.content,
    cards: input.cards ?? [],
    quickReplies: input.quickReplies ?? [],
    traceId,
    createdAt: nowIso(),
  }
  db.insert(messages).values(message).run()
  touch(db, input.conversationId)
  return message
}

export function countEmployeeMessage(db: AppDb, conversation: Conversation): number {
  const count = conversation.employeeMessageCount + 1
  db.update(conversations)
    .set({ employeeMessageCount: count })
    .where(eq(conversations.id, conversation.id))
    .run()
  return count
}

export function noteOverdueTickets(db: AppDb, conversation: Conversation, ids: string[]) {
  const merged = [...new Set([...conversation.overdueTicketIds, ...ids])]
  if (merged.length === conversation.overdueTicketIds.length) return
  db.update(conversations)
    .set({ overdueTicketIds: merged })
    .where(eq(conversations.id, conversation.id))
    .run()
}

/** Transfere para a fila dos analistas, com motivo e resumo. Repetir não duplica. */
export function handOff(
  db: AppDb,
  conversationId: string,
  reason: HandoffReason,
  summary: string,
): Conversation {
  const conversation = getConversation(db, conversationId)
  if (conversation.status !== 'with_agent') return conversation
  db.update(conversations)
    .set({
      status: 'waiting_analyst',
      handoffReason: reason,
      handoffSummary: summary,
      handoffAt: nowIso(),
    })
    .where(eq(conversations.id, conversationId))
    .run()
  return getConversation(db, conversationId)
}

/** Ordem da fila: crítico primeiro, depois vencido, depois o resto por tempo de espera. */
const REASON_WEIGHT: Record<HandoffReason, number> = {
  critical: 0,
  overdue: 1,
  requested: 2,
  low_confidence: 2,
  message_limit: 3,
}

export function listQueue(db: AppDb) {
  const rows = db
    .select({ conversation: conversations, user: users })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.userId))
    .where(inArray(conversations.status, ['waiting_analyst', 'with_analyst']))
    .all()
  return rows
    .map(({ conversation, user }) => ({
      ...conversation,
      userName: user.name,
      department: user.department,
    }))
    .sort((a, b) => {
      const weight = (c: Conversation) => (c.handoffReason ? REASON_WEIGHT[c.handoffReason] : 9)
      return weight(a) - weight(b) || (a.handoffAt ?? '').localeCompare(b.handoffAt ?? '')
    })
}

export function assume(db: AppDb, conversationId: string, analystId: string): Conversation {
  const conversation = getConversation(db, conversationId)
  if (conversation.status === 'with_analyst' && conversation.assignedAnalystId !== analystId) {
    throw new ConflictError('Outro analista já assumiu esta conversa.')
  }
  if (conversation.status !== 'waiting_analyst' && conversation.status !== 'with_analyst') {
    throw new ConflictError('Esta conversa não está na fila.')
  }
  setStatus(db, conversationId, 'with_analyst', analystId)
  const analyst = db.select().from(users).where(eq(users.id, analystId)).get()
  addMessage(db, {
    conversationId,
    role: 'system',
    content: `${analyst?.name ?? 'Um analista'} entrou na conversa.`,
  })
  return getConversation(db, conversationId)
}

export function analystReply(db: AppDb, conversationId: string, analystId: string, text: string) {
  requireAssigned(db, conversationId, analystId)
  return addMessage(db, { conversationId, role: 'analyst', authorId: analystId, content: text })
}

/** Devolve ao assistente: o funcionário volta a falar com o agent na mesma conversa. */
export function returnToAgent(db: AppDb, conversationId: string, analystId: string) {
  requireAssigned(db, conversationId, analystId)
  setStatus(db, conversationId, 'with_agent', null)
  db.update(conversations)
    .set({ handoffReason: null, handoffSummary: null, handoffAt: null })
    .where(eq(conversations.id, conversationId))
    .run()
  addMessage(db, {
    conversationId,
    role: 'system',
    content: 'O analista devolveu a conversa para o assistente.',
  })
}

export function closeConversation(db: AppDb, conversationId: string, analystId: string) {
  requireAssigned(db, conversationId, analystId)
  setStatus(db, conversationId, 'closed', analystId)
  addMessage(db, { conversationId, role: 'system', content: 'Atendimento encerrado.' })
}

// Rascunhos ---------------------------------------------------------------

export function saveDraft(db: AppDb, conversationId: string, draft: Draft) {
  db.insert(drafts)
    .values({
      id: draft.id,
      conversationId,
      data: draft,
      resultTicketId: null,
      updatedAt: nowIso(),
    })
    .onConflictDoUpdate({ target: drafts.id, set: { data: draft, updatedAt: nowIso() } })
    .run()
}

export function getPendingDraft(db: AppDb, conversationId: string): Draft | null {
  const rows = db
    .select()
    .from(drafts)
    .where(eq(drafts.conversationId, conversationId))
    .orderBy(desc(drafts.updatedAt))
    .all()
  return rows.find((row) => row.data.status === 'pending')?.data ?? null
}

/** Rascunho do próprio funcionário, pendente e na versão que ele viu na tela. */
export function getDraftForConfirmation(
  db: AppDb,
  draftId: string,
  userId: string,
  version: number,
): { draft: Draft; conversation: Conversation } {
  const row = db.select().from(drafts).where(eq(drafts.id, draftId)).get()
  if (!row) throw new NotFoundError('Rascunho não encontrado.')
  const conversation = getOwnConversation(db, row.conversationId, userId)
  if (row.data.status !== 'pending') throw new ConflictError('Este rascunho já foi usado.')
  if (row.data.version !== version) {
    throw new ConflictError('O rascunho mudou. Confira a versão mais recente.')
  }
  return { draft: row.data, conversation }
}

export function finishDraft(
  db: AppDb,
  draft: Draft,
  status: 'submitted' | 'cancelled',
  resultTicketId: string | null = null,
) {
  db.update(drafts)
    .set({ data: { ...draft, status }, resultTicketId, updatedAt: nowIso() })
    .where(eq(drafts.id, draft.id))
    .run()
}

// Internos ----------------------------------------------------------------

function requireAssigned(db: AppDb, conversationId: string, analystId: string) {
  const conversation = getConversation(db, conversationId)
  if (conversation.status !== 'with_analyst' || conversation.assignedAnalystId !== analystId) {
    throw new ForbiddenError('Assuma a conversa antes de responder.')
  }
  return conversation
}

function setStatus(
  db: AppDb,
  conversationId: string,
  status: ConversationStatus,
  analystId: string | null,
) {
  db.update(conversations)
    .set({ status, assignedAnalystId: analystId, updatedAt: nowIso() })
    .where(eq(conversations.id, conversationId))
    .run()
}

function touch(db: AppDb, conversationId: string) {
  db.update(conversations)
    .set({ updatedAt: nowIso() })
    .where(eq(conversations.id, conversationId))
    .run()
}
