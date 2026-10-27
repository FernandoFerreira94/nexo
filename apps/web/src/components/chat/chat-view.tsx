'use client'

import {
  CONVERSATION_STATUS_LABELS,
  type Card,
  type DecisionTrace,
  type Draft,
  type QuickReply,
  type StreamEvent,
} from '@nexo/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api, logout } from '@/lib/api'
import { formatTime } from '@/lib/format'
import { readEvents } from '@/lib/stream'
import type { ChatMessage, ConversationState } from '@/lib/types'
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
  'Como está o meu chamado?',
  'Minha VPN está dando erro 809',
  'Preciso de acesso a um sistema',
  'Quero falar com um analista',
]

export function ChatView({ userName }: { userName: string }) {
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
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="grid size-8 place-items-center rounded-lg bg-brand font-bold text-white"
            >
              N
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Nexo Assist</p>
              <p className="text-xs text-ink-faint">Service desk de TI</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {status && (
              <Badge tone={status === 'with_agent' ? 'ok' : 'warn'}>
                {CONVERSATION_STATUS_LABELS[status]}
              </Badge>
            )}
            <span className="hidden text-sm text-ink-soft sm:inline">{userName}</span>
            <Button variant="ghost" size="sm" onClick={logout}>
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-3xl gap-4 px-4 py-6">
          {data && messages.length === 0 && !pendingText && (
            <Welcome name={userName.split(' ')[0] ?? userName} onPick={send} />
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

          {pendingText && <Bubble role="employee" text={pendingText} />}
          {live && <LiveItem live={live} />}

          {status && status !== 'with_agent' && !live && (
            <div className="rounded-[var(--radius-card)] border border-warn/30 bg-warn-soft p-3 text-sm text-ink-soft">
              {status === 'waiting_analyst'
                ? 'Sua conversa está na fila de um analista, com o resumo do que conversamos. Pode continuar escrevendo aqui.'
                : status === 'with_analyst'
                  ? 'Você está falando com um analista.'
                  : 'Atendimento encerrado.'}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="border-t border-line bg-surface">
        <form
          className="mx-auto flex max-w-3xl gap-2 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault()
            send(input)
          }}
        >
          <label htmlFor="message" className="sr-only">
            Mensagem
          </label>
          <input
            id="message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={2000}
            placeholder={
              status === 'closed'
                ? 'Atendimento encerrado'
                : 'Descreva o problema ou pergunte algo…'
            }
            disabled={status === 'closed'}
            className="h-11 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <Button type="submit" disabled={!input.trim() || live !== null}>
            Enviar
          </Button>
        </form>
        {error && (
          <p role="alert" className="mx-auto max-w-3xl px-4 pb-3 text-sm text-danger">
            {error}
          </p>
        )}
      </footer>
    </div>
  )
}

function Welcome({ name, onPick }: { name: string; onPick: (text: string) => void }) {
  return (
    <div className="animate-in py-10 text-center">
      <h1 className="text-xl font-semibold">Oi, {name}! Como posso ajudar?</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Tiro dúvidas de TI, consulto seus chamados e preparo chamados novos para você confirmar.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-soft hover:border-brand hover:text-brand"
          >
            {s}
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
    return <p className="text-center text-xs text-ink-faint">{message.content}</p>
  }
  if (message.role === 'employee')
    return <Bubble role="employee" text={message.content} time={message.createdAt} />

  return (
    <div className="animate-in grid gap-2">
      {message.trace && <ActionLine actions={message.trace.actions} />}
      <Bubble role={message.role} text={message.content} time={message.createdAt} />
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
        <QuickReplies replies={message.quickReplies} onPick={onQuickReply} />
      )}
      {message.trace && <TracePanel trace={message.trace} />}
    </div>
  )
}

function LiveItem({ live }: { live: LiveReply }) {
  return (
    <div className="grid gap-2" aria-live="polite">
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
        {live.actions.map((a, i) => (
          <li key={i} className="inline-flex items-center gap-1">
            <span
              aria-hidden
              className={
                a.status === 'running'
                  ? 'animate-pulse text-brand'
                  : a.status === 'ok'
                    ? 'text-ok'
                    : 'text-danger'
              }
            >
              {a.status === 'running' ? '●' : a.status === 'ok' ? '✓' : '✕'}
            </span>
            {a.status === 'running' ? `${a.label}…` : a.label}
          </li>
        ))}
      </ul>
      {live.text ? (
        <Bubble role="agent" text={live.text} />
      ) : (
        <p className="text-sm text-ink-faint">Pensando…</p>
      )}
      {live.cards.map((card, i) => (
        <MessageCard key={i} card={card} />
      ))}
      {live.notices.map((n, i) => (
        <p key={i} className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-ink-soft">
          {n}
        </p>
      ))}
    </div>
  )
}

function Bubble({ role, text, time }: { role: ChatMessage['role']; text: string; time?: string }) {
  const mine = role === 'employee'
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          mine
            ? 'rounded-br-md bg-brand text-white'
            : role === 'analyst'
              ? 'rounded-bl-md border border-warn/30 bg-warn-soft text-ink'
              : 'rounded-bl-md border border-line bg-surface text-ink'
        }`}
      >
        {role === 'analyst' && <p className="mb-0.5 text-xs font-semibold text-warn">Analista</p>}
        {text}
        {time && (
          <span className={`mt-1 block text-[11px] ${mine ? 'text-white/70' : 'text-ink-faint'}`}>
            {formatTime(time)}
          </span>
        )}
      </div>
    </div>
  )
}

function QuickReplies({
  replies,
  onPick,
}: {
  replies: QuickReply[]
  onPick: (reply: QuickReply) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {replies.map((reply) => (
        <Button key={reply.label} variant="secondary" size="sm" onClick={() => onPick(reply)}>
          {reply.label}
        </Button>
      ))}
    </div>
  )
}

/** Aplica um evento do streaming na resposta em construção. */
function apply(live: LiveReply, event: StreamEvent): LiveReply {
  switch (event.type) {
    case 'action': {
      if (event.status === 'running')
        return { ...live, actions: [...live.actions, { label: event.label, status: 'running' }] }
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
