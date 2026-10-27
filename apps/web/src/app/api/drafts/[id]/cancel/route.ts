import { z } from 'zod'
import { cancelDraft } from '@/server/drafts'
import { handle, json, requireUser } from '@/server/http'
import { getRuntime } from '@/server/runtime'

const Body = z.object({ version: z.number().int().min(1) })

export async function POST(request: Request, ctx: RouteContext<'/api/drafts/[id]/cancel'>) {
  return handle(async () => {
    const user = await requireUser('employee')
    const { id } = await ctx.params
    const { version } = Body.parse(await request.json())
    return json({ message: await cancelDraft(await getRuntime(), user.id, id, version) })
  })
}
