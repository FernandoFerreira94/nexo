import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { TicketComment } from '@nexo/shared'

/** Banco do sistema de chamados (separado do banco do app para reforçar a fronteira). */
export const tickets = sqliteTable('tickets', {
  id: text('id').primaryKey(),
  number: integer('number').notNull(),
  type: text('type', { enum: ['INC', 'REQ'] }).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: text('category', {
    enum: ['access', 'network_vpn', 'hardware', 'software', 'email', 'other'],
  }).notNull(),
  priority: text('priority', { enum: ['critical', 'high', 'medium', 'low'] }).notNull(),
  status: text('status', {
    enum: ['open', 'awaiting_analyst', 'in_progress', 'approved', 'resolved', 'closed'],
  }).notNull(),
  requesterId: text('requester_id').notNull(),
  affected: text('affected', { enum: ['one', 'team', 'company'] }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  slaStartAt: text('sla_start_at').notNull(),
  dueAt: text('due_at').notNull(),
  resolvedAt: text('resolved_at'),
  comments: text('comments', { mode: 'json' }).$type<TicketComment[]>().notNull(),
})

/** Respostas já dadas por Idempotency-Key: um retry devolve o mesmo resultado sem duplicar. */
export const idempotencyKeys = sqliteTable('idempotency_keys', {
  key: text('key').primaryKey(),
  statusCode: integer('status_code').notNull(),
  responseBody: text('response_body').notNull(),
  createdAt: text('created_at').notNull(),
})

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  affected TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sla_start_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  resolved_at TEXT,
  comments TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tickets_requester_idx ON tickets (requester_id);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  status_code INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`
