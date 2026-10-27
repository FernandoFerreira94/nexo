import { and, eq, max, desc } from 'drizzle-orm'
import {
  OPEN_STATUSES,
  canReopen,
  computeDueAt,
  type CreateTicketInput,
  type Ticket,
  type TicketComment,
  type TicketType,
} from '@nexo/shared'
import type { TicketsDb } from '../db/client'
import { tickets } from '../db/schema'

/** Erros de domínio: as rotas traduzem cada um para um status HTTP. */
export class NotFoundError extends Error {}
export class RuleViolationError extends Error {}

type TicketRow = typeof tickets.$inferSelect

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    requesterId: row.requesterId,
    affected: row.affected,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    slaStartAt: row.slaStartAt,
    dueAt: row.dueAt,
    resolvedAt: row.resolvedAt,
    comments: row.comments,
  }
}

export async function listTickets(db: TicketsDb, requesterId: string): Promise<Ticket[]> {
  const rows = await db
    .select()
    .from(tickets)
    .where(eq(tickets.requesterId, requesterId))
    .orderBy(desc(tickets.createdAt))
    .all()
  return rows.map(toTicket)
}

/**
 * Privacidade na fonte: busca sempre por id **e** dono.
 * Chamado de outra pessoa se comporta como inexistente (404), sem revelar que existe.
 */
export async function getTicket(db: TicketsDb, id: string, requesterId: string): Promise<Ticket> {
  const row = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, id), eq(tickets.requesterId, requesterId)))
    .get()
  if (!row) throw new NotFoundError('Chamado não encontrado.')
  return toTicket(row)
}

async function nextNumber(db: TicketsDb, type: TicketType): Promise<number> {
  const result = await db
    .select({ value: max(tickets.number) })
    .from(tickets)
    .where(eq(tickets.type, type))
    .get()
  const firstNumber = type === 'INC' ? 20000 : 10000
  return (result?.value ?? firstNumber) + 1
}

export async function createTicket(
  db: TicketsDb,
  input: CreateTicketInput,
  now: Date,
): Promise<Ticket> {
  const number = await nextNumber(db, input.type)
  const nowIso = now.toISOString()
  const row: TicketRow = {
    id: `${input.type}-${number}`,
    number,
    type: input.type,
    title: input.title,
    description: input.description,
    category: input.category,
    priority: input.priority,
    status: 'open',
    requesterId: input.requesterId,
    affected: input.affected,
    createdAt: nowIso,
    updatedAt: nowIso,
    slaStartAt: nowIso,
    dueAt: computeDueAt(now, input.priority).toISOString(),
    resolvedAt: null,
    comments: [],
  }
  await db.insert(tickets).values(row).run()
  return toTicket(row)
}

/** Complemento do funcionário. Não reinicia o SLA: o relógio só reinicia com retorno do analista (D03). */
export async function addComment(
  db: TicketsDb,
  id: string,
  requesterId: string,
  body: string,
  now: Date,
): Promise<Ticket> {
  const ticket = await getTicket(db, id, requesterId)
  if (!OPEN_STATUSES.includes(ticket.status)) {
    throw new RuleViolationError('Chamado não está aberto: reabra ou abra um novo.')
  }
  const comment: TicketComment = { author: 'employee', body, createdAt: now.toISOString() }
  return save(db, {
    ...ticket,
    comments: [...ticket.comments, comment],
    updatedAt: now.toISOString(),
  })
}

/** Reabertura: regra dos 7 dias aplicada aqui também (defesa em profundidade, D08). */
export async function reopenTicket(
  db: TicketsDb,
  id: string,
  requesterId: string,
  reason: string,
  now: Date,
): Promise<Ticket> {
  const ticket = await getTicket(db, id, requesterId)
  const check = canReopen(ticket, now)
  if (!check.allowed) throw new RuleViolationError(check.reason)

  const nowIso = now.toISOString()
  const comment: TicketComment = {
    author: 'employee',
    body: `Reaberto: ${reason}`,
    createdAt: nowIso,
  }
  return save(db, {
    ...ticket,
    status: 'open',
    resolvedAt: null,
    slaStartAt: nowIso,
    dueAt: computeDueAt(now, ticket.priority).toISOString(),
    comments: [...ticket.comments, comment],
    updatedAt: nowIso,
  })
}

/** Marca o chamado como aguardando analista e registra o resumo do agent. */
export async function transferTicket(
  db: TicketsDb,
  id: string,
  requesterId: string,
  summary: string,
  now: Date,
): Promise<Ticket> {
  const ticket = await getTicket(db, id, requesterId)
  if (!OPEN_STATUSES.includes(ticket.status)) {
    throw new RuleViolationError('Só chamados abertos podem ser transferidos.')
  }
  const nowIso = now.toISOString()
  const comment: TicketComment = { author: 'agent', body: summary, createdAt: nowIso }
  return save(db, {
    ...ticket,
    status: 'awaiting_analyst',
    comments: [...ticket.comments, comment],
    updatedAt: nowIso,
  })
}

async function save(db: TicketsDb, ticket: Ticket): Promise<Ticket> {
  await db
    .update(tickets)
    .set({
      status: ticket.status,
      resolvedAt: ticket.resolvedAt,
      slaStartAt: ticket.slaStartAt,
      dueAt: ticket.dueAt,
      comments: ticket.comments,
      updatedAt: ticket.updatedAt,
    })
    .where(eq(tickets.id, ticket.id))
    .run()
  return ticket
}
