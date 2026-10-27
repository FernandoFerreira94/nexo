import { HANDOFF_REASON_LABELS, type HandoffReason } from '@nexo/shared'
import type { HistoryMessage } from './understanding'

/**
 * Resumo que o analista recebe na transferência. Montado por template, sem LLM:
 * é rápido, não custa nada e não inventa fatos (o analista lê o histórico original se precisar).
 */
export function buildHandoffSummary(input: {
  userName: string
  reason: HandoffReason
  understoodSummary: string
  history: HistoryMessage[]
  ticketIds: string[]
}): string {
  const lastEmployeeMessages = input.history
    .filter((m) => m.role === 'user')
    .slice(-3)
    .map((m) => `- "${truncate(m.content, 160)}"`)

  return [
    `Motivo: ${HANDOFF_REASON_LABELS[input.reason]}.`,
    `Funcionário: ${input.userName}.`,
    `Pedido: ${input.understoodSummary}`,
    input.ticketIds.length > 0 ? `Chamados citados: ${input.ticketIds.join(', ')}.` : null,
    lastEmployeeMessages.length > 0
      ? `Últimas mensagens:\n${lastEmployeeMessages.join('\n')}`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
