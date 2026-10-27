import {
  CircuitBreaker,
  createTicketsClient,
  runTurn,
  type AgentConfig,
  type DecisionEngine,
  type HistoryMessage,
  type LanguageModel,
  type TurnResult,
} from '@nexo/agent'
import type { StreamEvent } from '@nexo/shared'
import { createInMemoryTicketsService } from '@nexo/tickets-service/testing'
import type { Scenario } from './scenarios'

/** Terça, 12h em São Paulo: mesma data usada nos testes do serviço de chamados. */
export const EVAL_NOW = new Date('2026-10-27T15:00:00Z')

export type ScenarioRun = {
  scenario: Scenario
  passed: boolean
  failures: string[]
  result: TurnResult
  events: StreamEvent[]
}

/** Roda as mensagens do cenário em sequência e confere o último turno. */
export async function runScenario(
  scenario: Scenario,
  deps: { config: AgentConfig; model: LanguageModel; decision: DecisionEngine },
): Promise<ScenarioRun> {
  const service = await createInMemoryTicketsService(EVAL_NOW)
  service.chaos.state.failureRate = scenario.chaos ?? 0
  const tickets = createTicketsClient({
    baseUrl: 'http://tickets',
    serviceToken: service.serviceToken,
    fetchFn: service.fetchFn,
    sleep: async () => {},
    breaker: new CircuitBreaker(),
  })

  const history: HistoryMessage[] = []
  let result: TurnResult | undefined
  let events: StreamEvent[] = []

  for (const text of scenario.messages) {
    events = []
    const turn = runTurn({
      ...deps,
      tickets,
      requesterId: scenario.requesterId,
      userName: scenario.userName,
      text,
      history,
      pendingDraft: result?.draft ?? null,
      now: () => EVAL_NOW,
    })
    let step = await turn.next()
    while (!step.done) {
      events.push(step.value)
      step = await turn.next()
    }
    result = step.value
    history.push({ role: 'user', content: text }, { role: 'assistant', content: result.text })
  }
  if (!result) throw new Error(`Cenário ${scenario.id} sem mensagens`)

  const failures = check(scenario, result, events)
  return { scenario, passed: failures.length === 0, failures, result, events }
}

function check(scenario: Scenario, result: TurnResult, events: StreamEvent[]): string[] {
  const e = scenario.expect
  const { trace } = result
  const failures: string[] = []
  const called = trace.actions.map((a) => a.tool)
  const fail = (message: string) => failures.push(message)

  if (e.intent && trace.understood.intent !== e.intent) {
    fail(`intenção ${trace.understood.intent}, esperado ${e.intent}`)
  }
  if (e.handoff !== undefined && (result.handoff?.reason ?? null) !== e.handoff) {
    fail(`transferência ${result.handoff?.reason ?? 'nenhuma'}, esperado ${e.handoff ?? 'nenhuma'}`)
  }
  for (const tool of e.toolsCalled ?? []) {
    if (!called.includes(tool)) fail(`não chamou ${tool} (chamou: ${called.join(', ') || 'nada'})`)
  }
  for (const tool of e.toolsNotCalled ?? []) {
    if (called.includes(tool)) fail(`chamou ${tool}, que era proibido`)
  }
  if (e.noTools && called.length > 0) fail(`chamou tools: ${called.join(', ')}`)
  if (e.draft === null && result.draft) fail(`criou rascunho ${result.draft.kind}`)
  if (e.draft) {
    const d = result.draft
    if (!d) fail('não criou rascunho')
    else {
      if (d.kind !== e.draft.kind) fail(`rascunho ${d.kind}, esperado ${e.draft.kind}`)
      if (e.draft.type && d.type !== e.draft.type) fail(`tipo ${d.type}, esperado ${e.draft.type}`)
      if (e.draft.priority && d.priority !== e.draft.priority) {
        fail(`prioridade ${d.priority}, esperado ${e.draft.priority}`)
      }
    }
  }
  if (e.quickReplyHandoff) {
    const offered = result.quickReplies.some(
      (q) => q.action.type === 'handoff' && q.action.reason === e.quickReplyHandoff,
    )
    if (!offered) fail(`não ofereceu analista (${e.quickReplyHandoff})`)
  }
  for (const rule of e.rulesApplied ?? []) {
    if (!trace.rulesApplied.includes(rule)) fail(`regra ${rule} não aplicada`)
  }
  for (const id of e.mustNotReveal ?? []) {
    const inCards = JSON.stringify(result.cards).includes(id)
    const statusLeak =
      result.text.includes(id) && /andamento|aberto|resolvido|aguardando/i.test(result.text)
    if (inCards || statusLeak) fail(`revelou ${id}`)
  }
  if (e.notice && !events.some((ev) => ev.type === 'notice'))
    fail('não mostrou aviso de instabilidade')
  if (e.noTokens && trace.tokens.input + trace.tokens.output > 0)
    fail('chamou o modelo sem precisar')
  return failures
}
