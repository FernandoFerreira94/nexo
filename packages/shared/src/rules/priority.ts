import type { Affected, Priority, TicketType } from '../schemas/ticket'

/**
 * Sinais que o LLM extrai da conversa. Quem decide a prioridade é esta função,
 * não o LLM (decisão D02): prioridade = impacto (quantos afetados) × urgência.
 */
export type PrioritySignals = {
  type: TicketType
  affected: Affected
  /** Não consegue trabalhar e não há alternativa ("parou"). */
  blocksWork: boolean
  /** Há um compromisso no mesmo dia em risco. */
  deadlineToday: boolean
}

export type PriorityDecision = {
  priority: Priority
  ruleId: string
  reason: string
}

export function classifyPriority(signals: PrioritySignals): PriorityDecision {
  const manyAffected = signals.affected === 'team' || signals.affected === 'company'

  if (manyAffected && signals.blocksWork) {
    return {
      priority: 'critical',
      ruleId: 'PRIORITY_CRITICAL_TEAM_STOPPED',
      reason: 'Parado para a equipe ou a empresa.',
    }
  }
  if (signals.blocksWork) {
    return {
      priority: 'high',
      ruleId: 'PRIORITY_HIGH_PERSON_STOPPED',
      reason: 'Impede uma pessoa de trabalhar.',
    }
  }
  if (signals.deadlineToday) {
    return {
      priority: 'high',
      ruleId: 'PRIORITY_HIGH_DEADLINE_TODAY',
      reason: 'Há um compromisso no mesmo dia em risco.',
    }
  }
  if (signals.type === 'REQ') {
    return {
      priority: 'low',
      ruleId: 'PRIORITY_LOW_REQUEST',
      reason: 'Pedido sem urgência.',
    }
  }
  return {
    priority: 'medium',
    ruleId: 'PRIORITY_MEDIUM_HAS_WORKAROUND',
    reason: 'Atrapalha, mas há alternativa.',
  }
}
