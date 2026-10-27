import { z } from 'zod'

// Anexo A do PRD: tipos, categorias, prioridades e status de chamado.
// Os códigos ficam em inglês (estáveis no código); os rótulos em pt-BR ficam nos mapas *_LABELS.

export const TICKET_TYPES = ['INC', 'REQ'] as const
export const TicketType = z.enum(TICKET_TYPES)
export type TicketType = z.infer<typeof TicketType>
export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  INC: 'Incidente',
  REQ: 'Requisição',
}

export const CATEGORIES = [
  'access',
  'network_vpn',
  'hardware',
  'software',
  'email',
  'other',
] as const
export const Category = z.enum(CATEGORIES)
export type Category = z.infer<typeof Category>
export const CATEGORY_LABELS: Record<Category, string> = {
  access: 'Acesso',
  network_vpn: 'Rede e VPN',
  hardware: 'Hardware',
  software: 'Software',
  email: 'E-mail',
  other: 'Outros',
}

export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const
export const Priority = z.enum(PRIORITIES)
export type Priority = z.infer<typeof Priority>
export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
}

export const TICKET_STATUSES = [
  'open',
  'awaiting_analyst',
  'in_progress',
  'approved',
  'resolved',
  'closed',
] as const
export const TicketStatus = z.enum(TICKET_STATUSES)
export type TicketStatus = z.infer<typeof TicketStatus>
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Aberto',
  awaiting_analyst: 'Aguardando analista',
  in_progress: 'Em atendimento',
  approved: 'Aprovado',
  resolved: 'Resolvido',
  closed: 'Fechado',
}

/** Status em que o chamado ainda está "vivo": conta SLA e pode receber complemento. */
export const OPEN_STATUSES: readonly TicketStatus[] = [
  'open',
  'awaiting_analyst',
  'in_progress',
  'approved',
]

/** Quem é afetado: entra no cálculo de impacto da prioridade. */
export const AFFECTED = ['one', 'team', 'company'] as const
export const Affected = z.enum(AFFECTED)
export type Affected = z.infer<typeof Affected>
export const AFFECTED_LABELS: Record<Affected, string> = {
  one: 'Só eu',
  team: 'Minha equipe',
  company: 'A empresa toda',
}

export const TicketComment = z.object({
  author: z.enum(['employee', 'analyst', 'agent']),
  body: z.string().min(1),
  createdAt: z.iso.datetime(),
})
export type TicketComment = z.infer<typeof TicketComment>

export const Ticket = z.object({
  id: z.string().regex(/^(INC|REQ)-\d+$/),
  type: TicketType,
  title: z.string().min(3),
  description: z.string().min(3),
  category: Category,
  priority: Priority,
  status: TicketStatus,
  requesterId: z.string().min(1),
  affected: Affected,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Início do relógio do SLA: criação ou último retorno do analista (decisão D03). */
  slaStartAt: z.iso.datetime(),
  dueAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
  comments: z.array(TicketComment),
})
export type Ticket = z.infer<typeof Ticket>

/** Corpo de POST /tickets. O requesterId nunca vem do LLM: o servidor injeta o da sessão. */
export const CreateTicketInput = z.object({
  type: TicketType,
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(4000),
  category: Category,
  priority: Priority,
  affected: Affected,
  requesterId: z.string().min(1),
})
export type CreateTicketInput = z.infer<typeof CreateTicketInput>

/** Corpo de PATCH /tickets/:id. */
export const UpdateTicketInput = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('comment'),
    requesterId: z.string().min(1),
    body: z.string().min(1).max(4000),
  }),
  z.object({
    action: z.literal('reopen'),
    requesterId: z.string().min(1),
    reason: z.string().min(3).max(4000),
  }),
])
export type UpdateTicketInput = z.infer<typeof UpdateTicketInput>
