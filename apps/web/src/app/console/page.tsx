import { redirect } from 'next/navigation'
import { ConsoleView } from '@/components/console/console-view'
import { getSessionUser } from '@/server/http'

/** Rota protegida por papel: só analista entra. */
export default async function ConsolePage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (user.role !== 'analyst') redirect('/chat')
  return <ConsoleView analyst={{ id: user.id, name: user.name, department: user.department }} />
}
