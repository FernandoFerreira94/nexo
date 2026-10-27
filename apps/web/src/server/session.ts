import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/**
 * Sessão em cookie assinado com HMAC (sem biblioteca): `payload.assinatura`.
 * Quem não tem o AUTH_SECRET não consegue forjar um userId. O requesterId de todas as
 * consultas sai daqui, nunca do corpo da requisição nem do LLM.
 */
export const SESSION_COOKIE = 'nexo_session'
export const SESSION_TTL_SECONDS = 8 * 60 * 60

const Payload = z.object({ userId: z.string(), exp: z.number() })
export type SessionPayload = z.infer<typeof Payload>

export function signSession(userId: string, secret: string, nowMs = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: nowMs + SESSION_TTL_SECONDS * 1000 }),
  ).toString('base64url')
  return `${payload}.${hmac(payload, secret)}`
}

export function verifySession(
  token: string | undefined,
  secret: string,
  nowMs = Date.now(),
): SessionPayload | null {
  if (!token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = Buffer.from(hmac(payload, secret))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null
  try {
    const parsed = Payload.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()))
    return parsed.exp > nowMs ? parsed : null
  } catch {
    return null
  }
}

function hmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}
