/**
 * Circuit breaker simples. Depois de `failureThreshold` falhas seguidas, "abre" por
 * `openForMs` e recusa chamadas na hora, sem esperar timeout. Passado o tempo, deixa
 * uma chamada de teste passar (meio-aberto); se der certo, fecha de novo.
 */
export class CircuitBreaker {
  private consecutiveFailures = 0
  private openedAt: number | null = null

  constructor(
    private readonly failureThreshold = 5,
    private readonly openForMs = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  canRequest(): boolean {
    if (this.openedAt === null) return true
    return this.now() - this.openedAt >= this.openForMs
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0
    this.openedAt = null
  }

  recordFailure(): void {
    this.consecutiveFailures++
    if (this.consecutiveFailures >= this.failureThreshold) this.openedAt = this.now()
  }

  get state(): 'closed' | 'open' {
    return this.canRequest() ? 'closed' : 'open'
  }
}
