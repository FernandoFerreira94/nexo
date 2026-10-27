import { z } from 'zod'
import { handle, json, requireUser } from '@/server/http'
import { getRuntime } from '@/server/runtime'

const Body = z.object({
  failureRate: z.number().min(0).max(1).optional(),
  downForSeconds: z.number().int().min(0).max(300).optional(),
})

/** Botão de demonstração: derruba o sistema de chamados para mostrar retry e aviso. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireUser('analyst')
    const body = Body.parse(await request.json())
    return json(await getRuntime().tickets.setChaos(body))
  })
}
