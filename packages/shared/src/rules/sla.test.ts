import { describe, expect, it } from 'vitest'
import { addBusinessMinutes, computeDueAt } from './sla'
import { canReopen, isOverdue } from './ticket-rules'

// Datas escritas em horário de São Paulo (-03:00) para o teste ler como o PRD.
const sp = (iso: string) => new Date(`${iso}-03:00`)

describe('computeDueAt', () => {
  it('Crítica conta 1 hora corrida, mesmo de madrugada no domingo', () => {
    expect(computeDueAt(sp('2026-11-01T02:30:00'), 'critical')).toEqual(sp('2026-11-01T03:30:00'))
  })

  it('Alta soma 4 horas úteis dentro do mesmo dia', () => {
    expect(computeDueAt(sp('2026-10-27T09:00:00'), 'high')).toEqual(sp('2026-10-27T13:00:00'))
  })

  it('Alta aberta às 16h termina às 10h do dia útil seguinte', () => {
    expect(computeDueAt(sp('2026-10-27T16:00:00'), 'high')).toEqual(sp('2026-10-28T10:00:00'))
  })

  it('aberto fora do horário começa a contar às 8h', () => {
    expect(computeDueAt(sp('2026-10-27T20:00:00'), 'high')).toEqual(sp('2026-10-28T12:00:00'))
    expect(computeDueAt(sp('2026-10-27T06:00:00'), 'high')).toEqual(sp('2026-10-27T12:00:00'))
  })

  it('cruza o fim de semana: sexta 17h + 4h úteis = segunda 11h', () => {
    expect(computeDueAt(sp('2026-10-30T17:00:00'), 'high')).toEqual(sp('2026-11-02T11:00:00'))
  })

  it('aberto no sábado começa na segunda às 8h', () => {
    expect(computeDueAt(sp('2026-10-31T10:00:00'), 'high')).toEqual(sp('2026-11-02T12:00:00'))
  })

  it('Média = 3 dias úteis; Baixa = 5 dias úteis (mesmo horário)', () => {
    expect(computeDueAt(sp('2026-10-27T10:00:00'), 'medium')).toEqual(sp('2026-10-30T10:00:00'))
    expect(computeDueAt(sp('2026-10-27T10:00:00'), 'low')).toEqual(sp('2026-11-03T10:00:00'))
  })

  it('terminar exatamente às 18h não pula para o dia seguinte', () => {
    expect(addBusinessMinutes(sp('2026-10-27T14:00:00'), 240)).toEqual(sp('2026-10-27T18:00:00'))
  })
})

describe('isOverdue', () => {
  const dueAt = sp('2026-10-27T12:00:00').toISOString()

  it('aberto e com prazo passado está vencido', () => {
    expect(isOverdue({ status: 'awaiting_analyst', dueAt }, sp('2026-10-27T12:01:00'))).toBe(true)
  })

  it('dentro do prazo não está vencido', () => {
    expect(isOverdue({ status: 'open', dueAt }, sp('2026-10-27T11:59:00'))).toBe(false)
  })

  it('resolvido nunca vence', () => {
    expect(isOverdue({ status: 'resolved', dueAt }, sp('2026-11-27T12:00:00'))).toBe(false)
  })
})

describe('canReopen', () => {
  const now = sp('2026-10-27T12:00:00')

  it('resolvido há 4 dias pode reabrir', () => {
    const resolvedAt = sp('2026-10-23T12:00:00').toISOString()
    expect(canReopen({ status: 'resolved', resolvedAt }, now)).toEqual({ allowed: true })
  })

  it('resolvido há exatamente 7 dias ainda pode', () => {
    const resolvedAt = sp('2026-10-20T12:00:00').toISOString()
    expect(canReopen({ status: 'resolved', resolvedAt }, now).allowed).toBe(true)
  })

  it('resolvido há 8 dias não pode', () => {
    const resolvedAt = sp('2026-10-19T12:00:00').toISOString()
    expect(canReopen({ status: 'resolved', resolvedAt }, now).allowed).toBe(false)
  })

  it('chamado aberto ou fechado não reabre', () => {
    expect(canReopen({ status: 'open', resolvedAt: null }, now).allowed).toBe(false)
    expect(canReopen({ status: 'closed', resolvedAt: now.toISOString() }, now).allowed).toBe(false)
  })
})
