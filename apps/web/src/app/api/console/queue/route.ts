import { listQueue } from '@/server/conversations'
import { handle, json, requireUser } from '@/server/http'
import { getRuntime } from '@/server/runtime'

export async function GET() {
  return handle(async () => {
    await requireUser('analyst')
    const rt = getRuntime()
    return json({ queue: listQueue(rt.db), ticketsService: rt.tickets.breakerState() })
  })
}
