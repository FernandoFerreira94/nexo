import { createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from './schema'

export type TicketsDb = LibSQLDatabase<typeof schema>

/**
 * Abre o banco e garante que as tabelas existem. Aceita:
 * - um caminho de arquivo (local, `pnpm dev`);
 * - `:memory:` (testes);
 * - uma URL `libsql://` do Turso (produção na Vercel), com `authToken`.
 */
export async function openTicketsDb(url: string, authToken?: string): Promise<TicketsDb> {
  const client = createClient({ url: toLibsqlUrl(url), authToken })
  await client.executeMultiple(schema.CREATE_TABLES_SQL)
  return drizzle(client, { schema })
}

/** Caminho de arquivo vira `file:`; `:memory:` e URLs remotas passam direto. */
export function toLibsqlUrl(url: string): string {
  if (url === ':memory:' || /^[a-z]+:/.test(url)) return url
  mkdirSync(dirname(url), { recursive: true })
  return `file:${url}`
}

export const DEFAULT_DB_PATH = fileURLToPath(
  new URL('../../../../data/tickets.db', import.meta.url),
)
