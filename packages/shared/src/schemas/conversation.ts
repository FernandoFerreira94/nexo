import { z } from 'zod'
import { Affected, Category, Priority, TicketStatus, TicketType } from './ticket'

/** Estado do atendimento. Fora de `with_agent` o LLM nem é chamado. */
export const CONVERSATION_STATUSES = [
  'with_agent',
  'waiting_analyst',
  'with_analyst',
  'closed',
] as const
export const ConversationStatus = z.enum(CONVERSATION_STATUSES)
export type ConversationStatus = z.infer<typeof ConversationStatus>
export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  with_agent: 'Com o assistente',
  waiting_analyst: 'Aguardando analista',
  with_analyst: 'Com analista',
  closed: 'Encerrada',
}

/** Motivos de transferência do Anexo A (+ limite de mensagens). */
export const HANDOFF_REASONS = [
  'requested',
  'critical',
  'overdue',
  'low_confidence',
  'message_limit',
] as const
export const HandoffReason = z.enum(HANDOFF_REASONS)
export type HandoffReason = z.infer<typeof HandoffReason>
export const HANDOFF_REASON_LABELS: Record<HandoffReason, string> = {
  requested: 'Pedido do funcionário',
  critical: 'Caso crítico',
  overdue: 'Chamado vencido',
  low_confidence: 'Baixa confiança do assistente',
  message_limit: 'Limite de mensagens',
}

/** O que o funcionário quer neste turno. */
export const INTENTS = [
  'question',
  'ticket_status',
  'new_issue',
  'add_info',
  'reopen',
  'talk_to_human',
  'out_of_scope',
  'greeting',
  'unknown',
] as const
export const Intent = z.enum(INTENTS)
export type Intent = z.infer<typeof Intent>

export const MESSAGE_ROLES = ['employee', 'agent', 'analyst', 'system'] as const
export const MessageRole = z.enum(MESSAGE_ROLES)
export type MessageRole = z.infer<typeof MessageRole>

/** Resumo de chamado que vai para a tela (já com vencido e prazo calculados no servidor). */
export const TicketSummary = z.object({
  id: z.string(),
  type: TicketType,
  title: z.string(),
  category: Category,
  priority: Priority,
  status: TicketStatus,
  dueAt: z.string(),
  overdue: z.boolean(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  canReopen: z.boolean(),
})
export type TicketSummary = z.infer<typeof TicketSummary>

/**
 * Rascunho pendente. O LLM só cria rascunhos; quem grava no sistema de chamados é o
 * endpoint de confirmação, acionado pelo botão do funcionário (decisão D01).
 */
export const DraftKind = z.enum(['create', 'update', 'reopen'])
export type DraftKind = z.infer<typeof DraftKind>

export const Draft = z.object({
  id: z.string(),
  version: z.number().int().min(1),
  kind: DraftKind,
  /** Chamado alvo (update/reopen). */
  ticketId: z.string().nullable(),
  type: TicketType.nullable(),
  title: z.string(),
  description: z.string(),
  category: Category.nullable(),
  priority: Priority.nullable(),
  affected: Affected.nullable(),
  /** Explicação da prioridade (regra aplicada) e prazo previsto. */
  priorityReason: z.string().nullable(),
  slaLabel: z.string().nullable(),
  dueAtPreview: z.string().nullable(),
  status: z.enum(['pending', 'submitted', 'cancelled']),
})
export type Draft = z.infer<typeof Draft>

export const Card = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tickets'), tickets: z.array(TicketSummary) }),
  z.object({ type: z.literal('draft'), draft: Draft }),
  z.object({ type: z.literal('article'), articleId: z.string(), title: z.string() }),
])
export type Card = z.infer<typeof Card>

export const QuickReply = z.object({
  label: z.string(),
  /** `message`: envia o texto como se o funcionário digitasse. `handoff`: transfere direto, sem LLM. */
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('message'), text: z.string() }),
    z.object({ type: z.literal('handoff'), reason: HandoffReason }),
  ]),
})
export type QuickReply = z.infer<typeof QuickReply>

/** Uma ação mostrada acima da resposta: "consultou seus chamados". */
export const TraceAction = z.object({
  tool: z.string(),
  label: z.string(),
  input: z.unknown(),
  outputSummary: z.string(),
  status: z.enum(['ok', 'error']),
  durationMs: z.number(),
})
export type TraceAction = z.infer<typeof TraceAction>

/** Transparência: o que o agent entendeu, fez, com que confiança e por quê. */
export const DecisionTrace = z.object({
  understood: z.object({
    intent: Intent,
    entities: z.record(z.string(), z.string()),
    summary: z.string(),
  }),
  actions: z.array(TraceAction),
  confidence: z.number().min(0).max(1),
  confidenceReason: z.string(),
  rationale: z.string(),
  rulesApplied: z.array(z.string()),
  handoff: HandoffReason.nullable(),
  tokens: z.object({ input: z.number(), output: z.number() }),
  costUsd: z.number(),
  model: z.string(),
  latencyMs: z.number(),
})
export type DecisionTrace = z.infer<typeof DecisionTrace>

/** Eventos do streaming de uma resposta (NDJSON: um JSON por linha). */
export const StreamEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('action'),
    label: z.string(),
    status: z.enum(['running', 'ok', 'error']),
  }),
  z.object({ type: z.literal('text-delta'), text: z.string() }),
  z.object({ type: z.literal('card'), card: Card }),
  z.object({ type: z.literal('quick-replies'), options: z.array(QuickReply) }),
  z.object({
    type: z.literal('notice'),
    level: z.enum(['info', 'warning', 'error']),
    text: z.string(),
  }),
  z.object({
    type: z.literal('status'),
    status: ConversationStatus,
    reason: HandoffReason.nullable(),
  }),
  z.object({ type: z.literal('trace'), trace: DecisionTrace }),
  z.object({ type: z.literal('done'), messageId: z.string().nullable() }),
  z.object({ type: z.literal('error'), message: z.string() }),
])
export type StreamEvent = z.infer<typeof StreamEvent>
