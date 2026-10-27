import { describe, expect, it } from 'vitest'
import type { Ticket } from '@nexo/shared'
import { searchArticles, STRONG_MATCH_SCORE } from '../knowledge/search'
import { checkScope } from './scope'
import { findSimilarOpenTicket } from './duplicate'
import { computeConfidence } from './confidence'
import { decideHandoff } from './handoff'
import { checkMessageLimit } from './message-limit'

describe('searchArticles', () => {
  it('acha o artigo da VPN 809 com força', () => {
    const [best] = searchArticles('minha VPN dá erro 809 no Windows 10')
    expect(best?.article.id).toBe('KB-001')
    expect(best!.score).toBeGreaterThanOrEqual(STRONG_MATCH_SCORE)
  })

  it('acha o horário do service desk', () => {
    expect(searchArticles('qual o horário de atendimento do service desk?')[0]?.article.id).toBe(
      'KB-002',
    )
  })

  it('não inventa match para assunto sem artigo', () => {
    expect(searchArticles('quero um mouse vertical')).toEqual([])
  })
})

describe('checkScope', () => {
  it('RH, financeiro e facilities ficam fora do escopo', () => {
    expect(checkScope('Quando caem minhas férias?')).toMatchObject({ inScope: false, area: 'RH' })
    expect(checkScope('preciso de reembolso do táxi')).toMatchObject({
      inScope: false,
      area: 'Financeiro',
    })
    expect(checkScope('o ar-condicionado da sala parou')).toMatchObject({
      inScope: false,
      area: 'Facilities',
    })
  })

  it('assuntos de TI ficam dentro', () => {
    expect(checkScope('não consigo acessar o SAP')).toEqual({ inScope: true })
    expect(checkScope('o ponto de rede da minha mesa não funciona')).toEqual({ inScope: true })
  })
})

const ticket = (overrides: Partial<Ticket>): Ticket => ({
  id: 'INC-1',
  type: 'INC',
  title: 'Teams sem áudio nas reuniões',
  description: 'Ninguém me ouve no Teams.',
  category: 'software',
  priority: 'medium',
  status: 'open',
  requesterId: 'u_ana',
  affected: 'one',
  createdAt: '2026-10-27T10:00:00.000Z',
  updatedAt: '2026-10-27T10:00:00.000Z',
  slaStartAt: '2026-10-27T10:00:00.000Z',
  dueAt: '2026-10-30T10:00:00.000Z',
  resolvedAt: null,
  comments: [],
  ...overrides,
})

describe('findSimilarOpenTicket', () => {
  it('acha o chamado aberto sobre o mesmo problema', () => {
    const match = findSimilarOpenTicket([ticket({})], {
      category: 'software',
      text: 'o áudio do Teams não funciona nas reuniões',
    })
    expect(match?.ticket.id).toBe('INC-1')
  })

  it('ignora chamado resolvido e categoria diferente', () => {
    const problem = { category: 'software' as const, text: 'Teams sem áudio nas reuniões' }
    expect(findSimilarOpenTicket([ticket({ status: 'resolved' })], problem)).toBeNull()
    expect(findSimilarOpenTicket([ticket({ category: 'hardware' })], problem)).toBeNull()
  })

  it('assunto diferente não é duplicado', () => {
    expect(
      findSimilarOpenTicket([ticket({})], {
        category: 'software',
        text: 'Excel fecha sozinho ao salvar',
      }),
    ).toBeNull()
  })
})

describe('computeConfidence', () => {
  it('usa a confiança do modelo quando nenhum teto se aplica', () => {
    const result = computeConfidence({
      modelConfidence: 0.9,
      modelReason: 'pedido claro',
      intent: 'question',
    })
    expect(result.value).toBe(0.9)
  })

  it('intenção desconhecida limita a 0,3', () => {
    const result = computeConfidence({ modelConfidence: 0.95, modelReason: 'x', intent: 'unknown' })
    expect(result.value).toBe(0.3)
    expect(result.capsApplied).toContain('CONFIDENCE_CAP_UNKNOWN_INTENT')
  })

  it('falha de tool limita a 0,4', () => {
    expect(
      computeConfidence({
        modelConfidence: 0.9,
        modelReason: 'x',
        intent: 'ticket_status',
        toolFailed: true,
      }).value,
    ).toBe(0.4)
  })
})

describe('decideHandoff', () => {
  const base = { intent: 'question' as const, isCritical: false, confidence: 0.9, threshold: 0.6 }

  it('pedido explícito transfere', () => {
    expect(decideHandoff({ ...base, intent: 'talk_to_human' })?.reason).toBe('requested')
  })

  it('caso crítico transfere', () => {
    expect(decideHandoff({ ...base, isCritical: true })?.reason).toBe('critical')
  })

  it('confiança abaixo do limiar transfere', () => {
    expect(decideHandoff({ ...base, confidence: 0.5 })?.reason).toBe('low_confidence')
  })

  it('confiança no limiar não transfere', () => {
    expect(decideHandoff({ ...base, confidence: 0.6 })).toBeNull()
  })

  it('saudação com baixa confiança não transfere', () => {
    expect(decideHandoff({ ...base, intent: 'greeting', confidence: 0.2 })).toBeNull()
  })
})

describe('checkMessageLimit', () => {
  it('ok, aviso e bloqueio', () => {
    expect(checkMessageLimit(10, 30, 25)).toEqual({ status: 'ok', remaining: 20 })
    expect(checkMessageLimit(25, 30, 25)).toEqual({ status: 'warn', remaining: 5 })
    expect(checkMessageLimit(30, 30, 25)).toEqual({ status: 'blocked', remaining: 0 })
  })
})
