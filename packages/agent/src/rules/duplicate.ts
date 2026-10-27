import { OPEN_STATUSES, type Category, type Ticket } from '@nexo/shared'
import { tokenize } from '../text'

/** Similaridade mínima entre o problema novo e um chamado aberto (decisão D07). */
export const DUPLICATE_THRESHOLD = 0.3

export type DuplicateCandidate = { ticket: Ticket; similarity: number }

/**
 * Procura um chamado aberto do mesmo funcionário, mesma categoria e texto parecido.
 * Similaridade de Jaccard: palavras em comum ÷ palavras no total.
 * Não decide sozinho: o agent pergunta "é sobre o INC-x?" antes de atualizar.
 */
export function findSimilarOpenTicket(
  tickets: readonly Ticket[],
  problem: { category: Category | null; text: string },
): DuplicateCandidate | null {
  const problemWords = new Set(tokenize(problem.text))
  let best: DuplicateCandidate | null = null

  for (const ticket of tickets) {
    if (!OPEN_STATUSES.includes(ticket.status)) continue
    if (problem.category && ticket.category !== problem.category) continue

    const similarity = jaccard(
      problemWords,
      new Set(tokenize(`${ticket.title} ${ticket.description}`)),
    )
    if (similarity >= DUPLICATE_THRESHOLD && (!best || similarity > best.similarity)) {
      best = { ticket, similarity }
    }
  }
  return best
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let common = 0
  for (const word of a) if (b.has(word)) common++
  return common / (a.size + b.size - common)
}
