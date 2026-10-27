import { assume } from '@/server/conversations'
import { handle, json, requireUser } from '@/server/http'
import { getRuntime } from '@/server/runtime'

export async function POST(
  _request: Request,
  ctx: RouteContext<'/api/console/conversations/[id]/assume'>,
) {
  return handle(async () => {
    const analyst = await requireUser('analyst')
    const { id } = await ctx.params
    assume(getRuntime().db, id, analyst.id)
    return json({ ok: true })
  })
}
