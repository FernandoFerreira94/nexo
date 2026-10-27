import { z } from 'zod'
import { analystReply } from '@/server/conversations'
import { handle, json, requireUser } from '@/server/http'
import { getRuntime } from '@/server/runtime'

const Body = z.object({ text: z.string().trim().min(1).max(4000) })

export async function POST(
  request: Request,
  ctx: RouteContext<'/api/console/conversations/[id]/reply'>,
) {
  return handle(async () => {
    const analyst = await requireUser('analyst')
    const { id } = await ctx.params
    const { text } = Body.parse(await request.json())
    return json({ message: analystReply(getRuntime().db, id, analyst.id, text) })
  })
}
