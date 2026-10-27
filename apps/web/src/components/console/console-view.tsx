'use client'

import {
  CONVERSATION_STATUS_LABELS,
  HANDOFF_REASON_LABELS,
  HANDOFF_REASONS,
  type HandoffReason,
  type TicketSummary,
} from '@nexo/shared'
import {
  ArrowLeft,
  UsersRound,
  CircleCheck,
  Clock,
  Inbox,
  RotateCcw,
  SendHorizontal,
  Server,
  TriangleAlert,
  UserRoundCheck,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCard, TicketList } from '@/components/chat/cards'
import { ActionLine, TracePanel } from '@/components/chat/trace-panel'
import { Logo, LogoMark } from '@/components/brand/logo'
import { UserAvatar } from '@/components/brand/user-avatar'
import { UserMenu } from '@/components/brand/user-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { formatTime, formatUsd, formatWait } from '@/lib/format'
import type { ChatMessage } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { Conversation } from '@/server/conversations'

type QueueItem = Conversation & { userName: string; department: string }
type QueueResponse = { queue: QueueItem[]; ticketsService: 'closed' | 'open' }
type DetailResponse = {
  conversation: Conversation
  employee: { name: string; email: string; department: string } | null
  messages: ChatMessage[]
  tickets: TicketSummary[] | null
}

type BadgeVariant = 'destructive' | 'warning' | 'info' | 'secondary'
const REASON_VARIANT: Record<HandoffReason, BadgeVariant> = {
  critical: 'destructive',
  overdue: 'destructive',
  requested: 'info',
  low_confidence: 'warning',
  message_limit: 'secondary',
}

type StatusFilter = 'all' | 'waiting_analyst' | 'with_analyst'
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'waiting_analyst', label: 'Na fila' },
  { value: 'with_analyst', label: 'Atendendo' },
]

type Analyst = { id: string; name: string; department: string }

export function ConsoleView({ analyst }: { analyst: Analyst }) {
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
      if (document.hidden) return // aba em segundo plano: não gasta requisições
      loadQueue().catch(() => {})
      loadDetail().catch(() => {})
    }
    tick()
    const timer = setInterval(tick, 3000)
    return () => clearInterval(timer)
  }, [loadQueue, loadDetail])

  /** Executa uma ação do analista. Devolve se deu certo (a resposta só é apagada nesse caso). */
  const act = async (path: string, body?: unknown): Promise<boolean> => {
    setError(null)
    try {
      await api(path, { method: 'POST', body: body ?? {} })
      await Promise.all([loadQueue(), loadDetail()])
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo deu errado.')
      return false
    }
  }

  const all = queue?.queue ?? []
  const items = all.filter(
    (item) =>
      (statusFilter === 'all' || item.status === statusFilter) &&
      (reasonFilter === 'all' || item.handoffReason === reasonFilter),
  )
  const serviceDown = queue?.ticketsService === 'open'

  return (
    <div className="grid h-dvh grid-cols-1 md:grid-cols-[300px_1fr] xl:grid-cols-[300px_1fr_340px]">
      {/* Fila */}
      {/* No celular, uma coluna por vez: a fila ou a conversa aberta. */}
      <aside
        className={cn(
          'flex min-h-0 flex-col bg-sidebar text-sidebar-foreground',
          selectedId && 'hidden md:flex',
        )}
      >
        <div className="px-5 pb-4 pt-5">
          <Logo inverted subtitle="Console do analista" />
        </div>

        <div className="grid grid-cols-3 gap-2 px-4">
          <Metric
            label="Na fila"
            value={all.filter((i) => i.status === 'waiting_analyst').length}
          />
          <Metric label="Atendendo" value={all.filter((i) => i.status === 'with_analyst').length} />
          <Metric
            label="Críticas"
            value={
              all.filter((i) => i.handoffReason === 'critical' || i.overdueTicketIds.length > 0)
                .length
            }
            alert
          />
        </div>

        <div className="mt-4 grid gap-2 px-4">
          <div className="flex gap-1 rounded-lg bg-sidebar-accent p-1">
            {STATUS_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={statusFilter === value}
                onClick={() => setStatusFilter(value)}
                className={cn(
                  'flex-1 rounded-md px-2 py-1 text-caption font-medium transition-colors',
                  statusFilter === value
                    ? 'bg-sidebar text-sidebar-foreground shadow-sm'
                    : 'text-sidebar-muted hover:text-sidebar-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Select
            value={reasonFilter}
            onValueChange={(v) => setReasonFilter(v as HandoffReason | 'all')}
          >
            <SelectTrigger
              size="sm"
              aria-label="Filtrar por motivo"
              className="w-full border-sidebar-border bg-sidebar-accent text-sidebar-foreground"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os motivos</SelectItem>
              {HANDOFF_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {HANDOFF_REASON_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="mt-3 min-h-0 flex-1">
          <ul className="grid gap-1 px-2 pb-3">
            {items.length === 0 && (
              <li className="grid justify-items-center gap-2 px-4 py-10 text-center text-caption text-sidebar-muted">
                <Inbox className="size-6" />
                Nenhuma conversa aqui.
                {all.length === 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    onClick={() => void act('/api/console/simulate')}
                  >
                    <UsersRound /> Simular pedidos
                  </Button>
                )}
              </li>
            )}
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    'flex w-full gap-3 rounded-lg px-3 py-3 text-left transition-colors',
                    selectedId === item.id
                      ? 'bg-sidebar-accent ring-1 ring-sidebar-border'
                      : 'hover:bg-sidebar-accent/60',
                  )}
                >
                  <UserAvatar name={item.userName} className="size-9" />
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-body font-medium">{item.userName}</span>
                      <span className="flex shrink-0 items-center gap-1 text-caption text-sidebar-muted">
                        <Clock className="size-3" />
                        {formatWait(item.handoffAt)}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {item.handoffReason && (
                        <Badge variant={REASON_VARIANT[item.handoffReason]}>
                          {HANDOFF_REASON_LABELS[item.handoffReason]}
                        </Badge>
                      )}
                      {item.overdueTicketIds.length > 0 && (
                        <Badge variant="destructive">
                          <TriangleAlert /> Vencido
                        </Badge>
                      )}
                    </span>
                    <span className="truncate text-caption text-sidebar-muted">
                      {item.department} · {CONVERSATION_STATUS_LABELS[item.status]}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>

        <Separator className="bg-sidebar-border" />
        <div className="flex items-center justify-between gap-2 p-3">
          <UserMenu name={analyst.name} detail={analyst.department} role="analyst" inverted />
        </div>
      </aside>

      {/* Conversa */}
      <section className={cn('min-h-0 flex-col', selectedId ? 'flex' : 'hidden md:flex')}>
        <header className="flex h-16 items-center justify-end gap-2 border-b bg-card px-5">
          <Button
            variant="ghost"
            size="sm"
            className="mr-auto md:hidden"
            onClick={() => {
              setSelectedId(null)
              setDetail(null)
            }}
          >
            <ArrowLeft /> Fila
          </Button>
          <Badge variant={serviceDown ? 'destructive' : 'success'}>
            <Server />
            <span className="sm:hidden">{serviceDown ? 'Instável' : 'Operando'}</span>
            <span className="hidden sm:inline">
              Sistema de chamados {serviceDown ? 'instável' : 'operando'}
            </span>
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label="Simular pedidos"
                onClick={() => act('/api/console/simulate')}
              >
                <UsersRound /> <span className="hidden sm:inline">Simular pedidos</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Demonstração: coloca pedidos de outros funcionários na fila (crítico, pedido direto,
              baixa confiança e um já em atendimento).
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label="Simular queda"
                onClick={() => act('/api/console/chaos', { downForSeconds: 20 })}
              >
                <Zap /> <span className="hidden sm:inline">Simular queda</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Demonstração: o sistema de chamados fica fora do ar por 20 segundos.
            </TooltipContent>
          </Tooltip>
        </header>

        {detail && selectedId ? (
          <ConversationPanel
            key={detail.conversation.id}
            detail={detail}
            analystId={analyst.id}
            act={act}
            error={error}
          />
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div className="grid justify-items-center gap-3">
              <LogoMark className="size-12 opacity-90" />
              <p className="text-heading">Selecione uma conversa da fila</p>
              <p className="max-w-xs text-body text-muted-foreground">
                As críticas e com chamado vencido aparecem primeiro, com o resumo do caso.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Funcionário */}
      <aside className="hidden min-h-0 overflow-y-auto border-l bg-card xl:block">
        {detail ? <EmployeePanel detail={detail} /> : null}
      </aside>
    </div>
  )
}

function Metric({
  label,
  value,
  alert = false,
}: {
  label: string
  value: number
  alert?: boolean
}) {
  return (
    <div className="rounded-lg bg-sidebar-accent px-3 py-2 ring-1 ring-sidebar-border">
      <p className={cn('text-title', alert && value > 0 && 'text-destructive')}>{value}</p>
      <p className="text-caption text-sidebar-muted">{label}</p>
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
  act: (path: string, body?: unknown) => Promise<boolean>
  error: string | null
}) {
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { conversation } = detail
  const base = `/api/console/conversations/${conversation.id}`
  const mine =
    conversation.status === 'with_analyst' && conversation.assignedAnalystId === analystId
  const cost = detail.messages.reduce((sum, m) => sum + (m.trace?.costUsd ?? 0), 0)
  const name = detail.employee?.name ?? 'Funcionário'
  const closed = conversation.status === 'closed'

  // Mensagem nova (do funcionário ou do assistente) rola a conversa até o fim.
  const count = detail.messages.length
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [count])

  const run = async (path: string, body?: unknown) => {
    setBusy(true)
    const ok = await act(path, body)
    setBusy(false)
    return ok
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-5 py-4">
        <div className="flex items-center gap-3">
          <UserAvatar name={name} className="size-10" />
          <div>
            <p className="text-heading">{name}</p>
            <p className="text-caption text-muted-foreground">
              {CONVERSATION_STATUS_LABELS[conversation.status]} · custo do assistente{' '}
              {formatUsd(cost)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {conversation.status === 'waiting_analyst' && (
            <Button onClick={() => run(`${base}/assume`)} disabled={busy}>
              <UserRoundCheck /> Assumir
            </Button>
          )}
          {mine && (
            <>
              <Button variant="outline" onClick={() => run(`${base}/return`)} disabled={busy}>
                <RotateCcw /> Devolver ao assistente
              </Button>
              <Button variant="outline" onClick={() => run(`${base}/close`)} disabled={busy}>
                <CircleCheck /> Encerrar
              </Button>
            </>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 bg-background">
        <div className="mx-auto grid max-w-2xl gap-5 px-5 py-6">
          {conversation.handoffSummary && (
            <Card className="gap-3 border-warning/30 bg-warning/[0.06] py-4 shadow-none">
              <CardHeader className="px-5">
                <CardTitle className="flex items-center gap-2 text-overline text-warning">
                  <TriangleAlert className="size-3.5" /> Resumo da transferência
                </CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap px-5 text-body text-muted-foreground">
                {conversation.handoffSummary}
              </CardContent>
            </Card>
          )}

          {detail.messages.map((m) =>
            m.role === 'system' ? (
              <div
                key={m.id}
                className="flex items-center gap-3 text-caption text-muted-foreground"
              >
                <span className="h-px flex-1 bg-border" />
                {m.content}
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : (
              <div key={m.id} className="flex gap-3">
                {m.role === 'agent' ? (
                  <LogoMark className="mt-0.5 size-7" />
                ) : (
                  <UserAvatar
                    name={m.role === 'employee' ? name : 'Analista'}
                    role={m.role === 'analyst' ? 'analyst' : 'employee'}
                    className="mt-0.5 size-7"
                  />
                )}
                <div className="grid min-w-0 flex-1 gap-2">
                  <p className="text-caption text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {m.role === 'employee'
                        ? name
                        : m.role === 'agent'
                          ? 'Assistente'
                          : 'Analista'}
                    </span>{' '}
                    · {formatTime(m.createdAt)}
                  </p>
                  {m.trace && <ActionLine actions={m.trace.actions} />}
                  <p
                    className={cn(
                      'w-fit max-w-full whitespace-pre-wrap rounded-xl border px-4 py-2.5 text-body',
                      m.role === 'employee' && 'border-primary/15 bg-accent',
                      m.role === 'analyst' && 'border-warning/30 bg-warning/10',
                      m.role === 'agent' && 'bg-card',
                    )}
                  >
                    {m.content}
                  </p>
                  {m.cards.map((card, i) => (
                    <MessageCard key={i} card={card} />
                  ))}
                  {m.trace && <TracePanel trace={m.trace} />}
                </div>
              </div>
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <form
        className="border-t bg-card px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!reply.trim() || busy) return
          void run(`${base}/reply`, { text: reply }).then((ok) => ok && setReply(''))
        }}
      >
        <div className="mx-auto flex max-w-2xl gap-2">
          <Input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            disabled={!mine}
            aria-label="Resposta ao funcionário"
            maxLength={4000}
            placeholder={
              mine
                ? 'Responder ao funcionário…'
                : closed
                  ? 'Atendimento encerrado'
                  : 'Assuma a conversa para responder'
            }
            className="h-10"
          />
          <Button type="submit" size="lg" disabled={!mine || !reply.trim() || busy}>
            <SendHorizontal /> Enviar
          </Button>
        </div>
        {error && (
          <p role="alert" className="mx-auto mt-2 max-w-2xl text-body text-destructive">
            {error}
          </p>
        )}
      </form>
    </>
  )
}

function EmployeePanel({ detail }: { detail: DetailResponse }) {
  const name = detail.employee?.name ?? 'Funcionário'
  return (
    <div className="grid gap-6 p-5">
      <div className="flex items-center gap-3">
        <UserAvatar name={name} className="size-12 text-base" />
        <div className="min-w-0">
          <p className="text-heading">{name}</p>
          <p className="truncate text-caption text-muted-foreground">
            {detail.employee?.department}
          </p>
          <p className="truncate text-caption text-muted-foreground">{detail.employee?.email}</p>
        </div>
      </div>
      <Separator />
      <div className="grid gap-3">
        <p className="text-overline text-muted-foreground">Chamados do funcionário</p>
        {detail.tickets === null ? (
          <p className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-body text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            Sistema de chamados indisponível agora.
          </p>
        ) : detail.tickets.length === 0 ? (
          <p className="text-body text-muted-foreground">Nenhum chamado.</p>
        ) : (
          <TicketList tickets={detail.tickets} />
        )}
      </div>
    </div>
  )
}
