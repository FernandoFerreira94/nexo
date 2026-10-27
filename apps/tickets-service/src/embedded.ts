import { eq } from 'drizzle-orm'
import { createApp } from './app'
import { createChaos } from './chaos'
import { openTicketsDb } from './db/client'
import { tickets } from './db/schema'
import { seedTickets } from './db/seed'

const DAY = 24 * 60 * 60 * 1000
/** Chamado da semente aberto "há 3 horas": a idade dele diz há quanto tempo a semente foi feita. */
const SEED_MARKER_ID = 'INC-20352'

type EmbeddedOptions = {
  url: string
  authToken?: string
  serviceToken: string
  failureRate: number
}

/**
 * O serviço de chamados rodando dentro do processo do app web (deploy na Vercel, que não
 * mantém um segundo servidor de pé). O app continua falando com ele por HTTP: o `fetchFn`
 * entrega a requisição direto ao Hono, sem abrir porta. A fronteira e o contrato não mudam.
 */
export async function createEmbeddedTicketsService(options: EmbeddedOptions) {
  const db = await openTicketsDb(options.url, options.authToken)
  await refreshSeedIfStale(db)
  const chaos = createChaos(options.failureRate)
  const app = createApp({ db, chaos, serviceToken: options.serviceToken })
  const fetchFn = ((url: string | URL | Request, init?: RequestInit) =>
    app.request(String(url), init)) as typeof fetch
  return { app, chaos, fetchFn }
}

/**
 * Os dados de exemplo usam datas relativas a "agora" (chamado vencido, resolvido há 4 dias...).
 * Numa demo publicada eles envelhecem; por isso a semente é refeita quando passa de um dia.
 */
async function refreshSeedIfStale(db: Awaited<ReturnType<typeof openTicketsDb>>) {
  const marker = await db
    .select({ createdAt: tickets.createdAt })
    .from(tickets)
    .where(eq(tickets.id, SEED_MARKER_ID))
    .get()
  const isStale = !marker || Date.now() - new Date(marker.createdAt).getTime() > DAY
  if (isStale) await seedTickets(db)
}
