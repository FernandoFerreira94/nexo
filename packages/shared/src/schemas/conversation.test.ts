import { describe, expect, it } from 'vitest'
import { DecisionTrace, StreamEvent } from './conversation'

const trace = {
  understood: { intent: 'new_issue', entities: { categoria: 'network' }, summary: 'VPN caiu' },
  actions: [
    {
      tool: 'classifyPriority',
      label: 'classificou a prioridade',
      input: { affected: 'team' },
      outputSummary: 'alta',
      status: 'ok',
      durationMs: 3,
    },
  ],
  confidence: 0.82,
  confidenceReason: 'pedido claro',
  rationale: 'Problema de rede afetando a equipe.',
  rulesApplied: ['prioridade = impacto × urgência'],
  handoff: null,
  tokens: { input: 1200, output: 90 },
  costUsd: 0.0002,
  model: 'mock',
  latencyMs: 640,
}

describe('DecisionTrace', () => {
  it('aceita um trace completo', () => {
    expect(DecisionTrace.parse(trace)).toEqual(trace)
  })

  it('recusa confiança fora de 0..1', () => {
    expect(DecisionTrace.safeParse({ ...trace, confidence: 1.4 }).success).toBe(false)
  })

  it('recusa intent e motivo de transferência desconhecidos', () => {
    const intent = { ...trace, understood: { ...trace.understood, intent: 'pedir_pizza' } }
    expect(DecisionTrace.safeParse(intent).success).toBe(false)
    expect(DecisionTrace.safeParse({ ...trace, handoff: 'cansado' }).success).toBe(false)
  })

  it('exige os campos de custo e latência', () => {
    const { costUsd: _cost, ...semCusto } = trace
    expect(DecisionTrace.safeParse(semCusto).success).toBe(false)
  })
})

describe('StreamEvent', () => {
  it('lê o trace e o fim do streaming', () => {
    expect(StreamEvent.parse({ type: 'trace', trace }).type).toBe('trace')
    expect(StreamEvent.parse({ type: 'done', messageId: null }).type).toBe('done')
  })

  it('recusa tipo de evento desconhecido', () => {
    expect(StreamEvent.safeParse({ type: 'hack', text: 'x' }).success).toBe(false)
  })
})
