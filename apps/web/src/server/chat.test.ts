import {
  createChatModel,
  createMockDecisionEngine,
  createTicketsClient,
  loadAgentConfig,
} from '@nexo/agent'
import type { StreamEvent } from '@nexo/shared'
import { createInMemoryTicketsService } from '@nexo/tickets-service/testing'
import { describe, expect, it } from 'vitest'
import { handleEmployeeMessage, handleQuickHandoff } from './chat'
import {
  analystReply,
  assume,
  ForbiddenError,
  getActiveConversation,
  getOwnConversation,
  listMessages,
  listQueue,
  NotFoundError,
  returnToAgent,
} from './conversations'
import { openAppDb } from './db/client'
import { cancelDraft, confirmDraft } from './drafts'
import type { Runtime } from './runtime'

const ana = { id: 'u_ana', name: 'Ana Souza' }

function setup(env: Record<string, string> = {}, dbPath = ':memory:') {
  const service = createInMemoryTicketsService(new Date())
  const config = loadAgentConfig({ LLM_PROVIDER: 'mock', ...env })
  const model = createChatModel(config)
  const rt: Runtime = {
    db: openAppDb(dbPath),
    config,
    model,
    decision: createMockDecisionEngine(),
    tickets: createTicketsClient({
      baseUrl: 'http://tickets',
      serviceToken: service.serviceToken,
      fetchFn: service.fetchFn,
      sleep: async () => {},
    }),
    authSecret: 'segredo-de-teste',
  }
  return { rt, service }
}

async function collect(events: AsyncGenerator<StreamEvent>) {
  const all: StreamEvent[] = []
  for await (const event of events) all.push(event)
  return all
}

describe('fluxo do chat', () => {
  it('salva a pergunta, a resposta e o trace de cada resposta do agent', async () => {
    const { rt } = setup()
    const events = await collect(handleEmployeeMessage(rt, ana, 'Como está o meu chamado?'))
    expect(events.some((e) => e.type === 'trace')).toBe(true)

    const conversation = getActiveConversation(rt.db, ana.id)
    const messages = listMessages(rt.db, conversation.id)
    expect(messages.map((m) => m.role)).toEqual(['employee', 'agent'])
    expect(messages[1]?.trace?.understood.intent).toBe('ticket_status')
    expect(conversation.overdueTicketIds).toContain('INC-20311')
  })

  it('rascunho só vira chamado no Confirmar, e confirmar duas vezes não duplica', async () => {
    const { rt } = setup()
    await collect(
      handleEmployeeMessage(rt, ana, 'A VPN dá erro 809 e não consigo trabalhar. Uso Windows 11.'),
    )
    const before = await rt.tickets.listTickets(ana.id)
    const draftCard = listMessages(rt.db, getActiveConversation(rt.db, ana.id).id)
      .flatMap((m) => m.cards)
      .find((c) => c.type === 'draft')
    if (draftCard?.type !== 'draft') throw new Error('sem rascunho')
    const { draft } = draftCard

    const message = await confirmDraft(rt, ana.id, draft.id, draft.version)
    expect(message.content).toMatch(/INC-\d+/)
    await expect(confirmDraft(rt, ana.id, draft.id, draft.version)).rejects.toThrow()
    expect(await rt.tickets.listTickets(ana.id)).toHaveLength(before.length + 1)
  })

  it('outro funcionário não confirma nem cancela o rascunho da Ana', async () => {
    const { rt } = setup()
    await collect(
      handleEmployeeMessage(rt, ana, 'A VPN dá erro 809 e não consigo trabalhar. Uso Windows 11.'),
    )
    const draftCard = listMessages(rt.db, getActiveConversation(rt.db, ana.id).id)
      .flatMap((m) => m.cards)
      .find((c) => c.type === 'draft')
    if (draftCard?.type !== 'draft') throw new Error('sem rascunho')
    await expect(confirmDraft(rt, 'u_bruno', draftCard.draft.id, 1)).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(() => cancelDraft(rt, 'u_bruno', draftCard.draft.id, 1)).toThrow(NotFoundError)
  })

  it('conversa de outra pessoa responde 404', () => {
    const { rt } = setup()
    const conversation = getActiveConversation(rt.db, ana.id)
    expect(() => getOwnConversation(rt.db, conversation.id, 'u_bruno')).toThrow(NotFoundError)
  })

  it('com analista, o agent não responde; devolver reativa o agent', async () => {
    const { rt } = setup()
    await collect(handleEmployeeMessage(rt, ana, 'Quero falar com um analista'))
    const conversation = getActiveConversation(rt.db, ana.id)
    expect(conversation.status).toBe('waiting_analyst')
    expect(listQueue(rt.db)[0]?.handoffSummary).toContain('Pedido do funcionário')

    assume(rt.db, conversation.id, 'u_marcos')
    const events = await collect(handleEmployeeMessage(rt, ana, 'Oi, alguém aí?'))
    expect(events.some((e) => e.type === 'text-delta')).toBe(false)

    expect(() => analystReply(rt.db, conversation.id, 'u_patricia', 'oi')).toThrow(ForbiddenError)
    analystReply(rt.db, conversation.id, 'u_marcos', 'Oi Ana, estou vendo aqui.')
    returnToAgent(rt.db, conversation.id, 'u_marcos')

    const after = await collect(handleEmployeeMessage(rt, ana, 'Oi'))
    expect(after.some((e) => e.type === 'text-delta')).toBe(true)
  })

  it('botão de vencido transfere com o chamado no resumo', async () => {
    const { rt } = setup()
    await collect(handleEmployeeMessage(rt, ana, 'Qual o status do INC-20311?'))
    await collect(handleQuickHandoff(rt, ana, 'overdue'))
    const [item] = listQueue(rt.db)
    expect(item?.handoffReason).toBe('overdue')
    expect(item?.handoffSummary).toContain('INC-20311')
  })

  it('no limite de mensagens transfere sem chamar o agent', async () => {
    const { rt } = setup({ SESSION_MESSAGE_LIMIT: '2', SESSION_MESSAGE_WARN_AT: '1' })
    const first = await collect(handleEmployeeMessage(rt, ana, 'Oi'))
    expect(first.some((e) => e.type === 'notice')).toBe(true)
    await collect(handleEmployeeMessage(rt, ana, 'Oi de novo'))
    expect(getActiveConversation(rt.db, ana.id).handoffReason).toBe('message_limit')
  })

  it('conversa, estado e traces sobrevivem a reiniciar o processo', async () => {
    const dir = await import('node:fs').then((fs) =>
      fs.mkdtempSync(`${(process.env.TMPDIR ?? '/tmp').replace(/\/$/, '')}/nexo-`),
    )
    const path = `${dir}/app.db`
    const first = setup({}, path)
    await collect(handleEmployeeMessage(first.rt, ana, 'Quero falar com um analista'))

    const second = setup({}, path) // "reinício": novo processo abrindo o mesmo arquivo
    const conversation = getActiveConversation(second.rt.db, ana.id)
    expect(conversation.status).toBe('waiting_analyst')
    expect(listMessages(second.rt.db, conversation.id).at(-1)?.trace?.handoff).toBe('requested')
  })
})
