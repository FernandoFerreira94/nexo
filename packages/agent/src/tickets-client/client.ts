import { Ticket, type CreateTicketInput, type UpdateTicketInput } from '@nexo/shared'
import { z } from 'zod'
import { CircuitBreaker } from './circuit-breaker'

/** O sistema de chamados não respondeu (503, timeout, rede ou circuito aberto). */
export class TicketsUnavailableError extends Error {
  constructor(message = 'O sistema de chamados está instável no momento.') {
    super(message)
  }
}
/** Chamado inexistente ou de outra pessoa (o serviço não diferencia, de propósito). */
export class TicketNotFoundError extends Error {}
/** O serviço recusou por regra de negócio (ex.: reabrir depois de 7 dias). */
export class TicketRuleError extends Error {}

export type TicketsClientOptions = {
  baseUrl: string
  serviceToken: string
  timeoutMs?: number
  maxAttempts?: number
  baseDelayMs?: number
  breaker?: CircuitBreaker
  fetchFn?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

/**
 * Cliente HTTP do serviço de chamados com timeout, retry exponencial com jitter e
 * circuit breaker. Escritas usam Idempotency-Key, então repetir é seguro (decisão D12).
 */
export function createTicketsClient(options: TicketsClientOptions) {
  const {
    baseUrl,
    serviceToken,
    timeoutMs = 3000,
    maxAttempts = 3,
    baseDelayMs = 200,
    breaker = new CircuitBreaker(),
    fetchFn = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options

  async function request<T>(
    schema: z.ZodType<T>,
    path: string,
    init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
  ): Promise<T> {
    let lastError: Error = new TicketsUnavailableError()

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (!breaker.canRequest()) throw new TicketsUnavailableError()

      try {
        const response = await fetchFn(`${baseUrl}${path}`, {
          method: init.method ?? 'GET',
          headers: {
            'content-type': 'application/json',
            'x-service-token': serviceToken,
            ...(init.idempotencyKey ? { 'idempotency-key': init.idempotencyKey } : {}),
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: AbortSignal.timeout(timeoutMs),
        })

        if (response.status >= 500) throw new TicketsUnavailableError()
        breaker.recordSuccess()

        const payload: unknown = await response.json()
        if (response.status === 404) throw new TicketNotFoundError('Chamado não encontrado.')
        if (response.status === 409) throw new TicketRuleError(messageOf(payload))
        if (!response.ok) throw new Error(`tickets-service respondeu ${response.status}`)
        return schema.parse(payload)
      } catch (error) {
        if (error instanceof TicketNotFoundError || error instanceof TicketRuleError) throw error
        // 5xx, timeout ou rede: conta como falha e tenta de novo com espera crescente.
        breaker.recordFailure()
        lastError = error instanceof TicketsUnavailableError ? error : new TicketsUnavailableError()
        if (attempt < maxAttempts) {
          const delay = baseDelayMs * 2 ** (attempt - 1)
          await sleep(delay + Math.random() * delay * 0.3)
        }
      }
    }
    throw lastError
  }

  return {
    listTickets: (requesterId: string) =>
      request(z.array(Ticket), `/tickets?requesterId=${encodeURIComponent(requesterId)}`),

    getTicket: (id: string, requesterId: string) =>
      request(
        Ticket,
        `/tickets/${encodeURIComponent(id)}?requesterId=${encodeURIComponent(requesterId)}`,
      ),

    createTicket: (input: CreateTicketInput, idempotencyKey: string) =>
      request(Ticket, '/tickets', { method: 'POST', body: input, idempotencyKey }),

    updateTicket: (id: string, input: UpdateTicketInput, idempotencyKey: string) =>
      request(Ticket, `/tickets/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: input,
        idempotencyKey,
      }),

    transferTicket: (id: string, requesterId: string, summary: string, idempotencyKey: string) =>
      request(Ticket, `/tickets/${encodeURIComponent(id)}/transfer`, {
        method: 'POST',
        body: { requesterId, summary },
        idempotencyKey,
      }),

    setChaos: (body: { failureRate?: number; downForSeconds?: number }) =>
      request(z.unknown(), '/__chaos', { method: 'POST', body }),

    breakerState: () => breaker.state,
  }
}

export type TicketsClient = ReturnType<typeof createTicketsClient>

function messageOf(payload: unknown): string {
  const parsed = z.object({ message: z.string() }).safeParse(payload)
  return parsed.success ? parsed.data.message : 'Operação não permitida.'
}
