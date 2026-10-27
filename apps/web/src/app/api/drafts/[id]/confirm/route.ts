import { z } from 'zod'
import { confirmDraft } from '@/server/drafts'
import { handle, json, requireUser } from '@/server/http'
import { getRuntime } from '@/server/runtime'

const Body = z.object({ version: z.number().int().min(1) })

export async function POST(request: Request, ctx: RouteContext<'/api/drafts/[id]/confirm'>) {
  return handle(async () => {
    const user = await requireUser('employee')
    const { id } = await ctx.params
    const { version } = Body.parse(await request.json())
    return json({ message: await confirmDraft(await getRuntime(), user.id, id, version) })
  })
}
