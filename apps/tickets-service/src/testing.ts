import { createApp } from './app'
import { createChaos } from './chaos'
import { openTicketsDb } from './db/client'
import { seedTickets } from './db/seed'

/**
 * Serviço de chamados em memória, com a semente, para testes e evals de outros pacotes.
 * O `fetchFn` chama o app direto, sem abrir porta.
 */
export async function createInMemoryTicketsService(now: Date, serviceToken = 'test-token') {
  const db = await openTicketsDb(':memory:')
  await seedTickets(db, now)
  const chaos = createChaos(0)
  const app = createApp({ db, chaos, serviceToken, now: () => now })
  const fetchFn = ((url: string | URL | Request, init?: RequestInit) =>
    app.request(String(url), init)) as typeof fetch
  return { app, chaos, fetchFn, serviceToken }
}
