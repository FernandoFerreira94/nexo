import { DEFAULT_DB_PATH, openTicketsDb } from './client'
import { tickets } from './schema'
import { seedTickets } from './seed'

// pnpm db:setup  → cria as tabelas e popula se estiver vazio
// pnpm db:reset  → apaga os chamados e popula de novo (datas relativas a agora)
const reset = process.argv.includes('--reset')
const db = await openTicketsDb(process.env.TICKETS_DB_PATH ?? DEFAULT_DB_PATH)
const isEmpty = (await db.select().from(tickets).limit(1).all()).length === 0

if (reset || isEmpty) {
  const count = await seedTickets(db)
  console.warn(`[tickets-service] seed aplicado: ${count} chamados`)
} else {
  console.warn('[tickets-service] banco já populado (use pnpm db:reset para recriar)')
}
