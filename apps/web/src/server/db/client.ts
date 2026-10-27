import { SEED_USERS } from '@nexo/shared'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as schema from './schema'

export type AppDb = BetterSQLite3Database<typeof schema>

/** Abre o banco do app, cria as tabelas e garante os usuários do seed. */
export function openAppDb(path: string): AppDb {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.exec(schema.CREATE_TABLES_SQL)
  const db = drizzle(sqlite, { schema })
  db.insert(schema.users)
    .values([...SEED_USERS])
    .onConflictDoNothing()
    .run()
  return db
}

/** `pnpm dev` roda dentro de apps/web, então o banco fica em <raiz>/data/app.db. */
export const DEFAULT_APP_DB_PATH = resolve(process.cwd(), '../../data/app.db')
