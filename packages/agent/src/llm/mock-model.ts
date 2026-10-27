import type { LanguageModelV4StreamPart } from '@ai-sdk/provider'
import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { guessCategory, guessSignals } from './heuristics'
import { extractTicketId } from '../ticket-summary'

/**
 * Modelo de mentira para rodar sem chave (LLM_PROVIDER=mock). Segue um roteiro fixo:
 * olha quais tools recebeu (isso diz a intenção) e quais já rodaram neste turno,
 * e chama a próxima tool ou escreve a resposta. Só existe para demo offline, testes e CI.
 */
type ToolResult = { toolName: string; value: unknown }

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
}

type Step = { call: { toolName: string; input: unknown } } | { text: string }

export function createMockChatModel() {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'mock',
    doStream: async (options) => {
      const userText = lastUserText(options.prompt)
      const results = toolResultsSinceLastUser(options.prompt)
      const tools = new Set((options.tools ?? []).map((t) => t.name))
      const step = planNextStep(userText, tools, results)

      const chunks: LanguageModelV4StreamPart[] =
        'call' in step
          ? [
              {
                type: 'tool-call',
                toolCallId: `call-${results.length + 1}`,
                toolName: step.call.toolName,
                input: JSON.stringify(step.call.input),
              },
              { type: 'finish', usage, finishReason: { unified: 'tool-calls', raw: undefined } },
            ]
          : [
              { type: 'text-start', id: 't1' },
              ...splitWords(step.text).map((delta) => ({
                type: 'text-delta' as const,
                id: 't1',
                delta,
              })),
              { type: 'text-end', id: 't1' },
              { type: 'finish', usage, finishReason: { unified: 'stop', raw: undefined } },
            ]
      return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 5 }) }
    },
  })
}

/** O roteiro. Cada intenção usa um conjunto diferente de tools (TOOLS_BY_INTENT). */
export function planNextStep(text: string, tools: Set<string>, results: ToolResult[]): Step {
  const done = (name: string) =>
    results.find((r) => r.toolName === name)?.value as Record<string, unknown> | undefined
  const failed = results.some((r) => isError(r.value, 'tickets_unavailable'))
  if (failed) {
    return {
      text: 'O sistema de chamados está instável agora. Tente de novo em instantes ou peça para falar com um analista.',
    }
  }
  const ticketId = extractTicketId(text)

  if (tools.has('getTicket') || (tools.has('listMyTickets') && tools.size === 1)) {
    if (ticketId && !done('getTicket'))
      return { call: { toolName: 'getTicket', input: { id: ticketId } } }
    if (!ticketId && !done('listMyTickets'))
      return { call: { toolName: 'listMyTickets', input: {} } }
    const single = done('getTicket')
    if (single && isError(single, 'not_found')) {
      return { text: `Não encontrei o ${ticketId} entre os seus chamados. Confira o número?` }
    }
    return { text: 'Aqui estão os seus chamados com o status e o prazo de cada um.' }
  }

  if (tools.has('draftReopen')) {
    const list = done('listMyTickets')
    if (!list) return { call: { toolName: 'listMyTickets', input: {} } }
    const target = ticketId ?? firstTicket(list, (t) => t.status === 'resolved')
    if (!target) return { text: 'Não achei chamado resolvido recente. Quer abrir um novo?' }
    const reopen = done('draftReopen')
    if (!reopen)
      return { call: { toolName: 'draftReopen', input: { ticketId: target, reason: text } } }
    if (isError(reopen, 'cannot_reopen')) {
      return {
        text: `O ${target} foi resolvido há mais de 7 dias, então não dá para reabrir. Posso abrir um chamado novo citando ele.`,
      }
    }
    return { text: `Montei a reabertura do ${target}. Confira e confirme no botão.` }
  }

  if (tools.has('draftTicketUpdate')) {
    const list = done('listMyTickets')
    if (!list) return { call: { toolName: 'listMyTickets', input: {} } }
    const target =
      ticketId ??
      firstTicket(list, (t) =>
        ['open', 'awaiting_analyst', 'in_progress'].includes(String(t.status)),
      )
    if (!target)
      return { text: 'Você não tem chamado aberto para complementar. Quer abrir um novo?' }
    if (!done('draftTicketUpdate')) {
      return { call: { toolName: 'draftTicketUpdate', input: { ticketId: target, comment: text } } }
    }
    return { text: `Montei o complemento para o ${target}. Confira e confirme no botão.` }
  }

  if (tools.has('draftTicket')) {
    const kb = done('searchKnowledgeBase')
    if (!kb) return { call: { toolName: 'searchKnowledgeBase', input: { query: text } } }
    const category = guessCategory(text)
    const similar = done('findSimilarOpenTicket')
    if (!similar) {
      return { call: { toolName: 'findSimilarOpenTicket', input: { category, problem: text } } }
    }
    const match = similar.similar as { id?: string } | null | undefined
    if (match?.id && !done('draftTicket')) {
      return {
        text: `Você já tem o ${match.id} aberto sobre algo parecido. É o mesmo problema? Se for, eu complemento ele em vez de abrir outro.`,
      }
    }
    // Artigo resolve incidentes; pedidos (REQ) e o caso Windows 11 do KB-001 viram chamado.
    const article = strongArticle(kb)
    const signals = guessSignals(text)
    if (article && signals.type === 'INC' && !/windows 11/i.test(text) && !done('draftTicket')) {
      return { text: `Isso tem solução na central de ajuda (${article.id}): ${article.body}` }
    }
    if (!done('draftTicket')) {
      return {
        call: {
          toolName: 'draftTicket',
          input: { ...signals, category, title: text.slice(0, 60), description: text },
        },
      }
    }
    return {
      text: 'Montei o rascunho do chamado com a prioridade e o prazo. Confira e confirme no botão.',
    }
  }

  if (tools.has('searchKnowledgeBase')) {
    const kb = done('searchKnowledgeBase')
    if (!kb) return { call: { toolName: 'searchKnowledgeBase', input: { query: text } } }
    const article = strongArticle(kb)
    return article
      ? { text: `Segundo a central de ajuda (${article.id}): ${article.body}` }
      : { text: 'Não achei um artigo sobre isso. Quer que eu abra um chamado?' }
  }

  return { text: 'Pode me contar um pouco mais sobre o que está acontecendo?' }
}

type PromptMessage = { role: string; content: unknown }

function lastUserText(prompt: readonly PromptMessage[]): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const message = prompt[i]
    if (message?.role === 'user' && Array.isArray(message.content)) {
      return message.content
        .map((part: { type: string; text?: string }) =>
          part.type === 'text' ? (part.text ?? '') : '',
        )
        .join(' ')
    }
  }
  return ''
}

function toolResultsSinceLastUser(prompt: readonly PromptMessage[]): ToolResult[] {
  const results: ToolResult[] = []
  for (let i = prompt.length - 1; i >= 0; i--) {
    const message = prompt[i]
    if (!message || message.role === 'user') break
    if (message.role === 'tool' && Array.isArray(message.content)) {
      for (const part of message.content as {
        type: string
        toolName?: string
        output?: { value?: unknown }
      }[]) {
        if (part.type === 'tool-result' && part.toolName) {
          results.push({ toolName: part.toolName, value: part.output?.value })
        }
      }
    }
  }
  return results
}

function isError(value: unknown, code: string): boolean {
  return (
    typeof value === 'object' && value !== null && (value as { error?: unknown }).error === code
  )
}

function strongArticle(kb: Record<string, unknown>): { id: string; body: string } | null {
  const articles = (kb.articles ?? []) as { id: string; body: string; relevance: string }[]
  return articles.find((a) => a.relevance === 'alta') ?? null
}

function firstTicket(
  list: Record<string, unknown>,
  pick: (t: Record<string, unknown>) => boolean,
): string | null {
  const tickets = (list.tickets ?? []) as Record<string, unknown>[]
  const found = tickets.find(pick)
  return found ? String(found.id) : null
}

function splitWords(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text]
}
