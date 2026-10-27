import type { MiddlewareHandler } from 'hono'

/**
 * Indisponibilidade simulada do legado (o PRD diz que ele cai por alguns segundos).
 * Dois modos que podem coexistir:
 * - taxa: cada requisição falha com probabilidade `failureRate`;
 * - janela de queda: tudo falha até `downUntil`.
 */
export type ChaosState = {
  failureRate: number
  downUntil: number | null
}

export function createChaos(initialFailureRate: number, random: () => number = Math.random) {
  const state: ChaosState = { failureRate: initialFailureRate, downUntil: null }

  const middleware: MiddlewareHandler = async (c, next) => {
    const isDown = state.downUntil !== null && Date.now() < state.downUntil
    if (isDown || random() < state.failureRate) {
      return c.json(
        { error: 'service_unavailable', message: 'Sistema de chamados indisponível.' },
        503,
      )
    }
    await next()
  }

  return { state, middleware }
}

export type Chaos = ReturnType<typeof createChaos>
