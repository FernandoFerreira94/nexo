import type {
  Card,
  ConversationStatus,
  DecisionTrace,
  Draft,
  HandoffReason,
  MessageRole,
  QuickReply,
} from '@nexo/shared'
import { and, asc, desc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { AppDb } from './db/client'
import { conversations, decisionTraces, drafts, llmUsage, messages, users } from './db/schema'

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
export async function getActiveConversation(db: AppDb, userId: string): Promise<Conversation> {
  const existing = await db
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
  await db.insert(conversations).values(created).run()
  return created
}

/**
 * O que a tela do funcionário mostra: a última conversa, mesmo encerrada (para ele ver
 * "Atendimento encerrado"). A próxima mensagem abre uma nova via getActiveConversation.
 */
export async function getLatestConversation(db: AppDb, userId: string): Promise<Conversation> {
  const latest = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .get()
  return latest ?? getActiveConversation(db, userId)
}

/**
 * "Nova conversa" do funcionário: encerra a conversa atual com o assistente e abre outra.
 * Com analista (ou na fila) não deixa: o atendimento humano precisa terminar antes.
 */
export async function startNewConversation(db: AppDb, userId: string): Promise<Conversation> {
  const current = await getActiveConversation(db, userId)
  if (current.status === 'waiting_analyst' || current.status === 'with_analyst') {
    throw new ConflictError('Você está em atendimento com um analista. Termine com ele primeiro.')
  }
  const hasMessages = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.conversationId, current.id))
    .get()
  if (!hasMessages) return current // já é uma conversa nova
  await addMessage(db, {
    conversationId: current.id,
    role: 'system',
    content: 'Conversa encerrada pelo funcionário.',
  })
  await setStatus(db, current.id, 'closed', null)
  return getActiveConversation(db, userId)
}

export async function getConversation(db: AppDb, id: string): Promise<Conversation> {
  const conversation = await db.select().from(conversations).where(eq(conversations.id, id)).get()
  if (!conversation) throw new NotFoundError('Conversa não encontrada.')
  return conversation
}

/** Funcionário só enxerga a própria conversa; quem não é dono recebe 404 (decisão D11). */
export async function getOwnConversation(
  db: AppDb,
  id: string,
  userId: string,
): Promise<Conversation> {
  const conversation = await getConversation(db, id)
  if (conversation.userId !== userId) throw new NotFoundError('Conversa não encontrada.')
  return conversation
}

/** Mensagens com o trace e com os cartões de rascunho no estado atual (enviado, descartado). */
export async function listMessages(db: AppDb, conversationId: string): Promise<MessageWithTrace[]> {
  const draftRows = await db
    .select()
    .from(drafts)
    .where(eq(drafts.conversationId, conversationId))
    .all()
  const draftStatus = new Map(draftRows.map((row) => [row.id, row.data] as const))
  const rows = await db
    .select({ message: messages, trace: decisionTraces.data })
    .from(messages)
    .leftJoin(decisionTraces, eq(decisionTraces.id, messages.traceId))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt), sql`messages.rowid`)
    .all()
  return rows.map(({ message, trace }) => ({
    ...message,
    trace,
    cards: message.cards.map((card): Card => {
      const current = card.type === 'draft' ? draftStatus.get(card.draft.id) : undefined
      if (card.type !== 'draft' || !current || current.version !== card.draft.version) return card
      return { type: 'draft', draft: { ...card.draft, status: current.status } }
    }),
  }))
}

export async function addMessage(
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
): Promise<Message> {
  let traceId: string | null = null
  if (input.trace) {
    traceId = randomUUID()
    await db
      .insert(decisionTraces)
      .values({
        id: traceId,
        conversationId: input.conversationId,
        data: input.trace,
        createdAt: nowIso(),
      })
      .run()
    if (input.trace.costUsd > 0) await addLlmSpend(db, input.trace.costUsd)
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
  await db.insert(messages).values(message).run()
  await touch(db, input.conversationId)
  return message
}

/** Soma no banco (não no objeto em memória) para dois envios simultâneos não perderem a conta. */
export async function countEmployeeMessage(db: AppDb, conversation: Conversation): Promise<number> {
  const row = await db
    .update(conversations)
    .set({ employeeMessageCount: sql`${conversations.employeeMessageCount} + 1` })
    .where(eq(conversations.id, conversation.id))
    .returning({ count: conversations.employeeMessageCount })
    .get()
  return row?.count ?? conversation.employeeMessageCount + 1
}

export async function noteOverdueTickets(db: AppDb, conversation: Conversation, ids: string[]) {
  const merged = [...new Set([...conversation.overdueTicketIds, ...ids])]
  if (merged.length === conversation.overdueTicketIds.length) return
  await db
    .update(conversations)
    .set({ overdueTicketIds: merged })
    .where(eq(conversations.id, conversation.id))
    .run()
}

/** Transfere para a fila dos analistas, com motivo e resumo. Repetir não duplica. */
export async function handOff(
  db: AppDb,
  conversationId: string,
  reason: HandoffReason,
  summary: string,
): Promise<Conversation> {
  const conversation = await getConversation(db, conversationId)
  if (conversation.status !== 'with_agent') return conversation
  await db
    .update(conversations)
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

export async function listQueue(db: AppDb) {
  const rows = await db
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

export async function assume(
  db: AppDb,
  conversationId: string,
  analystId: string,
): Promise<Conversation> {
  const conversation = await getConversation(db, conversationId)
  if (conversation.status === 'with_analyst' && conversation.assignedAnalystId === analystId) {
    return conversation
  }
  if (conversation.status === 'with_analyst') {
    throw new ConflictError('Outro analista já assumiu esta conversa.')
  }
  if (conversation.status !== 'waiting_analyst') {
    throw new ConflictError('Esta conversa não está na fila.')
  }
  // Update condicional: se dois analistas clicam juntos, só um muda a linha.
  const claimed = await db
    .update(conversations)
    .set({ status: 'with_analyst', assignedAnalystId: analystId, updatedAt: nowIso() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.status, 'waiting_analyst')))
    .returning({ id: conversations.id })
    .all()
  if (claimed.length === 0) throw new ConflictError('Outro analista já assumiu esta conversa.')
  const analyst = await db.select().from(users).where(eq(users.id, analystId)).get()
  await addMessage(db, {
    conversationId,
    role: 'system',
    content: `${analyst?.name ?? 'Um analista'} entrou na conversa.`,
  })
  return getConversation(db, conversationId)
}

export async function analystReply(
  db: AppDb,
  conversationId: string,
  analystId: string,
  text: string,
) {
  await requireAssigned(db, conversationId, analystId)
  return addMessage(db, { conversationId, role: 'analyst', authorId: analystId, content: text })
}

/** Devolve ao assistente: o funcionário volta a falar com o agent na mesma conversa. */
export async function returnToAgent(db: AppDb, conversationId: string, analystId: string) {
  await requireAssigned(db, conversationId, analystId)
  await db
    .update(conversations)
    .set({
      status: 'with_agent',
      assignedAnalystId: null,
      handoffReason: null,
      handoffSummary: null,
      handoffAt: null,
      updatedAt: nowIso(),
    })
    .where(eq(conversations.id, conversationId))
    .run()
  await addMessage(db, {
    conversationId,
    role: 'system',
    content: 'O analista devolveu a conversa para o assistente.',
  })
}

export async function closeConversation(db: AppDb, conversationId: string, analystId: string) {
  await requireAssigned(db, conversationId, analystId)
  await setStatus(db, conversationId, 'closed', analystId)
  await addMessage(db, { conversationId, role: 'system', content: 'Atendimento encerrado.' })
}

// Rascunhos ---------------------------------------------------------------

export async function saveDraft(db: AppDb, conversationId: string, draft: Draft) {
  await db
    .insert(drafts)
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

export async function getPendingDraft(db: AppDb, conversationId: string): Promise<Draft | null> {
  const rows = await db
    .select()
    .from(drafts)
    .where(eq(drafts.conversationId, conversationId))
    .orderBy(desc(drafts.updatedAt))
    .all()
  return rows.find((row) => row.data.status === 'pending')?.data ?? null
}

/** Rascunho do próprio funcionário, pendente e na versão que ele viu na tela. */
export async function getDraftForConfirmation(
  db: AppDb,
  draftId: string,
  userId: string,
  version: number,
): Promise<{ draft: Draft; conversation: Conversation }> {
  const row = await db.select().from(drafts).where(eq(drafts.id, draftId)).get()
  if (!row) throw new NotFoundError('Rascunho não encontrado.')
  const conversation = await getOwnConversation(db, row.conversationId, userId)
  if (row.data.status !== 'pending') throw new ConflictError('Este rascunho já foi usado.')
  if (row.data.version !== version) {
    throw new ConflictError('O rascunho mudou. Confira a versão mais recente.')
  }
  return { draft: row.data, conversation }
}

export async function finishDraft(
  db: AppDb,
  draft: Draft,
  status: 'submitted' | 'cancelled',
  resultTicketId: string | null = null,
) {
  await db
    .update(drafts)
    .set({ data: { ...draft, status }, resultTicketId, updatedAt: nowIso() })
    .where(eq(drafts.id, draft.id))
    .run()
}

// Internos ----------------------------------------------------------------

async function requireAssigned(db: AppDb, conversationId: string, analystId: string) {
  const conversation = await getConversation(db, conversationId)
  if (conversation.status !== 'with_analyst' || conversation.assignedAnalystId !== analystId) {
    throw new ForbiddenError('Assuma a conversa antes de responder.')
  }
  return conversation
}

async function setStatus(
  db: AppDb,
  conversationId: string,
  status: ConversationStatus,
  analystId: string | null,
) {
  await db
    .update(conversations)
    .set({ status, assignedAnalystId: analystId, updatedAt: nowIso() })
    .where(eq(conversations.id, conversationId))
    .run()
}

async function touch(db: AppDb, conversationId: string) {
  await db
    .update(conversations)
    .set({ updatedAt: nowIso() })
    .where(eq(conversations.id, conversationId))
    .run()
}

// Demo publicada ----------------------------------------------------------

/** Soma o custo de uma resposta ao gasto acumulado (no banco: vale para todas as instâncias). */
export async function addLlmSpend(db: AppDb, costUsd: number): Promise<void> {
  await db
    .insert(llmUsage)
    .values({ id: 'total', costUsd, updatedAt: nowIso() })
    .onConflictDoUpdate({
      target: llmUsage.id,
      set: { costUsd: sql`${llmUsage.costUsd} + ${costUsd}`, updatedAt: nowIso() },
    })
    .run()
}

export async function getLlmSpend(db: AppDb): Promise<number> {
  const row = await db.select().from(llmUsage).where(eq(llmUsage.id, 'total')).get()
  return row?.costUsd ?? 0
}

/** Respostas do assistente desde `sinceIso`: base do teto diário de uso do LLM. */
export async function countAgentTurnsSince(db: AppDb, sinceIso: string): Promise<number> {
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(decisionTraces)
    .where(gte(decisionTraces.createdAt, sinceIso))
    .get()
  return row?.count ?? 0
}

/**
 * Na demo pública todos usam os mesmos usuários de exemplo. Conversas paradas há mais de
 * algumas horas são apagadas para cada visitante encontrar o app limpo.
 */
export async function pruneStaleConversations(db: AppDb, olderThanIso: string): Promise<number> {
  const stale = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(lt(conversations.updatedAt, olderThanIso))
    .all()
  const ids = stale.map((row) => row.id)
  if (ids.length === 0) return 0
  await db.batch([
    db.delete(messages).where(inArray(messages.conversationId, ids)),
    db.delete(decisionTraces).where(inArray(decisionTraces.conversationId, ids)),
    db.delete(drafts).where(inArray(drafts.conversationId, ids)),
    db.delete(conversations).where(inArray(conversations.id, ids)),
  ])
  return ids.length
}
