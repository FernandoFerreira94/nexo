import type { Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import * as schema from './schema'

export type TicketsDb = LibSQLDatabase<typeof schema>

/**
 * Abre o banco e garante que as tabelas existem. Aceita:
 * - um caminho de arquivo (local, `pnpm dev`);
 * - `:memory:` (testes);
 * - uma URL `libsql://` do Turso (produção na Vercel), com `authToken`.
 */
export async function openTicketsDb(url: string, authToken?: string): Promise<TicketsDb> {
  const client = await connect(url, authToken)
  await client.executeMultiple(schema.CREATE_TABLES_SQL)
  return drizzle(client, { schema })
}

/** Caminho de arquivo vira `file:`; `:memory:` e URLs remotas passam direto. */
export function toLibsqlUrl(url: string): string {
  if (url === ':memory:' || /^[a-z]+:/.test(url)) return url
  mkdirSync(dirname(url), { recursive: true })
  return `file:${url}`
}

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
