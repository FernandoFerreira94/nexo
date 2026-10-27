'use client'

import {
  CONVERSATION_STATUS_LABELS,
  type Card,
  type DecisionTrace,
  type Draft,
  type QuickReply,
  type StreamEvent,
} from '@nexo/shared'
import {
  BookOpen,
  Headset,
  KeyRound,
  ListChecks,
  SendHorizontal,
  TriangleAlert,
  Wifi,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Logo, LogoMark } from '@/components/brand/logo'
import { UserAvatar } from '@/components/brand/user-avatar'
import { UserMenu } from '@/components/brand/user-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { formatTime } from '@/lib/format'
import { readEvents } from '@/lib/stream'
import type { ChatMessage, ConversationState } from '@/lib/types'
import { cn } from '@/lib/utils'
import { MessageCard } from './cards'
import { ActionLine, TracePanel } from './trace-panel'

type ConversationResponse = {
  conversation: ConversationState
  messages: ChatMessage[]
  pendingDraft: Draft | null
}

/** Resposta sendo montada enquanto o streaming chega. */
type LiveReply = {
  text: string
  actions: { label: string; status: 'running' | 'ok' | 'error' }[]
  cards: Card[]
  quickReplies: QuickReply[]
  notices: string[]
  trace: DecisionTrace | null
}

const EMPTY_LIVE: LiveReply = {
  text: '',
  actions: [],
  cards: [],
  quickReplies: [],
  notices: [],
  trace: null,
}

const SUGGESTIONS = [
  { icon: ListChecks, text: 'Como está o meu chamado?' },
  { icon: Wifi, text: 'Minha VPN está dando erro 809' },
  { icon: KeyRound, text: 'Preciso de acesso a um sistema' },
  { icon: BookOpen, text: 'Qual o horário de atendimento?' },
]

export function ChatView({ user }: { user: { name: string; department: string } }) {
  const [data, setData] = useState<ConversationResponse | null>(null)
  const [live, setLive] = useState<LiveReply | null>(null)
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const reload = useCallback(async () => {
    setData(await api<ConversationResponse>('/api/conversation'))
  }, [])

  useEffect(() => {
    reload().catch((e: Error) => setError(e.message))
  }, [reload])

  // Com analista, o agent não responde: a tela consulta de tempos em tempos as mensagens novas.
  const status = data?.conversation.status
  useEffect(() => {
    if (!status || status === 'with_agent' || live) return
    const timer = setInterval(() => reload().catch(() => {}), 3000)
    return () => clearInterval(timer)
  }, [status, live, reload])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [data?.messages.length, live?.text, live?.cards.length, pendingText])

  const stream = useCallback(
    async (request: Promise<Response>, employeeText: string | null) => {
      setError(null)
      setPendingText(employeeText)
      setLive({ ...EMPTY_LIVE })
      try {
        const response = await request
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? 'Não consegui enviar.')
        }
        await readEvents(response, (event) =>
          setLive((current) => apply(current ?? EMPTY_LIVE, event)),
        )
        await reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Não consegui enviar.')
        await reload().catch(() => {})
      } finally {
        setLive(null)
        setPendingText(null)
      }
    },
    [reload],
  )

  const send = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || live) return
    setInput('')
    void stream(post('/api/chat', { text: trimmed }), trimmed)
  }

  const onQuickReply = (reply: QuickReply) => {
    if (live) return
    if (reply.action.type === 'message') send(reply.action.text)
    else void stream(post('/api/handoff', { reason: reply.action.reason }), null)
  }

  const onDraftAction = async (draft: Draft, action: 'confirm' | 'cancel') => {
    setError(null)
    try {
      await api(`/api/drafts/${draft.id}/${action}`, {
        method: 'POST',
        body: { version: draft.version },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui enviar.')
    }
    await reload()
  }

  const messages = data?.messages ?? []
  const pendingDraft = data?.pendingDraft ?? null
  const lastAgentIndex = messages.findLastIndex((m) => m.role === 'agent')

  return (
    <div className="flex h-dvh flex-col">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4">
          <Logo subtitle="Service desk de TI" />
          <div className="flex items-center gap-3">
            {status && (
              <Badge variant={status === 'with_agent' ? 'success' : 'warning'}>
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    status === 'with_agent' ? 'bg-success' : 'bg-warning',
                  )}
                />
                {CONVERSATION_STATUS_LABELS[status]}
              </Badge>
            )}
            <UserMenu name={user.name} detail={user.department} role="employee" />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
          {!data && <LoadingState />}

          {data && messages.length === 0 && !pendingText && (
            <Welcome name={user.name.split(' ')[0] ?? user.name} onPick={send} />
          )}

          {messages.map((message, index) => (
            <MessageItem
              key={message.id}
              message={message}
              pendingDraft={pendingDraft}
              onDraftAction={onDraftAction}
              onQuickReply={
                index === lastAgentIndex && status === 'with_agent' && !live
                  ? onQuickReply
                  : undefined
              }
            />
          ))}

          {pendingText && <EmployeeBubble text={pendingText} />}
          {live && <LiveItem live={live} />}

          {status && status !== 'with_agent' && !live && <HandoffBanner status={status} />}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="border-t bg-card/80 backdrop-blur">
        <form
          className="mx-auto max-w-3xl px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault()
            send(input)
          }}
        >
          <div className="flex items-end gap-2 rounded-xl border bg-card p-2 shadow-sm transition-shadow focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20">
            <label htmlFor="message" className="sr-only">
              Mensagem
            </label>
            <Textarea
              id="message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={
                status === 'closed'
                  ? 'Atendimento encerrado'
                  : 'Descreva o problema ou pergunte algo…'
              }
              disabled={status === 'closed'}
              className="max-h-40 min-h-9 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0"
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Enviar"
              disabled={!input.trim() || live !== null}
            >
              <SendHorizontal />
            </Button>
          </div>
          <p className="mt-2 text-center text-caption text-muted-foreground">
            O assistente só abre chamados com a sua confirmação.
          </p>
          {error && (
            <p
              role="alert"
              className="mt-2 flex items-center justify-center gap-1.5 text-body text-destructive"
            >
              <TriangleAlert className="size-4" /> {error}
            </p>
          )}
        </form>
      </footer>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="ml-auto h-10 w-1/2" />
      <Skeleton className="h-24 w-3/4" />
    </div>
  )
}

function Welcome({ name, onPick }: { name: string; onPick: (text: string) => void }) {
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 py-10 text-center duration-500">
      <LogoMark className="mx-auto size-12" />
      <h1 className="mt-5 text-display">Oi, {name}! Como posso ajudar?</h1>
      <p className="mx-auto mt-2 max-w-md text-body text-muted-foreground">
        Tiro dúvidas de TI, consulto seus chamados e preparo chamados novos para você confirmar.
      </p>
      <div className="mx-auto mt-8 grid max-w-xl gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map(({ icon: Icon, text }) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="group flex items-center gap-3 rounded-lg border bg-card p-3 text-left text-body shadow-xs transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="grid size-8 place-items-center rounded-md bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Icon className="size-4" />
            </span>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageItem({
  message,
  pendingDraft,
  onDraftAction,
  onQuickReply,
}: {
  message: ChatMessage
  pendingDraft: Draft | null
  onDraftAction: (draft: Draft, action: 'confirm' | 'cancel') => Promise<void>
  onQuickReply?: (reply: QuickReply) => void
}) {
  if (message.role === 'system') {
    return (
      <div className="flex items-center gap-3 text-caption text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {message.content}
        <span className="h-px flex-1 bg-border" />
      </div>
    )
  }
  if (message.role === 'employee') {
    return <EmployeeBubble text={message.content} time={message.createdAt} />
  }

  return (
    <AgentRow role={message.role}>
      {message.trace && <ActionLine actions={message.trace.actions} />}
      <ReplyBubble role={message.role} text={message.content} time={message.createdAt} />
      {message.cards.map((card, i) => {
        const actionable =
          card.type === 'draft' &&
          pendingDraft?.id === card.draft.id &&
          pendingDraft.version === card.draft.version
        return (
          <MessageCard key={i} card={card} onDraftAction={actionable ? onDraftAction : undefined} />
        )
      })}
      {onQuickReply && message.quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {message.quickReplies.map((reply) => (
            <Button
              key={reply.label}
              variant="outline"
              size="sm"
              onClick={() => onQuickReply(reply)}
            >
              <Headset /> {reply.label}
            </Button>
          ))}
        </div>
      )}
      {message.trace && <TracePanel trace={message.trace} />}
    </AgentRow>
  )
}

function LiveItem({ live }: { live: LiveReply }) {
  return (
    <AgentRow role="agent" live>
      <ActionLine actions={live.actions} />
      {live.text ? (
        <ReplyBubble role="agent" text={live.text} />
      ) : (
        <div className="flex w-fit items-center gap-1 rounded-2xl rounded-tl-md border bg-card px-4 py-3">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
          <span className="sr-only">Pensando…</span>
        </div>
      )}
      {live.cards.map((card, i) => (
        <MessageCard key={i} card={card} />
      ))}
      {live.notices.map((n, i) => (
        <p
          key={i}
          className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-body"
        >
          <TriangleAlert className="size-4 text-warning" /> {n}
        </p>
      ))}
    </AgentRow>
  )
}

/** Mensagem do assistente ou do analista: avatar à esquerda e o conteúdo em coluna. */
function AgentRow({
  role,
  live = false,
  children,
}: {
  role: 'agent' | 'analyst'
  live?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className="flex animate-in gap-3 fade-in-0 slide-in-from-bottom-1 duration-300"
      aria-live={live ? 'polite' : undefined}
    >
      {role === 'analyst' ? (
        <UserAvatar name="Analista" role="analyst" className="mt-0.5 size-7" />
      ) : (
        <LogoMark className="mt-0.5 size-7" />
      )}
      <div className="grid min-w-0 flex-1 gap-2">{children}</div>
    </div>
  )
}

function ReplyBubble({
  role,
  text,
  time,
}: {
  role: 'agent' | 'analyst'
  text: string
  time?: string
}) {
  return (
    <div
      className={cn(
        'w-fit max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-tl-md border px-4 py-3 text-body shadow-xs',
        role === 'analyst' ? 'border-warning/30 bg-warning/10' : 'bg-card',
      )}
    >
      {role === 'analyst' && <p className="mb-1 text-overline text-warning">Analista</p>}
      {text}
      {time && (
        <span className="mt-1.5 block text-caption text-muted-foreground">{formatTime(time)}</span>
      )}
    </div>
  )
}

function EmployeeBubble({ text, time }: { text: string; time?: string }) {
  return (
    <div className="flex animate-in justify-end fade-in-0 slide-in-from-bottom-1 duration-300">
      <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-3 text-body text-primary-foreground shadow-sm">
        {text}
        {time && (
          <span className="mt-1.5 block text-right text-caption text-primary-foreground/70">
            {formatTime(time)}
          </span>
        )}
      </div>
    </div>
  )
}

function HandoffBanner({ status }: { status: ConversationState['status'] }) {
  const text =
    status === 'waiting_analyst'
      ? 'Sua conversa está na fila de um analista, com o resumo do que conversamos. Pode continuar escrevendo aqui.'
      : status === 'with_analyst'
        ? 'Você está falando com um analista.'
        : 'Atendimento encerrado.'
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-warning/15 text-warning">
        <Headset className="size-4" />
      </span>
      <div>
        <p className="text-heading">{CONVERSATION_STATUS_LABELS[status]}</p>
        <p className="text-body text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}

/** Aplica um evento do streaming na resposta em construção. */
function apply(live: LiveReply, event: StreamEvent): LiveReply {
  switch (event.type) {
    case 'action': {
      if (event.status === 'running') {
        return { ...live, actions: [...live.actions, { label: event.label, status: 'running' }] }
      }
      const index = live.actions.findLastIndex(
        (a) => a.label === event.label && a.status === 'running',
      )
      const actions = live.actions.map((a, i) => (i === index ? { ...a, status: event.status } : a))
      return { ...live, actions }
    }
    case 'text-delta':
      return { ...live, text: live.text + event.text }
    case 'card':
      return { ...live, cards: [...live.cards, event.card] }
    case 'quick-replies':
      return { ...live, quickReplies: event.options }
    case 'notice':
      return { ...live, notices: [...live.notices, event.text] }
    case 'trace':
      return { ...live, trace: event.trace }
    case 'error':
      return { ...live, notices: [...live.notices, event.message] }
    default:
      return live
  }
}

function post(path: string, body: unknown) {
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
