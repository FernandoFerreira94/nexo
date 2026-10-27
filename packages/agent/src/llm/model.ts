import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'
import type { AgentConfig } from '../config'
import { createMockChatModel } from './mock-model'

/**
 * Único lugar que escolhe o modelo. Trocar de modelo = mudar LLM_MODEL no .env.
 * OpenRouter dá acesso a vários fornecedores com uma chave só.
 */
export function createChatModel(config: AgentConfig): LanguageModel {
  if (config.llmProvider === 'mock') return createMockChatModel()
  const openrouter = createOpenRouter({ apiKey: config.llmApiKey })
  return openrouter.chat(config.llmModel)
}
