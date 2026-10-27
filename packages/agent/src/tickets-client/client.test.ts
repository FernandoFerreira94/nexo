import { describe, expect, it, vi } from 'vitest'
import { CircuitBreaker } from './circuit-breaker'
import { createTicketsClient, TicketNotFoundError, TicketsUnavailableError } from './client'

const ticketJson = {
  id: 'INC-1',
  type: 'INC',
  title: 'Teste',
  description: 'Descrição de teste',
  category: 'software',
  priority: 'medium',
  status: 'open',
  requesterId: 'u_ana',
  affected: 'one',
  createdAt: '2026-10-27T10:00:00.000Z',
  updatedAt: '2026-10-27T10:00:00.000Z',
  slaStartAt: '2026-10-27T10:00:00.000Z',
  dueAt: '2026-10-30T10:00:00.000Z',
  resolvedAt: null,
  comments: [],
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function clientWith(responses: Array<() => Response>, breaker = new CircuitBreaker(5, 10_000)) {
  const fetchFn = vi.fn(async () => {
    const next = responses.shift()
    if (!next) throw new Error('sem resposta')
    return next()
  })
  const client = createTicketsClient({
    baseUrl: 'http://tickets',
    serviceToken: 't',
    fetchFn: fetchFn as unknown as typeof fetch,
    sleep: async () => {},
    breaker,
  })
  return { client, fetchFn }
}

describe('tickets-client', () => {
  it('tenta de novo depois de um 503 e devolve o resultado', async () => {
    const { client, fetchFn } = clientWith([
      () => json(503, { error: 'service_unavailable' }),
      () => json(200, [ticketJson]),
    ])
    const tickets = await client.listTickets('u_ana')
    expect(tickets).toHaveLength(1)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('desiste depois de 3 tentativas com TicketsUnavailableError', async () => {
    const { client, fetchFn } = clientWith([
      () => json(503, {}),
      () => json(503, {}),
      () => json(503, {}),
    ])
    await expect(client.listTickets('u_ana')).rejects.toBeInstanceOf(TicketsUnavailableError)
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('404 não é repetido e vira TicketNotFoundError', async () => {
    const { client, fetchFn } = clientWith([() => json(404, { error: 'not_found' })])
    await expect(client.getTicket('INC-9', 'u_ana')).rejects.toBeInstanceOf(TicketNotFoundError)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('envia Idempotency-Key nas escritas', async () => {
    const { client, fetchFn } = clientWith([() => json(201, ticketJson)])
    await client.createTicket(
      {
        type: 'INC',
        title: 'Teste',
        description: 'Descrição longa o bastante',
        category: 'software',
        priority: 'medium',
        affected: 'one',
        requesterId: 'u_ana',
      },
      'draft-1:1',
    )
    const init = fetchFn.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>)['idempotency-key']).toBe('draft-1:1')
  })

  it('circuito aberto recusa na hora, sem chamar o serviço', async () => {
    const breaker = new CircuitBreaker(1, 60_000)
    breaker.recordFailure()
    const { client, fetchFn } = clientWith([], breaker)
    await expect(client.listTickets('u_ana')).rejects.toBeInstanceOf(TicketsUnavailableError)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
