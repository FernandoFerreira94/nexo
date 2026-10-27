import { HandoffReason } from '@nexo/shared'
import { z } from 'zod'
import { handleQuickHandoff } from '@/server/chat'
import { handle, ndjson, requireUser } from '@/server/http'
import { getRuntime } from '@/server/runtime'

const Body = z.object({ reason: HandoffReason })

/** Botão de transferência das quick replies: não passa pelo LLM. */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser('employee')
    const { reason } = Body.parse(await request.json())
    return ndjson(handleQuickHandoff(await getRuntime(), user, reason))
  })
}
