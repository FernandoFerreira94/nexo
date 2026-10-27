import { z } from 'zod'

/**
 * Toda configuração do agent num lugar só, lida do ambiente e validada.
 * Para trocar de modelo na entrega: mude LLM_MODEL (e os preços) no .env.
 */
const EnvSchema = z.object({
  LLM_PROVIDER: z.enum(['mock', 'openrouter']).default('mock'),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('anthropic/claude-haiku-5.5'),
  /** Preço em US$ por milhão de tokens, para mostrar o custo por conversa. */
  LLM_PRICE_INPUT_PER_MTOK: z.coerce.number().default(0.1),
  LLM_PRICE_OUTPUT_PER_MTOK: z.coerce.number().default(0.5),
  DECISION_PROVIDER: z.enum(['llm', 'jev']).default('llm'),
  DECISION_MODEL: z.string().default('typesafe/jev-1.13'),
  CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
  SESSION_MESSAGE_LIMIT: z.coerce.number().int().positive().default(30),
  SESSION_MESSAGE_WARN_AT: z.coerce.number().int().positive().default(25),
  TICKETS_SERVICE_URL: z.string().default('http://localhost:4010'),
  TICKETS_SERVICE_TOKEN: z.string().default('troque-este-token-local'),
})

export type AgentConfig = {
  llmProvider: 'mock' | 'openrouter'
  llmApiKey: string | undefined
  llmModel: string
  priceInputPerMTok: number
  priceOutputPerMTok: number
  decisionProvider: 'llm' | 'jev'
  decisionModel: string
  confidenceThreshold: number
  messageLimit: number
  messageWarnAt: number
  ticketsServiceUrl: string
  ticketsServiceToken: string
  /** Máximo de passos do loop de tools por resposta (orçamento do agent). */
  maxSteps: number
  /** Quantas mensagens anteriores vão como contexto para o modelo. */
  historyWindow: number
}

export function loadAgentConfig(
  env: Record<string, string | undefined> = process.env,
): AgentConfig {
  const parsed = EnvSchema.parse(env)
  if (parsed.LLM_PROVIDER === 'openrouter' && !parsed.LLM_API_KEY) {
    throw new Error('LLM_PROVIDER=openrouter exige LLM_API_KEY (ou use LLM_PROVIDER=mock).')
  }
  return {
    llmProvider: parsed.LLM_PROVIDER,
    llmApiKey: parsed.LLM_API_KEY,
    llmModel: parsed.LLM_PROVIDER === 'mock' ? 'mock' : parsed.LLM_MODEL,
    priceInputPerMTok: parsed.LLM_PRICE_INPUT_PER_MTOK,
    priceOutputPerMTok: parsed.LLM_PRICE_OUTPUT_PER_MTOK,
    decisionProvider: parsed.DECISION_PROVIDER,
    decisionModel: parsed.DECISION_MODEL,
    confidenceThreshold: parsed.CONFIDENCE_THRESHOLD,
    messageLimit: parsed.SESSION_MESSAGE_LIMIT,
    messageWarnAt: parsed.SESSION_MESSAGE_WARN_AT,
    ticketsServiceUrl: parsed.TICKETS_SERVICE_URL,
    ticketsServiceToken: parsed.TICKETS_SERVICE_TOKEN,
    maxSteps: 4,
    historyWindow: 12,
  }
}

export function costUsd(config: AgentConfig, inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * config.priceInputPerMTok) / 1_000_000 +
    (outputTokens * config.priceOutputPerMTok) / 1_000_000
  )
}
