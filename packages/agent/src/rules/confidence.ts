import type { Intent } from '@nexo/shared'

/**
 * Confiança composta (decisão D10): a autoavaliação do modelo é mal calibrada, então ela
 * é limitada por tetos determinísticos. O resultado é o menor valor, com o motivo.
 */
export type ConfidenceSignals = {
  modelConfidence: number
  modelReason: string
  intent: Intent
  /** Uma tool falhou neste turno (ex.: sistema de chamados fora do ar). */
  toolFailed?: boolean
  /** A busca de artigos não achou nada forte para uma dúvida. */
  weakArticleMatch?: boolean
}

export type ConfidenceResult = { value: number; reason: string; capsApplied: string[] }

const CAPS = {
  unknownIntent: {
    value: 0.3,
    id: 'CONFIDENCE_CAP_UNKNOWN_INTENT',
    reason: 'não entendi o pedido',
  },
  toolFailed: { value: 0.4, id: 'CONFIDENCE_CAP_TOOL_FAILED', reason: 'uma consulta falhou' },
  weakArticle: {
    value: 0.5,
    id: 'CONFIDENCE_CAP_WEAK_ARTICLE',
    reason: 'nenhum artigo responde bem',
  },
} as const

export function computeConfidence(signals: ConfidenceSignals): ConfidenceResult {
  let value = clamp(signals.modelConfidence)
  let reason = signals.modelReason
  const capsApplied: string[] = []

  const apply = (cap: { value: number; id: string; reason: string }) => {
    capsApplied.push(cap.id)
    if (cap.value < value) {
      value = cap.value
      reason = `Limitada a ${cap.value}: ${cap.reason}.`
    }
  }

  if (signals.intent === 'unknown') apply(CAPS.unknownIntent)
  if (signals.toolFailed) apply(CAPS.toolFailed)
  if (signals.weakArticleMatch) apply(CAPS.weakArticle)

  return { value, reason, capsApplied }
}

function clamp(n: number): number {
  return Math.min(1, Math.max(0, n))
}
