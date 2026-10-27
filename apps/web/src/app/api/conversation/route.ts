import { getActiveConversation, getPendingDraft, listMessages } from '@/server/conversations'
import { handle, json, requireUser } from '@/server/http'
import { getRuntime } from '@/server/runtime'

/** Conversa ativa do funcionário logado (a tela consulta ao abrir e durante o atendimento humano). */
export async function GET() {
  return handle(async () => {
    const user = await requireUser('employee')
    const { db } = getRuntime()
    const conversation = getActiveConversation(db, user.id)
    return json({
      conversation: {
        id: conversation.id,
        status: conversation.status,
        handoffReason: conversation.handoffReason,
      },
      messages: listMessages(db, conversation.id),
      pendingDraft: getPendingDraft(db, conversation.id),
    })
  })
}
