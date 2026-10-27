import { startNewConversation } from '@/server/conversations'
import { handle, json, requireUser } from '@/server/http'
import { getRuntime } from '@/server/runtime'

/** Botão "Nova conversa": encerra a atual com o assistente e começa do zero. */
export async function POST() {
  return handle(async () => {
    const user = await requireUser('employee')
    const conversation = await startNewConversation((await getRuntime()).db, user.id)
    return json({ conversationId: conversation.id })
  })
}
