import { eq } from 'drizzle-orm'
import type { TicketsDb } from './db/client'
import { idempotencyKeys } from './db/schema'

type StoredResponse = { statusCode: number; body: unknown }

/**
 * Se a chave já foi usada, devolve a resposta guardada em vez de executar de novo.
 * É o que permite ao cliente repetir um POST depois de um timeout sem duplicar chamado.
 */
export async function withIdempotency(
  db: TicketsDb,
  key: string | undefined,
  run: () => Promise<StoredResponse>,
): Promise<StoredResponse> {
  if (!key) return run()

  const existing = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key)).get()
  if (existing) {
    return { statusCode: existing.statusCode, body: JSON.parse(existing.responseBody) }
  }

  const response = await run()
  await db
    .insert(idempotencyKeys)
    .values({
      key,
      statusCode: response.statusCode,
      responseBody: JSON.stringify(response.body),
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run()
  return response
}
