import type { MessageWithTrace } from '@/server/conversations'
import type { ConversationStatus, HandoffReason } from '@nexo/shared'

/** Formato das mensagens que a API devolve (datas já em texto ISO). */
export type ChatMessage = Omit<MessageWithTrace, 'conversationId' | 'traceId'>

export type ConversationState = {
  id: string
  status: ConversationStatus
  handoffReason: HandoffReason | null
  messageCount: number
  messageLimit: number
  messageWarnAt: number
}
