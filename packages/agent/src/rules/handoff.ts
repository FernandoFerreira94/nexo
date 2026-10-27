import type { HandoffReason, Intent } from '@nexo/shared'

/**
 * Gatilhos de transferência do Anexo A que valem ANTES da resposta:
 * pedido do funcionário, caso crítico e baixa confiança.
 * Chamado vencido não transfere sozinho: o agent oferece o analista (decisão D06).
 */
export type HandoffInput = {
  intent: Intent
  isCritical: boolean
  confidence: number
  threshold: number
}

export type HandoffDecision = { reason: HandoffReason; ruleId: string } | null

export function decideHandoff(input: HandoffInput): HandoffDecision {
  if (input.intent === 'talk_to_human') return { reason: 'requested', ruleId: 'HANDOFF_REQUESTED' }
  if (input.isCritical) return { reason: 'critical', ruleId: 'HANDOFF_CRITICAL' }
  // Saudação e fora de escopo têm resposta fixa: baixa confiança ali não precisa de humano.
  const needsJudgement = input.intent !== 'greeting' && input.intent !== 'out_of_scope'
  if (needsJudgement && input.confidence < input.threshold) {
    return { reason: 'low_confidence', ruleId: 'HANDOFF_LOW_CONFIDENCE' }
  }
  return null
}
