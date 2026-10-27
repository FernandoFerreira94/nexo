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
  ConflictError,
  ForbiddenError,
  getActiveConversation,
  getOwnConversation,
  listMessages,
  listQueue,
  NotFoundError,
  pruneStaleConversations,
  returnToAgent,
  startNewConversation,
} from './conversations'
import { simulateQueue } from './demo'
import { openAppDb } from './db/client'
import { cancelDraft, confirmDraft } from './drafts'
import type { Runtime } from './runtime'

const ana = { id: 'u_ana', name: 'Ana Souza' }

async function setup(env: Record<string, string> = {}, dbPath = ':memory:') {
  const service = await createInMemoryTicketsService(new Date())
  const config = loadAgentConfig({ LLM_PROVIDER: 'mock', ...env })
  const model = createChatModel(config)
  const rt: Runtime = {
    db: await openAppDb(dbPath),
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
    dailyTurnLimit: Number(env.LLM_DAILY_TURN_LIMIT ?? 0),
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
    const { rt } = await setup()
    const events = await collect(handleEmployeeMessage(rt, ana, 'Como está o meu chamado?'))
    expect(events.some((e) => e.type === 'trace')).toBe(true)

    const conversation = await getActiveConversation(rt.db, ana.id)
    const messages = await listMessages(rt.db, conversation.id)
    expect(messages.map((m) => m.role)).toEqual(['employee', 'agent'])
    expect(messages[1]?.trace?.understood.intent).toBe('ticket_status')
    expect(conversation.overdueTicketIds).toContain('INC-20311')
  })

  it('rascunho só vira chamado no Confirmar, e confirmar duas vezes não duplica', async () => {
    const { rt } = await setup()
    await collect(
      handleEmployeeMessage(rt, ana, 'A VPN dá erro 809 e não consigo trabalhar. Uso Windows 11.'),
    )
    const before = await rt.tickets.listTickets(ana.id)
    const { draft } = await findDraft(rt)

    const message = await confirmDraft(rt, ana.id, draft.id, draft.version)
    expect(message.content).toMatch(/INC-\d+/)
    await expect(confirmDraft(rt, ana.id, draft.id, draft.version)).rejects.toThrow()
    expect(await rt.tickets.listTickets(ana.id)).toHaveLength(before.length + 1)
  })

  it('outro funcionário não confirma nem cancela o rascunho da Ana', async () => {
    const { rt } = await setup()
    await collect(
      handleEmployeeMessage(rt, ana, 'A VPN dá erro 809 e não consigo trabalhar. Uso Windows 11.'),
    )
    const { draft } = await findDraft(rt)
    await expect(confirmDraft(rt, 'u_bruno', draft.id, 1)).rejects.toBeInstanceOf(NotFoundError)
    await expect(cancelDraft(rt, 'u_bruno', draft.id, 1)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('conversa de outra pessoa responde 404', async () => {
    const { rt } = await setup()
    const conversation = await getActiveConversation(rt.db, ana.id)
    await expect(getOwnConversation(rt.db, conversation.id, 'u_bruno')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('com analista, o agent não responde; devolver reativa o agent', async () => {
    const { rt } = await setup()
    await collect(handleEmployeeMessage(rt, ana, 'Quero falar com um analista'))
    const conversation = await getActiveConversation(rt.db, ana.id)
    expect(conversation.status).toBe('waiting_analyst')
    expect((await listQueue(rt.db))[0]?.handoffSummary).toContain('Pedido do funcionário')

    await assume(rt.db, conversation.id, 'u_marcos')
    const events = await collect(handleEmployeeMessage(rt, ana, 'Oi, alguém aí?'))
    expect(events.some((e) => e.type === 'text-delta')).toBe(false)

    await expect(analystReply(rt.db, conversation.id, 'u_patricia', 'oi')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    await analystReply(rt.db, conversation.id, 'u_marcos', 'Oi Ana, estou vendo aqui.')
    await returnToAgent(rt.db, conversation.id, 'u_marcos')

    const after = await collect(handleEmployeeMessage(rt, ana, 'Oi'))
    expect(after.some((e) => e.type === 'text-delta')).toBe(true)
  })

  it('dois analistas assumindo ao mesmo tempo: só um fica com a conversa', async () => {
    const { rt } = await setup()
    await collect(handleEmployeeMessage(rt, ana, 'Quero falar com um analista'))
    const conversation = await getActiveConversation(rt.db, ana.id)

    const results = await Promise.allSettled([
      assume(rt.db, conversation.id, 'u_marcos'),
      assume(rt.db, conversation.id, 'u_patricia'),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find((r) => r.status === 'rejected')?.reason).toBeInstanceOf(ConflictError)
    const joined = (await listMessages(rt.db, conversation.id)).filter((m) =>
      m.content.includes('entrou na conversa'),
    )
    expect(joined).toHaveLength(1)
  })

  it('botão de vencido transfere com o chamado no resumo', async () => {
    const { rt } = await setup()
    await collect(handleEmployeeMessage(rt, ana, 'Qual o status do INC-20311?'))
    await collect(handleQuickHandoff(rt, ana, 'overdue'))
    const [item] = await listQueue(rt.db)
    expect(item?.handoffReason).toBe('overdue')
    expect(item?.handoffSummary).toContain('INC-20311')
  })

  it('no limite de mensagens transfere sem chamar o agent', async () => {
    const { rt } = await setup({ SESSION_MESSAGE_LIMIT: '2', SESSION_MESSAGE_WARN_AT: '1' })
    const first = await collect(handleEmployeeMessage(rt, ana, 'Oi'))
    expect(first.some((e) => e.type === 'notice')).toBe(true)
    await collect(handleEmployeeMessage(rt, ana, 'Oi de novo'))
    expect((await getActiveConversation(rt.db, ana.id)).handoffReason).toBe('message_limit')
  })

  it('teto diário: passou do limite, responde sem chamar o modelo', async () => {
    const { rt } = await setup({ LLM_DAILY_TURN_LIMIT: '1' })
    const first = await collect(handleEmployeeMessage(rt, ana, 'Como está o meu chamado?'))
    expect(first.some((e) => e.type === 'trace')).toBe(true)
    const second = await collect(handleEmployeeMessage(rt, ana, 'Como está o meu chamado?'))
    expect(second.some((e) => e.type === 'trace')).toBe(false)
    expect(second.find((e) => e.type === 'text-delta')).toMatchObject({
      text: expect.stringContaining('limite de uso'),
    })
  })

  it('demo: conversas paradas são apagadas, as recentes ficam', async () => {
    const { rt } = await setup()
    await collect(handleEmployeeMessage(rt, ana, 'Oi'))
    expect(await pruneStaleConversations(rt.db, '2000-01-01T00:00:00Z')).toBe(0)
    expect(await pruneStaleConversations(rt.db, '2999-01-01T00:00:00Z')).toBe(1)
    const fresh = await getActiveConversation(rt.db, ana.id)
    expect(await listMessages(rt.db, fresh.id)).toHaveLength(0)
  })

  it('nova conversa encerra a atual; com analista não deixa', async () => {
    const { rt } = await setup()
    await collect(handleEmployeeMessage(rt, ana, 'Oi'))
    const before = await getActiveConversation(rt.db, ana.id)
    const fresh = await startNewConversation(rt.db, ana.id)
    expect(fresh.id).not.toBe(before.id)
    expect(await startNewConversation(rt.db, ana.id)).toMatchObject({ id: fresh.id }) // vazia: reaproveita

    await collect(handleEmployeeMessage(rt, ana, 'Quero falar com um analista'))
    await expect(startNewConversation(rt.db, ana.id)).rejects.toBeInstanceOf(ConflictError)
  })

  it('simulação de fila: crítico primeiro, um já em atendimento, sem duplicar', async () => {
    const { rt } = await setup()
    expect(await simulateQueue(rt.db)).toBe(4)
    expect(await simulateQueue(rt.db)).toBe(0)
    const queue = await listQueue(rt.db)
    expect(queue[0]?.handoffReason).toBe('critical')
    expect(queue.filter((c) => c.status === 'with_analyst')).toHaveLength(1)
  })

  it('conversa, estado e traces sobrevivem a reiniciar o processo', async () => {
    const dir = await import('node:fs').then((fs) =>
      fs.mkdtempSync(`${(process.env.TMPDIR ?? '/tmp').replace(/\/$/, '')}/nexo-`),
    )
    const path = `${dir}/app.db`
    const first = await setup({}, path)
    await collect(handleEmployeeMessage(first.rt, ana, 'Quero falar com um analista'))

    const second = await setup({}, path) // "reinício": novo processo abrindo o mesmo arquivo
    const conversation = await getActiveConversation(second.rt.db, ana.id)
    expect(conversation.status).toBe('waiting_analyst')
    expect((await listMessages(second.rt.db, conversation.id)).at(-1)?.trace?.handoff).toBe(
      'requested',
    )
  })
})

async function findDraft(rt: Runtime) {
  const conversation = await getActiveConversation(rt.db, ana.id)
  const card = (await listMessages(rt.db, conversation.id))
    .flatMap((m) => m.cards)
    .find((c) => c.type === 'draft')
  if (card?.type !== 'draft') throw new Error('sem rascunho')
  return card
}
