import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createChaos } from './chaos'
import { DEFAULT_DB_PATH, openTicketsDb } from './db/client'

const port = Number(process.env.TICKETS_SERVICE_PORT ?? 4010)
const serviceToken = process.env.TICKETS_SERVICE_TOKEN
if (!serviceToken) throw new Error('TICKETS_SERVICE_TOKEN não definido (veja .env.example).')

const db = await openTicketsDb(process.env.TICKETS_DB_PATH ?? DEFAULT_DB_PATH)
const chaos = createChaos(Number(process.env.TICKETS_FAILURE_RATE ?? 0))
const app = createApp({ db, chaos, serviceToken })

serve({ fetch: app.fetch, port }, () => {
  console.warn(`[tickets-service] ouvindo em http://localhost:${port}`)
})
