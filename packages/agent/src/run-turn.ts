import type {
  Card,
  DecisionTrace,
  Draft,
  HandoffReason,
  QuickReply,
  StreamEvent,
} from '@nexo/shared'
import { isStepCount, streamText, type LanguageModel } from 'ai'
import { costUsd, type AgentConfig } from './config'
import { buildHandoffSummary } from './handoff-summary'
import { buildAgentInstructions, GREETING_REPLY, HANDOFF_REPLIES } from './prompts'
import { computeConfidence } from './rules/confidence'
import { decideHandoff } from './rules/handoff'
import { checkScope, GENERIC_OUT_OF_SCOPE_REPLY, outOfScopeReply } from './rules/scope'
import type { TicketsClient } from './tickets-client/client'
import { createTools, createTurnSink, TOOLS_BY_INTENT, type TurnSink } from './tools'
import type { DecisionEngine, HistoryMessage, Understanding } from './understanding'

export type TurnInput = {
  config: AgentConfig
  model: LanguageModel
  decision: DecisionEngine
  tickets: TicketsClient
  /** Da sessão do login, nunca do modelo. */
  requesterId: string
  userName: string
  text: string
  history: HistoryMessage[]
  pendingDraft: Draft | null
  now?: () => Date
}

export type TurnResult = {
  text: string
  cards: Card[]
  quickReplies: QuickReply[]
  draft: Draft | null
  handoff: { reason: HandoffReason; summary: string } | null
  trace: DecisionTrace
}

/**
 * Um turno do agent: recebe a mensagem e vai devolvendo eventos para a tela (streaming).
 *
 * 1. Escopo por palavras-chave (sem gastar LLM).
 * 2. Entender: intenção, confiança, se é crítico.
 * 3. Regras de transferência (pedido, crítico, baixa confiança). Se transferir, para aqui.
 * 4. Responder com o LLM usando só as tools daquela intenção.
 * 5. Regras depois da resposta: vencido oferece analista, falha de tool avisa, trace.
 */
export async function* runTurn(input: TurnInput): AsyncGenerator<StreamEvent, TurnResult> {
  const startedAt = Date.now()
  const now = input.now ?? (() => new Date())
  const { config } = input
  const history = input.history.slice(-config.historyWindow)
  const sink = createTurnSink()
  const rationale: string[] = []
  const tokens = { input: 0, output: 0 }

  // 1. Escopo: RH, financeiro e facilities nem chegam ao modelo.
  const scope = checkScope(input.text)
  let understanding: Understanding
  if (!scope.inScope) {
    sink.rulesApplied.push(`SCOPE_OUT_${scope.area.toUpperCase()}`)
    understanding = fixedUnderstanding('out_of_scope', `Assunto de ${scope.area}.`, input.text)
    rationale.push(`Termo de ${scope.area} encontrado: redirecionei sem chamar o modelo.`)
  } else {
    // 2. Entender.
    try {
      understanding = await input.decision.understand({ text: input.text, history })
      tokens.input += understanding.tokens.input
      tokens.output += understanding.tokens.output
      rationale.push(`Intenção "${understanding.intent}" (decidida por ${understanding.engine}).`)
    } catch {
      sink.rulesApplied.push('LLM_UNAVAILABLE')
      understanding = {
        ...fixedUnderstanding('unknown', 'O modelo não respondeu.', input.text),
        confidence: 0,
      }
      rationale.push('O modelo não respondeu; tratei como baixa confiança.')
    }
  }

  const preConfidence = computeConfidence({
    modelConfidence: understanding.confidence,
    modelReason: understanding.confidenceReason,
    intent: understanding.intent,
  })

  // 3. Transferência antes de responder.
  const handoffDecision = decideHandoff({
    intent: understanding.intent,
    isCritical: understanding.isCritical,
    confidence: preConfidence.value,
    threshold: config.confidenceThreshold,
  })

  let text = ''
  let llmFailed = false
  let handoff: TurnResult['handoff'] = null

  if (handoffDecision) {
    sink.rulesApplied.push(handoffDecision.ruleId)
    rationale.push(`Transferi para analista: ${handoffDecision.ruleId}.`)
    text = HANDOFF_REPLIES[handoffDecision.reason]
    handoff = {
      reason: handoffDecision.reason,
      summary: buildHandoffSummary({
        userName: input.userName,
        reason: handoffDecision.reason,
        understoodSummary: understanding.summary,
        history: [...history, { role: 'user', content: input.text }],
        ticketIds: understanding.mentionedTicketId ? [understanding.mentionedTicketId] : [],
      }),
    }
    yield { type: 'text-delta', text }
    yield { type: 'status', status: 'waiting_analyst', reason: handoffDecision.reason }
  } else if (understanding.intent === 'out_of_scope') {
    text = scope.inScope ? GENERIC_OUT_OF_SCOPE_REPLY : outOfScopeReply(scope)
    yield { type: 'text-delta', text }
  } else if (understanding.intent === 'greeting') {
    text = GREETING_REPLY(input.userName.split(' ')[0] ?? input.userName)
    yield { type: 'text-delta', text }
  } else {
    // 4. Responder com o LLM e as tools permitidas para a intenção.
    const allTools = createTools(
      {
        tickets: input.tickets,
        requesterId: input.requesterId,
        now,
        pendingDraft: input.pendingDraft,
      },
      sink,
    )
    const allowed = TOOLS_BY_INTENT[understanding.intent] ?? []
    const tools = Object.fromEntries(allowed.map((name) => [name, allTools[name]]))
    rationale.push(allowed.length ? `Tools liberadas: ${allowed.join(', ')}.` : 'Sem tools.')

    const result = streamText({
      model: input.model,
      instructions: buildAgentInstructions({
        userName: input.userName,
        now: now(),
        intent: understanding.intent,
        pendingDraft: input.pendingDraft,
      }),
      messages: [...history, { role: 'user', content: input.text }],
      tools,
      stopWhen: isStepCount(config.maxSteps),
      onError: () => {},
    })

    try {
      for await (const part of result.stream) {
        yield* drain(sink)
        if (part.type === 'text-delta') {
          text += part.text
          yield { type: 'text-delta', text: part.text }
        } else if (part.type === 'error') {
          throw part.error
        }
      }
      yield* drain(sink)
      const usage = await result.totalUsage
      tokens.input += usage.inputTokens ?? 0
      tokens.output += usage.outputTokens ?? 0
      // O modelo pode gastar todos os passos em tools e não escrever nada: nunca salvar resposta vazia.
      if (!text.trim()) {
        sink.rulesApplied.push('EMPTY_REPLY_FALLBACK')
        text =
          sink.cards.length > 0
            ? 'Veja o que encontrei:'
            : 'Não consegui concluir a resposta agora. Pode reformular ou falar com um analista.'
        yield { type: 'text-delta', text }
      }
    } catch {
      yield* drain(sink)
      sink.rulesApplied.push('LLM_STREAM_FAILED')
      const fallback =
        'Tive um problema para responder agora. Pode tentar de novo ou falar com um analista.'
      text += text ? `\n\n${fallback}` : fallback
      yield { type: 'text-delta', text: fallback }
      llmFailed = true
    }
  }

  // 5. Regras depois da resposta.
  const quickReplies: QuickReply[] = []
  const firstOverdue = sink.overdueTicketIds[0]
  if (firstOverdue) {
    sink.rulesApplied.push('OVERDUE_OFFER_ANALYST')
    rationale.push(`${firstOverdue} está vencido: ofereci analista (não transfiro sozinho).`)
    quickReplies.push({
      label: `Falar com analista sobre o ${firstOverdue}`,
      action: { type: 'handoff', reason: 'overdue' },
    })
  }

  if (sink.toolFailed) {
    yield {
      type: 'notice',
      level: 'warning',
      text: 'O sistema de chamados está instável. Tentei 3 vezes; seus dados não foram perdidos.',
    }
  }

  const confidence = computeConfidence({
    modelConfidence: understanding.confidence,
    modelReason: understanding.confidenceReason,
    intent: understanding.intent,
    toolFailed: sink.toolFailed || llmFailed,
    weakArticleMatch: understanding.intent === 'question' && sink.weakArticleMatch,
  })
  sink.rulesApplied.push(...confidence.capsApplied)

  // Já respondeu, mas a confiança caiu (ex.: tool falhou): oferece analista em vez de transferir.
  if (!handoff && confidence.value < config.confidenceThreshold && quickReplies.length === 0) {
    quickReplies.push({
      label: 'Falar com um analista',
      action: { type: 'handoff', reason: 'requested' },
    })
  }
  if (quickReplies.length > 0) yield { type: 'quick-replies', options: quickReplies }

  const trace: DecisionTrace = {
    understood: {
      intent: understanding.intent,
      entities: entitiesOf(understanding, sink),
      summary: understanding.summary,
    },
    actions: sink.actions,
    confidence: Number(confidence.value.toFixed(2)),
    confidenceReason: confidence.reason,
    rationale: rationale.join(' '),
    rulesApplied: sink.rulesApplied,
    handoff: handoff?.reason ?? null,
    tokens,
    costUsd: costUsd(config, tokens.input, tokens.output),
    model: config.llmModel,
    latencyMs: Date.now() - startedAt,
  }
  yield { type: 'trace', trace }

  return { text, cards: sink.cards, quickReplies, draft: sink.draft, handoff, trace }
}

function* drain(sink: TurnSink): Generator<StreamEvent> {
  while (sink.events.length > 0) {
    const event = sink.events.shift()
    if (event) yield event
  }
}

function fixedUnderstanding(
  intent: Understanding['intent'],
  reason: string,
  text: string,
): Understanding {
  return {
    intent,
    confidence: 1,
    confidenceReason: reason,
    summary: text.slice(0, 200),
    isCritical: false,
    mentionedTicketId: null,
    tokens: { input: 0, output: 0 },
    engine: 'regra',
  }
}

function entitiesOf(understanding: Understanding, sink: TurnSink): Record<string, string> {
  const entities: Record<string, string> = {}
  if (understanding.mentionedTicketId) entities.ticketId = understanding.mentionedTicketId
  if (sink.draft?.category) entities.category = sink.draft.category
  if (sink.draft?.priority) entities.priority = sink.draft.priority
  return entities
}
