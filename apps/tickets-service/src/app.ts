import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { CreateTicketInput, UpdateTicketInput } from '@nexo/shared'
import type { TicketsDb } from './db/client'
import type { Chaos } from './chaos'
import { withIdempotency } from './idempotency'
import {
  NotFoundError,
  RuleViolationError,
  addComment,
  createTicket,
  getTicket,
  listTickets,
  reopenTicket,
  transferTicket,
} from './domain/tickets'

type AppDeps = {
  db: TicketsDb
  chaos: Chaos
  /** Token compartilhado com o app web: só ele pode falar com este serviço. */
  serviceToken: string
  now?: () => Date
}

const RequesterQuery = z.object({ requesterId: z.string().min(1) })
const TransferBody = z.object({
  requesterId: z.string().min(1),
  summary: z.string().min(3).max(4000),
})
const ChaosBody = z.object({
  failureRate: z.number().min(0).max(1).optional(),
  downForSeconds: z.number().int().min(0).max(300).optional(),
})

export function createApp({ db, chaos, serviceToken, now = () => new Date() }: AppDeps) {
  const app = new Hono()

  app.get('/health', (c) => c.json({ ok: true }))

  app.use('*', async (c, next) => {
    if (c.req.header('x-service-token') !== serviceToken) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    await next()
  })

  // Usado na demo para derrubar o "legado" de propósito. Não passa pelo caos.
  app.post('/__chaos', async (c) => {
    const body = ChaosBody.safeParse(await c.req.json().catch(() => ({})))
    if (!body.success) return c.json({ error: 'invalid_body', issues: body.error.issues }, 400)
    if (body.data.failureRate !== undefined) chaos.state.failureRate = body.data.failureRate
    if (body.data.downForSeconds !== undefined) {
      chaos.state.downUntil = Date.now() + body.data.downForSeconds * 1000
    }
    return c.json(chaos.state)
  })

  app.use('/tickets/*', chaos.middleware)
  app.use('/tickets', chaos.middleware)

  app.get('/tickets', async (c) => {
    const query = RequesterQuery.safeParse(c.req.query())
    if (!query.success) return invalid(c, query.error)
    return c.json(await listTickets(db, query.data.requesterId))
  })

  app.get('/tickets/:id', async (c) => {
    const query = RequesterQuery.safeParse(c.req.query())
    if (!query.success) return invalid(c, query.error)
    return c.json(await getTicket(db, c.req.param('id'), query.data.requesterId))
  })

  app.post('/tickets', async (c) => {
    const body = CreateTicketInput.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return invalid(c, body.error)
    const result = await withIdempotency(db, c.req.header('idempotency-key'), async () => ({
      statusCode: 201,
      body: await createTicket(db, body.data, now()),
    }))
    return c.json(result.body, result.statusCode as 201)
  })

  app.patch('/tickets/:id', async (c) => {
    const body = UpdateTicketInput.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return invalid(c, body.error)
    const id = c.req.param('id')
    const input = body.data
    const result = await withIdempotency(db, c.req.header('idempotency-key'), async () => ({
      statusCode: 200,
      body:
        input.action === 'comment'
          ? await addComment(db, id, input.requesterId, input.body, now())
          : await reopenTicket(db, id, input.requesterId, input.reason, now()),
    }))
    return c.json(result.body, result.statusCode as 200)
  })

  app.post('/tickets/:id/transfer', async (c) => {
    const body = TransferBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return invalid(c, body.error)
    const { requesterId, summary } = body.data
    const result = await withIdempotency(db, c.req.header('idempotency-key'), async () => ({
      statusCode: 200,
      body: await transferTicket(db, c.req.param('id'), requesterId, summary, now()),
    }))
    return c.json(result.body, result.statusCode as 200)
  })

  app.onError((error, c) => {
    if (error instanceof NotFoundError)
      return c.json({ error: 'not_found', message: error.message }, 404)
    if (error instanceof RuleViolationError) {
      return c.json({ error: 'rule_violation', message: error.message }, 409)
    }
    console.error(JSON.stringify({ level: 'error', msg: 'unexpected_error', error: error.message }))
    return c.json({ error: 'internal_error' }, 500)
  })

  return app
}

function invalid(c: Context, error: z.ZodError) {
  return c.json({ error: 'invalid_input', issues: error.issues }, 400)
}
