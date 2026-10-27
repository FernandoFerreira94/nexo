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

/** Valor de TICKETS_SERVICE_URL que liga o serviço de chamados dentro deste processo (Vercel). */
export const EMBEDDED_TICKETS = 'embedded'

export async function createRuntime(
  env: Record<string, string | undefined> = process.env,
): Promise<Runtime> {
  const config = loadAgentConfig(env)
  const model = createChatModel(config)
  const authSecret = env.AUTH_SECRET
  if (!authSecret) throw new Error('AUTH_SECRET não definido (veja o .env.example).')

  // Local: arquivo SQLite. Vercel: Turso (a integração da Vercel cria estas duas variáveis).
  const dbUrl = env.TURSO_DATABASE_URL ?? env.APP_DB_PATH ?? DEFAULT_APP_DB_PATH
  const dbToken = env.TURSO_AUTH_TOKEN

  return {
    db: await openAppDb(dbUrl, dbToken),
    config,
    model,
    decision: createDecisionEngine(config, model),
    tickets: createTicketsClient({
      baseUrl: config.ticketsServiceUrl === EMBEDDED_TICKETS ? 'http://tickets.internal' : config.ticketsServiceUrl,
      serviceToken: config.ticketsServiceToken,
      breaker: new CircuitBreaker(),
      fetchFn: config.ticketsServiceUrl === EMBEDDED_TICKETS ? await embeddedFetch(env, config) : undefined,
    }),
    authSecret,
  }
}

/** Sobe o serviço de chamados no mesmo processo, no mesmo banco (tabelas diferentes). */
async function embeddedFetch(env: Record<string, string | undefined>, config: AgentConfig) {
  const { createEmbeddedTicketsService } = await import('@nexo/tickets-service/embedded')
  const service = await createEmbeddedTicketsService({
    url: env.TURSO_DATABASE_URL ?? env.TICKETS_DB_PATH ?? DEFAULT_APP_DB_PATH,
    authToken: env.TURSO_AUTH_TOKEN,
    serviceToken: config.ticketsServiceToken,
    failureRate: Number(env.TICKETS_FAILURE_RATE ?? 0),
  })
  return service.fetchFn
}

// O `next dev` recarrega módulos a cada edição; guardar no globalThis evita abrir
// o banco e recriar o circuit breaker toda hora. Guarda a promessa: chamadas
// simultâneas no primeiro acesso esperam a mesma inicialização.
const globalRuntime = globalThis as unknown as { __nexoRuntime?: Promise<Runtime> }

export function getRuntime(): Promise<Runtime> {
  globalRuntime.__nexoRuntime ??= createRuntime().catch((error: unknown) => {
    globalRuntime.__nexoRuntime = undefined
    throw error
  })
  return globalRuntime.__nexoRuntime
}
