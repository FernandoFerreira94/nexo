import type { LanguageModelV4StreamPart } from '@ai-sdk/provider'
import type { StreamEvent } from '@nexo/shared'
import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { loadAgentConfig } from './config'
import { runTurn, type TurnResult } from './run-turn'
import { CircuitBreaker } from './tickets-client/circuit-breaker'
import { createTicketsClient } from './tickets-client/client'
import { createMockDecisionEngine } from './understanding'

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
}

function modelThatStreams(chunks: LanguageModelV4StreamPart[]) {
  return new MockLanguageModelV4({
    doStream: async () => ({ stream: simulateReadableStream({ chunks }) }),
  })
}

async function run(model: MockLanguageModelV4) {
  const tickets = createTicketsClient({
    baseUrl: 'http://tickets',
    serviceToken: 't',
    breaker: new CircuitBreaker(),
    fetchFn: (async () => Response.json([])) as unknown as typeof fetch,
    sleep: async () => {},
  })
  const turn = runTurn({
    config: loadAgentConfig({ LLM_PROVIDER: 'mock' }),
    model,
    decision: createMockDecisionEngine(),
    tickets,
    requesterId: 'u_ana',
    userName: 'Ana Souza',
    text: 'Como faço para trocar minha senha?',
    history: [],
    pendingDraft: null,
  })
  const events: StreamEvent[] = []
  let step = await turn.next()
  while (!step.done) {
    events.push(step.value)
    step = await turn.next()
  }
  return { events, result: step.value as TurnResult }
}

describe('runTurn: falhas do modelo', () => {
  it('modelo fora do ar: avisa sem culpar o sistema de chamados', async () => {
    const { events, result } = await run(
      modelThatStreams([{ type: 'error', error: new Error('provider down') }]),
    )
    expect(result.trace.rulesApplied).toContain('LLM_STREAM_FAILED')
    expect(result.text).toMatch(/problema para responder/)
    expect(events.some((e) => e.type === 'notice')).toBe(false)
    expect(result.trace.confidence).toBeLessThan(0.6)
  })

  it('modelo sem texto: nunca salva resposta vazia', async () => {
    const { result } = await run(
      modelThatStreams([
        { type: 'finish', usage, finishReason: { unified: 'stop', raw: undefined } },
      ]),
    )
    expect(result.text.trim()).not.toBe('')
    expect(result.trace.rulesApplied).toContain('EMPTY_REPLY_FALLBACK')
  })
})
