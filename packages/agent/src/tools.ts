import {
  Affected,
  Category,
  classifyPriority,
  computeDueAt,
  canReopen,
  OPEN_STATUSES,
  SLA_LABELS,
  TicketType,
  type Card,
  type Draft,
  type DraftKind,
  type Intent,
  type StreamEvent,
  type Ticket,
  type TraceAction,
} from '@nexo/shared'
import { tool } from 'ai'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { searchArticles, STRONG_MATCH_SCORE } from './knowledge/search'
import { findSimilarOpenTicket } from './rules/duplicate'
import { toTicketSummary } from './ticket-summary'
import {
  TicketNotFoundError,
  TicketsUnavailableError,
  type TicketsClient,
} from './tickets-client/client'

export type ToolDeps = {
  tickets: TicketsClient
  /** Vem da sessão do login. O modelo nunca escolhe de quem são os chamados. */
  requesterId: string
  now: () => Date
  pendingDraft: Draft | null
}

/**
 * O que as tools produziram no turno. O runTurn lê daqui para montar o streaming e o trace.
 * As tools não falam com a tela diretamente: só anotam aqui.
 */
export type TurnSink = {
  events: StreamEvent[]
  actions: TraceAction[]
  cards: Card[]
  draft: Draft | null
  overdueTicketIds: string[]
  toolFailed: boolean
  weakArticleMatch: boolean
  rulesApplied: string[]
}

export function createTurnSink(): TurnSink {
  return {
    events: [],
    actions: [],
    cards: [],
    draft: null,
    overdueTicketIds: [],
    toolFailed: false,
    weakArticleMatch: false,
    rulesApplied: [],
  }
}

const UNAVAILABLE = {
  error: 'tickets_unavailable',
  message: 'O sistema de chamados não respondeu depois de 3 tentativas.',
} as const

/** Quais tools o agent pode usar em cada intenção: menos opções, menos erro e menos tokens. */
export const TOOLS_BY_INTENT: Partial<Record<Intent, readonly ToolName[]>> = {
  question: ['searchKnowledgeBase'],
  ticket_status: ['listMyTickets', 'getTicket'],
  new_issue: ['searchKnowledgeBase', 'findSimilarOpenTicket', 'draftTicket'],
  add_info: ['listMyTickets', 'draftTicketUpdate'],
  reopen: ['listMyTickets', 'draftReopen'],
}

export type ToolName = keyof ReturnType<typeof createTools>

export function createTools(deps: ToolDeps, sink: TurnSink) {
  /** Envolve cada tool: mostra "consultando..." na tela, mede o tempo e registra no trace. */
  async function track(
    name: string,
    label: string,
    input: unknown,
    run: () => Promise<{ result: unknown; summary: string; failed?: boolean }>,
  ): Promise<unknown> {
    const startedAt = Date.now()
    sink.events.push({ type: 'action', label, status: 'running' })
    const { result, summary, failed = false } = await run()
    const status = failed ? 'error' : 'ok'
    sink.events.push({ type: 'action', label, status })
    sink.actions.push({
      tool: name,
      label,
      input,
      outputSummary: summary,
      status,
      durationMs: Date.now() - startedAt,
    })
    return result
  }

  /** Chamadas ao sistema de chamados viram resultado estruturado quando ele cai. */
  async function guarded<T>(call: () => Promise<T>) {
    try {
      return { ok: true as const, value: await call() }
    } catch (error) {
      if (error instanceof TicketsUnavailableError) {
        sink.toolFailed = true
        return { ok: false as const, error: UNAVAILABLE }
      }
      if (error instanceof TicketNotFoundError) {
        return {
          ok: false as const,
          error: {
            error: 'not_found',
            message: 'Chamado não encontrado entre os chamados desta pessoa.',
          },
        }
      }
      throw error
    }
  }

  /** Mesmo rascunho pendente do mesmo tipo e chamado: só sobe a versão (decisão D01). */
  function nextDraft(
    kind: DraftKind,
    ticketId: string | null,
    fields: Omit<Draft, 'id' | 'version' | 'kind' | 'ticketId' | 'status'>,
  ): Draft {
    const previous = sink.draft ?? deps.pendingDraft
    const same =
      previous &&
      previous.status === 'pending' &&
      previous.kind === kind &&
      previous.ticketId === ticketId
    const draft: Draft = {
      id: same ? previous.id : randomUUID(),
      version: same ? previous.version + 1 : 1,
      kind,
      ticketId,
      status: 'pending',
      ...fields,
    }
    sink.draft = draft
    sink.cards.push({ type: 'draft', draft })
    sink.events.push({ type: 'card', card: { type: 'draft', draft } })
    return draft
  }

  async function ownedTicket(id: string) {
    return guarded(() => deps.tickets.getTicket(id, deps.requesterId))
  }

  return {
    searchKnowledgeBase: tool({
      description:
        'Busca artigos da central de ajuda de TI. Use antes de abrir chamado e para dúvidas.',
      inputSchema: z.object({
        query: z.string().describe('O problema ou a dúvida, em poucas palavras'),
      }),
      execute: (input) =>
        track('searchKnowledgeBase', 'consultou a central de ajuda', input, async () => {
          const matches = searchArticles(input.query)
          const best = matches[0]
          const strong = best !== undefined && best.score >= STRONG_MATCH_SCORE
          if (!strong) sink.weakArticleMatch = true
          if (strong) {
            const card: Card = {
              type: 'article',
              articleId: best.article.id,
              title: best.article.title,
            }
            sink.cards.push(card)
            sink.events.push({ type: 'card', card })
          }
          return {
            result: {
              articles: matches.map((m) => ({
                id: m.article.id,
                title: m.article.title,
                body: m.article.body,
                relevance: m.score >= STRONG_MATCH_SCORE ? 'alta' : 'baixa',
              })),
            },
            summary: best
              ? `${matches.length} artigo(s); melhor: ${best.article.id}`
              : 'nenhum artigo',
          }
        }),
    }),

    listMyTickets: tool({
      description: 'Lista os chamados do funcionário logado, com status, prazo e se está vencido.',
      inputSchema: z.object({}),
      execute: (input) =>
        track('listMyTickets', 'consultou seus chamados', input, async () => {
          const response = await guarded(() => deps.tickets.listTickets(deps.requesterId))
          if (!response.ok)
            return { result: response.error, summary: response.error.error, failed: true }
          const now = deps.now()
          const summaries = response.value.map((t) => toTicketSummary(t, now))
          noteOverdue(summaries)
          if (summaries.length > 0) pushTicketsCard(summaries)
          return { result: { tickets: summaries }, summary: `${summaries.length} chamado(s)` }
        }),
    }),

    getTicket: tool({
      description: 'Detalhes de um chamado do funcionário pelo número (ex.: INC-20311).',
      inputSchema: z.object({ id: z.string() }),
      execute: (input) =>
        track('getTicket', `consultou o chamado ${input.id}`, input, async () => {
          const response = await ownedTicket(input.id)
          if (!response.ok) {
            return {
              result: response.error,
              summary: response.error.error,
              failed: response.error.error === 'tickets_unavailable',
            }
          }
          const summary = toTicketSummary(response.value, deps.now())
          noteOverdue([summary])
          pushTicketsCard([summary])
          return {
            result: { ticket: summary, lastComments: response.value.comments.slice(-3) },
            summary: `${summary.id} ${summary.status}${summary.overdue ? ' (vencido)' : ''}`,
          }
        }),
    }),

    findSimilarOpenTicket: tool({
      description:
        'Procura um chamado ABERTO do funcionário sobre o mesmo problema, para não abrir duplicado.',
      inputSchema: z.object({ category: Category, problem: z.string() }),
      execute: (input) =>
        track('findSimilarOpenTicket', 'procurou chamado parecido', input, async () => {
          const response = await guarded(() => deps.tickets.listTickets(deps.requesterId))
          if (!response.ok)
            return { result: response.error, summary: response.error.error, failed: true }
          const match = findSimilarOpenTicket(response.value, {
            category: input.category,
            text: input.problem,
          })
          if (!match) return { result: { similar: null }, summary: 'nenhum parecido' }
          sink.rulesApplied.push('DUPLICATE_CHECK')
          const summary = toTicketSummary(match.ticket, deps.now())
          pushTicketsCard([summary])
          return {
            result: { similar: summary, similarity: Number(match.similarity.toFixed(2)) },
            summary: `parecido com ${summary.id} (${match.similarity.toFixed(2)})`,
          }
        }),
    }),

    draftTicket: tool({
      description:
        'Monta o RASCUNHO de um chamado novo. Não grava nada: o funcionário confirma no botão. ' +
        'Informe os sinais de prioridade; a prioridade e o prazo são calculados pelo sistema.',
      inputSchema: z.object({
        type: TicketType.describe('INC = algo quebrou; REQ = pedido de algo novo'),
        category: Category,
        title: z.string().min(5).max(80),
        description: z.string().min(10).describe('O que acontece, desde quando, o que já tentou'),
        affected: Affected.describe('one = só a pessoa; team = a equipe; company = a empresa'),
        blocksWork: z.boolean().describe('A pessoa (ou equipe) está impedida de trabalhar?'),
        deadlineToday: z.boolean().describe('Há prazo de entrega hoje dependendo disso?'),
      }),
      execute: (input) =>
        track('draftTicket', 'classificou a prioridade e montou o rascunho', input, async () => {
          const decision = classifyPriority(input)
          sink.rulesApplied.push(decision.ruleId)
          const dueAt = computeDueAt(deps.now(), decision.priority)
          const draft = nextDraft('create', null, {
            type: input.type,
            title: input.title,
            description: input.description,
            category: input.category,
            priority: decision.priority,
            affected: input.affected,
            priorityReason: decision.reason,
            slaLabel: SLA_LABELS[decision.priority],
            dueAtPreview: dueAt.toISOString(),
          })
          return {
            result: { draft, note: 'Rascunho pronto. Peça para a pessoa conferir e confirmar.' },
            summary: `rascunho v${draft.version}: ${decision.priority} (${decision.ruleId})`,
          }
        }),
    }),

    draftTicketUpdate: tool({
      description:
        'Monta o RASCUNHO de um complemento para um chamado aberto do funcionário. Não grava nada.',
      inputSchema: z.object({ ticketId: z.string(), comment: z.string().min(5) }),
      execute: (input) =>
        track('draftTicketUpdate', `montou o complemento do ${input.ticketId}`, input, async () => {
          const response = await ownedTicket(input.ticketId)
          if (!response.ok)
            return {
              result: response.error,
              summary: response.error.error,
              failed: response.error.error === 'tickets_unavailable',
            }
          if (!OPEN_STATUSES.includes(response.value.status)) {
            return {
              result: {
                error: 'not_open',
                message: 'Este chamado não está aberto. Se voltou a acontecer, ofereça reabrir.',
              },
              summary: 'chamado não está aberto',
            }
          }
          const draft = nextDraft(
            'update',
            input.ticketId,
            fieldsFrom(response.value, input.comment),
          )
          return { result: { draft }, summary: `complemento v${draft.version}` }
        }),
    }),

    draftReopen: tool({
      description:
        'Monta o RASCUNHO de reabertura de um chamado resolvido. O sistema confere a regra dos 7 dias.',
      inputSchema: z.object({ ticketId: z.string(), reason: z.string().min(5) }),
      execute: (input) =>
        track(
          'draftReopen',
          `conferiu se o ${input.ticketId} pode ser reaberto`,
          input,
          async () => {
            const response = await ownedTicket(input.ticketId)
            if (!response.ok)
              return {
                result: response.error,
                summary: response.error.error,
                failed: response.error.error === 'tickets_unavailable',
              }
            const check = canReopen(response.value, deps.now())
            sink.rulesApplied.push(
              check.allowed ? 'REOPEN_WITHIN_7_DAYS' : 'REOPEN_DENIED_AFTER_7_DAYS',
            )
            if (!check.allowed) {
              return {
                result: {
                  error: 'cannot_reopen',
                  message: check.reason,
                  suggestion: 'Ofereça abrir um chamado novo citando o antigo.',
                },
                summary: 'fora da janela de 7 dias',
              }
            }
            const draft = nextDraft(
              'reopen',
              input.ticketId,
              fieldsFrom(response.value, input.reason),
            )
            return { result: { draft }, summary: `reabertura v${draft.version}` }
          },
        ),
    }),
  }

  function noteOverdue(summaries: { id: string; overdue: boolean }[]) {
    for (const s of summaries) {
      if (s.overdue && !sink.overdueTicketIds.includes(s.id)) sink.overdueTicketIds.push(s.id)
    }
  }

  function pushTicketsCard(tickets: ReturnType<typeof toTicketSummary>[]) {
    const card: Card = { type: 'tickets', tickets }
    sink.cards.push(card)
    sink.events.push({ type: 'card', card })
  }
}

function fieldsFrom(ticket: Ticket, text: string) {
  return {
    type: ticket.type,
    title: ticket.title,
    description: text,
    category: ticket.category,
    priority: ticket.priority,
    affected: ticket.affected,
    priorityReason: null,
    slaLabel: null,
    dueAtPreview: null,
  }
}
