import { SEED_USERS } from '@nexo/shared'
import type { Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as schema from './schema'

export type AppDb = LibSQLDatabase<typeof schema>

/**
 * Abre o banco do app, cria as tabelas e garante os usuários do seed. Aceita um caminho de
 * arquivo (local), `:memory:` (testes) ou uma URL `libsql://` do Turso (Vercel) com `authToken`.
 */
export async function openAppDb(url: string, authToken?: string): Promise<AppDb> {
  const client = await connect(url, authToken)
  await client.executeMultiple(schema.CREATE_TABLES_SQL)
  const db = drizzle(client, { schema })
  await db
    .insert(schema.users)
    .values([...SEED_USERS])
    .onConflictDoNothing()
    .run()
  return db
}

function toLibsqlUrl(url: string): string {
  if (url === ':memory:' || /^[a-z]+:/.test(url)) return url
  mkdirSync(dirname(url), { recursive: true })
  return `file:${url}`
}

/** `pnpm dev` roda dentro de apps/web, então o banco fica em <raiz>/data/app.db. */
export const DEFAULT_APP_DB_PATH = resolve(process.cwd(), '../../data/app.db')

/**
 * Banco remoto (Turso: `libsql://`, `https://`) usa o cliente web, só HTTP, sem binário nativo:
 * na Vercel não depende de o binário do libsql ir junto na função. Arquivo e `:memory:` usam o
 * cliente Node.
 */
async function connect(url: string, authToken?: string): Promise<Client> {
  if (/^(libsql|https?|wss?):/.test(url)) {
    const { createClient } = await import('@libsql/client/web')
    return createClient({ url, authToken })
  }
  const { createClient } = await import('@libsql/client')
  return createClient({ url: toLibsqlUrl(url), authToken })
}
