import { describe, expect, it } from 'vitest'
import { classifyPriority, type PrioritySignals } from './priority'

const base: PrioritySignals = {
  type: 'INC',
  affected: 'one',
  blocksWork: false,
  deadlineToday: false,
}

describe('classifyPriority (impacto × urgência)', () => {
  it('equipe parada é Crítica', () => {
    expect(classifyPriority({ ...base, affected: 'team', blocksWork: true }).priority).toBe(
      'critical',
    )
    expect(classifyPriority({ ...base, affected: 'company', blocksWork: true }).priority).toBe(
      'critical',
    )
  })

  it('uma pessoa impedida de trabalhar é Alta', () => {
    expect(classifyPriority({ ...base, blocksWork: true }).priority).toBe('high')
  })

  it('compromisso no mesmo dia é Alta', () => {
    expect(classifyPriority({ ...base, deadlineToday: true }).priority).toBe('high')
  })

  it('incidente que atrapalha mas tem alternativa é Média', () => {
    expect(classifyPriority(base).priority).toBe('medium')
  })

  it('equipe afetada mas trabalhando é Média, não Crítica', () => {
    expect(classifyPriority({ ...base, affected: 'team' }).priority).toBe('medium')
  })

  it('requisição sem urgência é Baixa', () => {
    expect(classifyPriority({ ...base, type: 'REQ' }).priority).toBe('low')
  })

  it('devolve o id da regra para o trace', () => {
    expect(classifyPriority({ ...base, blocksWork: true }).ruleId).toBe(
      'PRIORITY_HIGH_PERSON_STOPPED',
    )
  })
})
