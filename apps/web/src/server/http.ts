import { TicketNotFoundError, TicketRuleError, TicketsUnavailableError } from '@nexo/agent'
import type { StreamEvent } from '@nexo/shared'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { ConflictError, ForbiddenError, NotFoundError } from './conversations'
import { users } from './db/schema'
import { getRuntime } from './runtime'
import { SESSION_COOKIE, verifySession } from './session'

export class UnauthorizedError extends Error {}
export class TooManyRequestsError extends Error {}

export type User = typeof users.$inferSelect

/** Usuário da sessão (cookie assinado). É daqui que sai o requesterId, sempre. */
export async function getSessionUser(): Promise<User | null> {
  const rt = getRuntime()
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const session = verifySession(token, rt.authSecret)
  if (!session) return null
  return rt.db.select().from(users).where(eq(users.id, session.userId)).get() ?? null
}

export async function requireUser(role: User['role']): Promise<User> {
  const user = await getSessionUser()
  if (!user) throw new UnauthorizedError('Faça login.')
  if (user.role !== role) throw new ForbiddenError('Sem permissão.')
  return user
}

/** Limite simples por usuário, em memória: protege custo de LLM contra abuso. */
const hits = new Map<string, number[]>()
export function rateLimit(userId: string, max = 20, windowMs = 60_000) {
  const now = Date.now()
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= max) throw new TooManyRequestsError('Muitas mensagens. Aguarde um minuto.')
  recent.push(now)
  hits.set(userId, recent)
}

/** Converte erros conhecidos em respostas HTTP. O resto vira 500 sem detalhes para o cliente. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: 'Dados inválidos.' }, 400)
    if (error instanceof UnauthorizedError) return json({ error: error.message }, 401)
    if (error instanceof ForbiddenError) return json({ error: error.message }, 403)
    if (error instanceof NotFoundError || error instanceof TicketNotFoundError) {
      return json({ error: 'Não encontrado.' }, 404)
    }
    if (error instanceof ConflictError || error instanceof TicketRuleError) {
      return json({ error: error.message }, 409)
    }
    if (error instanceof TooManyRequestsError) return json({ error: error.message }, 429)
    if (error instanceof TicketsUnavailableError) {
      return json(
        { error: 'O sistema de chamados está instável. Tente de novo em instantes.' },
        503,
      )
    }
    console.error('[web] erro inesperado:', error instanceof Error ? error.message : 'desconhecido')
    return json({ error: 'Erro inesperado.' }, 500)
  }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

/** Streaming NDJSON: um evento JSON por linha, lido pela tela conforme chega. */
export function ndjson(events: AsyncGenerator<StreamEvent>): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        }
      } catch (error) {
        console.error(
          '[web] falha no streaming:',
          error instanceof Error ? error.message : 'desconhecido',
        )
        const event: StreamEvent = {
          type: 'error',
          message: 'Não consegui responder agora. Tente de novo.',
        }
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  })
}
