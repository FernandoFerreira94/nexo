import { redirect } from 'next/navigation'
import { ChatView } from '@/components/chat/chat-view'
import { getSessionUser } from '@/server/http'

export default async function ChatPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (user.role !== 'employee') redirect('/console')
  return <ChatView user={{ name: user.name, department: user.department }} />
}
