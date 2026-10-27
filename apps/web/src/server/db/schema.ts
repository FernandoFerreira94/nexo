import type { Card, DecisionTrace, Draft, QuickReply } from '@nexo/shared'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Banco do app (separado do sistema de chamados). Guarda quem é quem, as conversas,
 * as mensagens, os rascunhos pendentes e o trace de cada resposta do agent.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role', { enum: ['employee', 'analyst'] }).notNull(),
  department: text('department').notNull(),
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  status: text('status', {
    enum: ['with_agent', 'waiting_analyst', 'with_analyst', 'closed'],
  }).notNull(),
  handoffReason: text('handoff_reason', {
    enum: ['requested', 'critical', 'overdue', 'low_confidence', 'message_limit'],
  }),
  handoffSummary: text('handoff_summary'),
  handoffAt: text('handoff_at'),
  assignedAnalystId: text('assigned_analyst_id'),
  /** Chamados vencidos vistos na conversa: o console destaca mesmo sem transferência. */
  overdueTicketIds: text('overdue_ticket_ids', { mode: 'json' }).$type<string[]>().notNull(),
  employeeMessageCount: integer('employee_message_count').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  role: text('role', { enum: ['employee', 'agent', 'analyst', 'system'] }).notNull(),
  authorId: text('author_id'),
  content: text('content').notNull(),
  cards: text('cards', { mode: 'json' }).$type<Card[]>().notNull(),
  quickReplies: text('quick_replies', { mode: 'json' }).$type<QuickReply[]>().notNull(),
  traceId: text('trace_id'),
  createdAt: text('created_at').notNull(),
})

/** Um trace por resposta do agent: o que entendeu, o que fez, confiança, regras e custo. */
export const decisionTraces = sqliteTable('decision_traces', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  data: text('data', { mode: 'json' }).$type<DecisionTrace>().notNull(),
  createdAt: text('created_at').notNull(),
})

export const drafts = sqliteTable('drafts', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  data: text('data', { mode: 'json' }).$type<Draft>().notNull(),
  /** Chamado criado/alterado na confirmação. */
  resultTicketId: text('result_ticket_id'),
  updatedAt: text('updated_at').notNull(),
})

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  handoff_reason TEXT,
  handoff_summary TEXT,
  handoff_at TEXT,
  assigned_analyst_id TEXT,
  overdue_ticket_ids TEXT NOT NULL,
  employee_message_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations (user_id);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  author_id TEXT,
  content TEXT NOT NULL,
  cards TEXT NOT NULL,
  quick_replies TEXT NOT NULL,
  trace_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at);
CREATE TABLE IF NOT EXISTS decision_traces (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  data TEXT NOT NULL,
  result_ticket_id TEXT,
  updated_at TEXT NOT NULL
);
`
