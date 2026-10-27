import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import * as schema from './schema'

export type TicketsDb = BetterSQLite3Database<typeof schema>

/** Abre o banco (arquivo ou ':memory:' nos testes) e garante que as tabelas existem. */
export function openTicketsDb(path: string): TicketsDb {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.exec(schema.CREATE_TABLES_SQL)
  return drizzle(sqlite, { schema })
}

export const DEFAULT_DB_PATH = new URL('../../../../data/tickets.db', import.meta.url).pathname
