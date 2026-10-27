import { z } from 'zod'
import { editDraft } from '@/server/drafts'
import { handle, json, requireUser } from '@/server/http'
import { getRuntime } from '@/server/runtime'

const Body = z.object({
  version: z.number().int().min(1),
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().min(3).max(2000),
})

/** Editar o rascunho (título e descrição) antes de confirmar. Gera uma nova versão. */
export async function PATCH(request: Request, ctx: RouteContext<'/api/drafts/[id]'>) {
  return handle(async () => {
    const user = await requireUser('employee')
    const { id } = await ctx.params
    const { version, ...changes } = Body.parse(await request.json())
    return json({ message: await editDraft(await getRuntime(), user.id, id, version, changes) })
  })
}
