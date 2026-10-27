import { DEFAULT_APP_DB_PATH, openAppDb } from './client'
import { conversations, decisionTraces, drafts, messages } from './schema'

// pnpm db:setup → cria as tabelas e os usuários
// pnpm db:reset → apaga conversas, mensagens e rascunhos (os usuários ficam)
const db = await openAppDb(process.env.APP_DB_PATH ?? DEFAULT_APP_DB_PATH)
if (process.argv.includes('--reset')) {
  await db.delete(messages).run()
  await db.delete(decisionTraces).run()
  await db.delete(drafts).run()
  await db.delete(conversations).run()
  console.warn('[web] conversas apagadas')
} else {
  console.warn('[web] banco do app pronto')
}
