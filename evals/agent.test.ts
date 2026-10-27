import { createChatModel, createMockDecisionEngine, loadAgentConfig } from '@nexo/agent'
import { describe, expect, it } from 'vitest'
import { runScenario } from './harness'
import { SCENARIOS } from './scenarios'

/** Os cenários com o modelo mock: rápidos, sem custo, rodam no CI a cada commit. */
const config = loadAgentConfig({ LLM_PROVIDER: 'mock' })
const deps = { config, model: createChatModel(config), decision: createMockDecisionEngine() }

describe('cenários do agent (modelo mock)', () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.id}: ${scenario.title}`, async () => {
      const run = await runScenario(scenario, deps)
      expect(run.failures).toEqual([])
    })
  }
})
