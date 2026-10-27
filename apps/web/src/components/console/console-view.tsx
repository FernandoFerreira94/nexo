'use client'

import {
  CONVERSATION_STATUS_LABELS,
  HANDOFF_REASON_LABELS,
  HANDOFF_REASONS,
  type HandoffReason,
  type TicketSummary,
} from '@nexo/shared'
import { useCallback, useEffect, useState } from 'react'
import { MessageCard, TicketList } from '@/components/chat/cards'
import { ActionLine, TracePanel } from '@/components/chat/trace-panel'
import { Badge, type Tone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api, logout } from '@/lib/api'
import { formatTime, formatWait } from '@/lib/format'
import type { ChatMessage } from '@/lib/types'
import type { Conversation } from '@/server/conversations'

type QueueItem = Conversation & { userName: string; department: string }
type QueueResponse = { queue: QueueItem[]; ticketsService: 'closed' | 'open' }
type DetailResponse = {
  conversation: Conversation
  employee: { name: string; email: string; department: string } | null
  messages: ChatMessage[]
  tickets: TicketSummary[] | null
}

const REASON_TONE: Record<HandoffReason, Tone> = {
  critical: 'danger',
  overdue: 'danger',
  requested: 'brand',
  low_confidence: 'warn',
  message_limit: 'neutral',
}

type StatusFilter = 'all' | 'waiting_analyst' | 'with_analyst'

export function ConsoleView({
  analyst,
}: {
  analyst: { id: string; name: string; department: string }
}) {
  const [queue, setQueue] = useState<QueueResponse | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailResponse | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [reasonFilter, setReasonFilter] = useState<HandoffReason | 'all'>('all')
  const [error, setError] = useState<string | null>(null)

  const loadQueue = useCallback(
    async () => setQueue(await api<QueueResponse>('/api/console/queue')),
    [],
  )
  const loadDetail = useCallback(async () => {
    if (selectedId) setDetail(await api<DetailResponse>(`/api/console/conversations/${selectedId}`))
  }, [selectedId])

  // Quase tempo real: consulta a fila e a conversa aberta a cada 3 segundos.
  useEffect(() => {
    const tick = () => {
      loadQueue().catch(() => {})
      loadDetail().catch(() => {})
    }
    tick()
    const timer = setInterval(tick, 3000)
    return () => clearInterval(timer)
  }, [loadQueue, loadDetail])

  const act = async (path: string, body?: unknown) => {
    setError(null)
    try {
      await api(path, { method: 'POST', body: body ?? {} })
      await Promise.all([loadQueue(), loadDetail()])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo deu errado.')
    }
  }

  const items = (queue?.queue ?? []).filter(
    (item) =>
      (statusFilter === 'all' || item.status === statusFilter) &&
      (reasonFilter === 'all' || item.handoffReason === reasonFilter),
  )

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-lg bg-brand font-bold text-white"
          >
            N
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Console do analista</p>
            <p className="text-xs text-ink-faint">
              {analyst.name} · {analyst.department}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={queue?.ticketsService === 'open' ? 'danger' : 'ok'}>
            Sistema de chamados {queue?.ticketsService === 'open' ? 'instável' : 'ok'}
          </Badge>
          <Button
            variant="secondary"
            size="sm"
            title="Demonstração: o sistema de chamados fica fora do ar por 20 segundos"
            onClick={() => act('/api/console/chaos', { downForSeconds: 20 })}
          >
            Simular queda
          </Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            Sair
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_340px]">
        <aside className="flex min-h-0 flex-col border-r border-line bg-surface">
          <div className="grid gap-2 border-b border-line p-3">
            <div className="flex gap-1">
              {(['all', 'waiting_analyst', 'with_analyst'] as const).map((value) => (
                <FilterChip
                  key={value}
                  active={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                >
                  {value === 'all' ? 'Todas' : CONVERSATION_STATUS_LABELS[value]}
                </FilterChip>
              ))}
            </div>
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value as HandoffReason | 'all')}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-sm"
              aria-label="Filtrar por motivo"
            >
              <option value="all">Todos os motivos</option>
              {HANDOFF_REASONS.map((r) => (
                <option key={r} value={r}>
                  {HANDOFF_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 && (
              <li className="p-6 text-center text-sm text-ink-faint">Nenhuma conversa na fila.</li>
            )}
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`grid w-full gap-1 border-b border-line px-3 py-3 text-left hover:bg-canvas ${
                    selectedId === item.id ? 'bg-brand-soft' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{item.userName}</span>
                    <span className="text-xs text-ink-faint">{formatWait(item.handoffAt)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {item.handoffReason && (
                      <Badge tone={REASON_TONE[item.handoffReason]}>
                        {HANDOFF_REASON_LABELS[item.handoffReason]}
                      </Badge>
                    )}
                    <Badge tone={item.status === 'with_analyst' ? 'ok' : 'neutral'}>
                      {CONVERSATION_STATUS_LABELS[item.status]}
                    </Badge>
                    {item.overdueTicketIds.length > 0 && <Badge tone="danger">Vencido</Badge>}
                  </div>
                  <p className="line-clamp-1 text-xs text-ink-soft">{item.department}</p>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="flex min-h-0 flex-col">
          {detail && selectedId ? (
            <ConversationPanel detail={detail} analystId={analyst.id} act={act} error={error} />
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-ink-faint">
              Selecione uma conversa da fila.
            </div>
          )}
        </section>

        <aside className="hidden min-h-0 overflow-y-auto border-l border-line bg-surface p-4 xl:block">
          {detail ? <EmployeePanel detail={detail} /> : null}
        </aside>
      </div>
    </div>
  )
}

function ConversationPanel({
  detail,
  analystId,
  act,
  error,
}: {
  detail: DetailResponse
  analystId: string
  act: (path: string, body?: unknown) => Promise<void>
  error: string | null
}) {
  const [reply, setReply] = useState('')
  const { conversation } = detail
  const base = `/api/console/conversations/${conversation.id}`
  const mine =
    conversation.status === 'with_analyst' && conversation.assignedAnalystId === analystId

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{detail.employee?.name}</p>
          <p className="text-xs text-ink-faint">
            {CONVERSATION_STATUS_LABELS[conversation.status]}
          </p>
        </div>
        <div className="flex gap-2">
          {conversation.status === 'waiting_analyst' && (
            <Button onClick={() => act(`${base}/assume`)}>Assumir</Button>
          )}
          {mine && (
            <>
              <Button variant="secondary" onClick={() => act(`${base}/return`)}>
                Devolver ao assistente
              </Button>
              <Button variant="danger" onClick={() => act(`${base}/close`)}>
                Encerrar
              </Button>
            </>
          )}
        </div>
      </div>

      {conversation.handoffSummary && (
        <div className="border-b border-line bg-warn-soft px-4 py-3 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warn">
            Resumo da transferência
          </p>
          <p className="whitespace-pre-wrap text-ink-soft">{conversation.handoffSummary}</p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <ul className="mx-auto grid max-w-2xl gap-4">
          {detail.messages.map((m) => (
            <li key={m.id}>
              {m.role === 'system' ? (
                <p className="text-center text-xs text-ink-faint">{m.content}</p>
              ) : (
                <div className="grid gap-2">
                  <p className="text-xs font-medium text-ink-faint">
                    {m.role === 'employee'
                      ? detail.employee?.name
                      : m.role === 'agent'
                        ? 'Assistente'
                        : 'Analista'}{' '}
                    · {formatTime(m.createdAt)}
                  </p>
                  {m.trace && <ActionLine actions={m.trace.actions} />}
                  <p
                    className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                      m.role === 'employee'
                        ? 'bg-brand-soft'
                        : m.role === 'analyst'
                          ? 'bg-warn-soft'
                          : 'border border-line bg-surface'
                    }`}
                  >
                    {m.content}
                  </p>
                  {m.cards.map((card, i) => (
                    <MessageCard key={i} card={card} />
                  ))}
                  {m.trace && <TracePanel trace={m.trace} />}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <form
        className="flex gap-2 border-t border-line bg-surface px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!reply.trim()) return
          void act(`${base}/reply`, { text: reply }).then(() => setReply(''))
        }}
      >
        <input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          disabled={!mine}
          aria-label="Resposta ao funcionário"
          placeholder={mine ? 'Responder ao funcionário…' : 'Assuma a conversa para responder'}
          className="h-10 flex-1 rounded-lg border border-line px-3 text-sm outline-none focus:border-brand disabled:bg-canvas"
        />
        <Button type="submit" disabled={!mine || !reply.trim()}>
          Enviar
        </Button>
      </form>
      {error && (
        <p role="alert" className="bg-surface px-4 pb-3 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  )
}

function EmployeePanel({ detail }: { detail: DetailResponse }) {
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Funcionário</p>
        <p className="mt-1 text-sm font-medium">{detail.employee?.name}</p>
        <p className="text-xs text-ink-soft">
          {detail.employee?.department} · {detail.employee?.email}
        </p>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Chamados
        </p>
        {detail.tickets === null ? (
          <p className="rounded-lg bg-warn-soft p-3 text-sm text-ink-soft">
            Sistema de chamados indisponível agora.
          </p>
        ) : detail.tickets.length === 0 ? (
          <p className="text-sm text-ink-faint">Nenhum chamado.</p>
        ) : (
          <TicketList tickets={detail.tickets} />
        )}
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${active ? 'bg-brand text-white' : 'bg-canvas text-ink-soft hover:text-ink'}`}
    >
      {children}
    </button>
  )
}
