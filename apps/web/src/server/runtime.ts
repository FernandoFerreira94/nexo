import {
  CircuitBreaker,
  createChatModel,
  createDecisionEngine,
  createTicketsClient,
  loadAgentConfig,
  type AgentConfig,
  type DecisionEngine,
  type LanguageModel,
  type TicketsClient,
} from '@nexo/agent'
import { DEFAULT_APP_DB_PATH, openAppDb, type AppDb } from './db/client'

/** Tudo que o servidor precisa, criado uma vez por processo. */
export type Runtime = {
  db: AppDb
  config: AgentConfig
  model: LanguageModel
  decision: DecisionEngine
  tickets: TicketsClient
  authSecret: string
}

export function createRuntime(env: Record<string, string | undefined> = process.env): Runtime {
  const config = loadAgentConfig(env)
  const model = createChatModel(config)
  const authSecret = env.AUTH_SECRET
  if (!authSecret) throw new Error('AUTH_SECRET não definido (veja o .env.example).')
  return {
    db: openAppDb(env.APP_DB_PATH ?? DEFAULT_APP_DB_PATH),
    config,
    model,
    decision: createDecisionEngine(config, model),
    tickets: createTicketsClient({
      baseUrl: config.ticketsServiceUrl,
      serviceToken: config.ticketsServiceToken,
      breaker: new CircuitBreaker(),
    }),
    authSecret,
  }
}

// O `next dev` recarrega módulos a cada edição; guardar no globalThis evita abrir
// o banco e recriar o circuit breaker toda hora.
const globalRuntime = globalThis as unknown as { __nexoRuntime?: Runtime }

export function getRuntime(): Runtime {
  globalRuntime.__nexoRuntime ??= createRuntime()
  return globalRuntime.__nexoRuntime
}
