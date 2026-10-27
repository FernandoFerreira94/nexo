/**
 * Limite de mensagens do funcionário por conversa (Anexo A, decisão D14).
 * Avisa a partir de `warnAt` e bloqueia ao chegar em `limit`.
 */
export type MessageLimitState =
  | { status: 'ok'; remaining: number }
  | { status: 'warn'; remaining: number }
  | { status: 'blocked'; remaining: 0 }

export function checkMessageLimit(
  sentCount: number,
  limit: number,
  warnAt: number,
): MessageLimitState {
  const remaining = Math.max(0, limit - sentCount)
  if (remaining === 0) return { status: 'blocked', remaining: 0 }
  if (sentCount >= warnAt) return { status: 'warn', remaining }
  return { status: 'ok', remaining }
}
