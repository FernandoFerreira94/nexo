'use client'

import {
  CONVERSATION_STATUS_LABELS,
  type Card,
  type DecisionTrace,
  type Draft,
  type QuickReply,
  type StreamEvent,
  type TicketSummary,
} from '@nexo/shared'
import {
  BookOpen,
  Download,
  Headset,
  ImagePlus,
  KeyRound,
  ListChecks,
  MessageSquarePlus,
  SendHorizontal,
  TriangleAlert,
  Wifi,
  Wrench,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Logo, LogoMark } from '@/components/brand/logo'
import { UserAvatar } from '@/components/brand/user-avatar'
import { UserMenu } from '@/components/brand/user-menu'
import { useInstallApp } from '@/components/pwa/install'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { formatDateTime, formatTime } from '@/lib/format'
import { readEvents } from '@/lib/stream'
import type { ChatMessage, ConversationState } from '@/lib/types'
import { cn } from '@/lib/utils'
import { MessageCard, type DraftEdit } from './cards'
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

/** Foto anexada: fica só neste navegador (demonstração, não vai para o servidor). */
type LocalPhoto = { name: string; url: string }

/** Atalhos acima do campo de mensagem, para continuar a conversa sem pensar no que escrever. */
const QUICK_ACTIONS = [
  { icon: ListChecks, label: 'Ver meus chamados', text: 'Como estão os meus chamados?' },
  { icon: Wrench, label: 'Relatar um problema', prefill: 'Estou com um problema: ' },
  { icon: Headset, label: 'Falar com um analista', text: 'Quero falar com um analista' },
] as const

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
  const [photo, setPhoto] = useState<LocalPhoto | null>(null)
  const [sentPhotos, setSentPhotos] = useState<{ text: string; photo: LocalPhoto }[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const reload = useCallback(async () => {
    setData(await api<ConversationResponse>('/api/conversation'))
  }, [])

  useEffect(() => {
    reload().catch((e: Error) => setError(e.message))
  }, [reload])

  // Com analista, o agent não responde: a tela consulta de tempos em tempos as mensagens novas.
  const status = data?.conversation.status
  useEffect(() => {
    if (!status || status === 'with_agent' || status === 'closed' || live) return
    const timer = setInterval(() => {
      if (!document.hidden) reload().catch(() => {})
    }, 3000)
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
        if (response.status === 401) {
          window.location.href = '/login'
          return
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? 'Não consegui enviar.')
        }
        await readEvents(response, (event) => {
          // Erro no meio da resposta: fica visível depois que o streaming termina.
          if (event.type === 'error') setError(event.message)
          setLive((current) => apply(current ?? EMPTY_LIVE, event))
        })
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
    const trimmed = text.trim() || (photo ? 'Enviei uma foto do problema.' : '')
    if (!trimmed || live) return
    if (photo) {
      setSentPhotos((list) => [...list, { text: trimmed, photo }])
      setPhoto(null)
    }
    setInput('')
    void stream(post('/api/chat', { text: trimmed }), trimmed)
  }

  const pickPhoto = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Escolha uma imagem (JPG, PNG ou similar).')
      return
    }
    if (photo) URL.revokeObjectURL(photo.url)
    setPhoto({ name: file.name, url: URL.createObjectURL(file) })
    inputRef.current?.focus()
  }

  const newConversation = async () => {
    if (live) return
    setError(null)
    try {
      await api('/api/conversation/new', { method: 'POST' })
      await reload()
      inputRef.current?.focus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui começar uma nova conversa.')
    }
  }

  const onQuickAction = (action: (typeof QUICK_ACTIONS)[number]) => {
    if ('text' in action) return send(action.text)
    setInput(action.prefill)
    inputRef.current?.focus()
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

  const onDraftEdit = async (draft: Draft, edit: DraftEdit) => {
    setError(null)
    try {
      await api(`/api/drafts/${draft.id}`, {
        method: 'PATCH',
        body: { version: draft.version, ...edit },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui salvar a edição.')
    }
    await reload()
  }

  // Tela 3: tocar num chamado da lista pergunta por ele, sem precisar digitar o número.
  const onTicketPick = (ticket: TicketSummary) => {
    if (status !== 'with_agent' || live) return
    send(`Qual o status do ${ticket.id}?`)
  }

  const messages = data?.messages ?? []
  const pendingDraft = data?.pendingDraft ?? null
  const lastAgentIndex = messages.findLastIndex((m) => m.role === 'agent')
  const withHuman = status === 'waiting_analyst' || status === 'with_analyst'
  const firstMessage = messages[0]
  // Foto de cada mensagem enviada: a última mensagem com o mesmo texto fica com a foto.
  const photoFor = (message: ChatMessage) =>
    sentPhotos.findLast(
      (p) =>
        p.text === message.content &&
        messages.findLast((m) => m.role === 'employee' && m.content === p.text)?.id === message.id,
    )?.photo

  return (
    <div className="flex h-dvh flex-col">
      <ChatHeader
        user={user}
        status={status}
        canStartNew={!withHuman && !live && messages.length > 0}
        onNewConversation={newConversation}
      />

      <main className="flex-1 overflow-y-auto">
        <div
          role="log"
          aria-label="Conversa com o assistente"
          className="mx-auto grid max-w-3xl gap-6 px-4 py-8"
        >
          {!data && <LoadingState />}

          {data && messages.length === 0 && !pendingText && (
            <Welcome name={user.name.split(' ')[0] ?? user.name} onPick={send} />
          )}

          {firstMessage && (
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
              <span>Conversa iniciada em {formatDateTime(firstMessage.createdAt)}</span>
              {!withHuman && status !== 'closed' && (
                <>
                  <span aria-hidden>·</span>
                  <button
                    type="button"
                    onClick={() => void newConversation()}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Começar uma nova
                  </button>
                </>
              )}
            </div>
          )}

          {messages.map((message, index) => (
            <MessageItem
              key={message.id}
              message={message}
              photo={photoFor(message)}
              pendingDraft={pendingDraft}
              onDraftAction={onDraftAction}
              onDraftEdit={onDraftEdit}
              onTicketPick={status === 'with_agent' && !live ? onTicketPick : undefined}
              onQuickReply={
                index === lastAgentIndex && status === 'with_agent' && !live
                  ? onQuickReply
                  : undefined
              }
            />
          ))}

          {pendingText && (
            <EmployeeBubble
              text={pendingText}
              photo={sentPhotos.findLast((p) => p.text === pendingText)?.photo}
            />
          )}
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
          {messages.length > 0 && status === 'with_agent' && !live && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => onQuickAction(action)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-caption font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <action.icon className="size-3.5" /> {action.label}
                </button>
              ))}
            </div>
          )}
          <div className="rounded-xl border bg-card p-2 shadow-sm transition-shadow focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20">
            {photo && (
              <div className="mb-2 flex items-center gap-3 rounded-lg border bg-muted/50 p-2">
                {/* URL local do navegador (blob:), por isso <img> e não next/image */}
                <img src={photo.url} alt="" className="size-12 rounded-md object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium">{photo.name}</p>
                  <p className="text-caption text-muted-foreground">
                    Demonstração: a foto fica só neste navegador.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remover foto"
                  onClick={() => {
                    URL.revokeObjectURL(photo.url)
                    setPhoto(null)
                  }}
                >
                  <X />
                </Button>
              </div>
            )}
            <div className="flex items-end gap-1">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  pickPhoto(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Anexar foto"
                    className="text-muted-foreground"
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImagePlus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Anexar foto do erro</TooltipContent>
              </Tooltip>
              <label htmlFor="message" className="sr-only">
                Mensagem
              </label>
              <Textarea
                ref={inputRef}
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
                    ? 'Escreva para começar uma nova conversa…'
                    : 'Escreva sua mensagem…'
                }
                className="max-h-40 min-h-9 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0"
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Enviar"
                disabled={(!input.trim() && !photo) || live !== null}
              >
                <SendHorizontal />
              </Button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-2 text-caption text-muted-foreground">
            <span>O assistente só abre chamados com a sua confirmação.</span>
            {data && data.conversation.messageCount > 0 && (
              <MessageCounter conversation={data.conversation} />
            )}
          </div>
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

const STATUS_PILL: Record<ConversationState['status'], { label: string; dot: string }> = {
  with_agent: { label: 'Assistente online', dot: 'bg-success' },
  waiting_analyst: { label: 'Na fila de um analista', dot: 'bg-warning' },
  with_analyst: { label: 'Com um analista', dot: 'bg-info' },
  closed: { label: 'Atendimento encerrado', dot: 'bg-muted-foreground' },
}

/** Topo do chat: marca (volta ao início), situação da conversa, nova conversa e conta. */
function ChatHeader({
  user,
  status,
  canStartNew,
  onNewConversation,
}: {
  user: { name: string; department: string }
  status: ConversationState['status'] | undefined
  canStartNew: boolean
  onNewConversation: () => Promise<void>
}) {
  const { install } = useInstallApp()
  const pill = status ? STATUS_PILL[status] : null
  return (
    <header className="sticky top-0 z-20 bg-card/85 backdrop-blur-md supports-[backdrop-filter]:bg-card/70">
      <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
        <Link
          href="/"
          aria-label="Nexo Assist, início"
          className="rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Logo subtitle="Service desk de TI" />
        </Link>

        {pill && (
          <span
            role="status"
            className="ml-1 hidden items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-caption font-medium text-muted-foreground md:inline-flex"
          >
            <span className="relative flex size-2">
              {status === 'with_agent' && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50 motion-reduce:hidden" />
              )}
              <span className={cn('relative inline-flex size-2 rounded-full', pill.dot)} />
            </span>
            {pill.label}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {install && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Instalar app"
                  onClick={() => void install()}
                >
                  <Download />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Instalar o Nexo Assist neste dispositivo</TooltipContent>
            </Tooltip>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!canStartNew}
            onClick={() => void onNewConversation()}
            aria-label="Nova conversa"
          >
            <MessageSquarePlus />
            <span className="hidden sm:inline">Nova conversa</span>
          </Button>
          <span aria-hidden className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <UserMenu name={user.name} detail={user.department} role="employee">
            <DropdownMenuItem disabled={!canStartNew} onSelect={() => void onNewConversation()}>
              <MessageSquarePlus /> Nova conversa
            </DropdownMenuItem>
          </UserMenu>
        </div>
      </div>
      {/* Linha com o degradê da marca no lugar da borda comum. */}
      <div
        aria-hidden
        className="h-px bg-gradient-to-r from-transparent via-brand-from/50 to-transparent"
      />
      {pill && (
        <p className="flex items-center justify-center gap-2 border-b bg-background/60 py-1 text-caption text-muted-foreground md:hidden">
          <span className={cn('size-1.5 rounded-full', pill.dot)} /> {pill.label}
        </p>
      )}
    </header>
  )
}

/** Contador do limite de mensagens: discreto no começo, em destaque perto do fim. */
function MessageCounter({ conversation }: { conversation: ConversationState }) {
  const { messageCount: count, messageLimit: limit, messageWarnAt: warnAt } = conversation
  const near = count >= warnAt
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 font-medium tabular-nums',
        near ? 'bg-warning/15 text-warning' : 'bg-muted',
      )}
      title="Limite de mensagens por conversa. Ao chegar nele, um analista assume."
    >
      {count}/{limit}
      <span className="sr-only"> mensagens usadas nesta conversa</span>
    </span>
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
  photo,
  pendingDraft,
  onDraftAction,
  onDraftEdit,
  onTicketPick,
  onQuickReply,
}: {
  message: ChatMessage
  photo?: LocalPhoto | undefined
  pendingDraft: Draft | null
  onDraftAction: (draft: Draft, action: 'confirm' | 'cancel') => Promise<void>
  onDraftEdit: (draft: Draft, edit: DraftEdit) => Promise<void>
  onTicketPick?: ((ticket: TicketSummary) => void) | undefined
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
    return <EmployeeBubble text={message.content} time={message.createdAt} photo={photo} />
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
          <MessageCard
            key={i}
            card={card}
            onDraftAction={actionable ? onDraftAction : undefined}
            onDraftEdit={actionable ? onDraftEdit : undefined}
            onTicketPick={onTicketPick}
          />
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
      aria-busy={live || undefined}
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

function EmployeeBubble({
  text,
  time,
  photo,
}: {
  text: string
  time?: string
  photo?: LocalPhoto | undefined
}) {
  return (
    <div className="flex animate-in justify-end fade-in-0 slide-in-from-bottom-1 duration-300">
      <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-3 text-body text-primary-foreground shadow-sm">
        {photo && (
          // URL local do navegador (blob:), por isso <img> e não next/image
          <img
            src={photo.url}
            alt={`Foto anexada: ${photo.name}`}
            className="mb-2 max-h-60 w-full rounded-lg object-cover"
          />
        )}
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
        : 'O analista encerrou este atendimento. Se precisar de algo mais, é só escrever: começo uma conversa nova.'
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
