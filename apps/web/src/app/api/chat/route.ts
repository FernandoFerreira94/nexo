import { z } from 'zod'
import { handleEmployeeMessage } from '@/server/chat'
import { handle, ndjson, rateLimit, requireUser } from '@/server/http'
import { getRuntime } from '@/server/runtime'

const Body = z.object({ text: z.string().trim().min(1).max(2000) })

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser('employee')
    rateLimit(user.id)
    const { text } = Body.parse(await request.json())
    return ndjson(handleEmployeeMessage(await getRuntime(), user, text))
  })
}
