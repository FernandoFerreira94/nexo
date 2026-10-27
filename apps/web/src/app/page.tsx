import { redirect } from 'next/navigation'
import { getSessionUser } from '@/server/http'

/** Entrada: manda cada papel para a sua tela. */
export default async function Home() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  redirect(user.role === 'analyst' ? '/console' : '/chat')
}
