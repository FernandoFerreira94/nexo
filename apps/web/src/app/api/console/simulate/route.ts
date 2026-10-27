import { simulateQueue } from '@/server/demo'
import { handle, json, requireUser } from '@/server/http'
import { getRuntime } from '@/server/runtime'

/** Botão de demonstração do console: coloca pedidos de exemplo na fila. */
export async function POST() {
  return handle(async () => {
    await requireUser('analyst')
    const created = await simulateQueue((await getRuntime()).db)
    return json({ created })
  })
}
