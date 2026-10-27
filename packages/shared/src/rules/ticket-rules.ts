import { OPEN_STATUSES, type Ticket } from '../schemas/ticket'

/** Janela de reabertura do Anexo A: resolvido há até 7 dias (corridos). */
export const REOPEN_WINDOW_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

type SlaFields = Pick<Ticket, 'status' | 'dueAt'>

/** Vencido = chamado ainda aberto cujo prazo já passou. Resolvido/Fechado nunca vencem. */
export function isOverdue(ticket: SlaFields, now: Date): boolean {
  return OPEN_STATUSES.includes(ticket.status) && now.getTime() > new Date(ticket.dueAt).getTime()
}

type ReopenFields = Pick<Ticket, 'status' | 'resolvedAt'>

export type ReopenCheck = { allowed: true } | { allowed: false; reason: string }

/** Só reabre chamado Resolvido há até 7 dias. Fechado nunca reabre (decisão D08). */
export function canReopen(ticket: ReopenFields, now: Date): ReopenCheck {
  if (ticket.status !== 'resolved' || !ticket.resolvedAt) {
    return { allowed: false, reason: 'Só chamados resolvidos podem ser reabertos.' }
  }
  const resolvedForMs = now.getTime() - new Date(ticket.resolvedAt).getTime()
  if (resolvedForMs > REOPEN_WINDOW_DAYS * DAY_MS) {
    return {
      allowed: false,
      reason: `Resolvido há mais de ${REOPEN_WINDOW_DAYS} dias: é preciso abrir um chamado novo.`,
    }
  }
  return { allowed: true }
}
