import { canReopen, isOverdue, type Ticket, type TicketSummary } from '@nexo/shared'

/** Versão enxuta do chamado para a tela e para o modelo, com vencido e reabertura já calculados. */
export function toTicketSummary(ticket: Ticket, now: Date): TicketSummary {
  return {
    id: ticket.id,
    type: ticket.type,
    title: ticket.title,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    dueAt: ticket.dueAt,
    overdue: isOverdue(ticket, now),
    createdAt: ticket.createdAt,
    resolvedAt: ticket.resolvedAt,
    canReopen: canReopen(ticket, now).allowed,
  }
}

/** Acha "INC-20311" ou "req 10442" no texto do funcionário. */
export function extractTicketId(text: string): string | null {
  const match = /\b(INC|REQ)[-\s]?(\d{3,})\b/i.exec(text)
  return match ? `${match[1]?.toUpperCase()}-${match[2]}` : null
}
