import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { users } from '@/server/db/schema'
import { handle, json } from '@/server/http'
import { getRuntime } from '@/server/runtime'
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from '@/server/session'

const Body = z.object({ email: z.email(), password: z.string().min(1) })

/** Login de demonstração: qualquer senha vale para os usuários do seed (pedido do desafio). */
export async function POST(request: Request) {
  return handle(async () => {
    const { email } = Body.parse(await request.json())
    const rt = getRuntime()
    const user = rt.db.select().from(users).where(eq(users.email, email.toLowerCase())).get()
    if (!user) return json({ error: 'E-mail não cadastrado.' }, 401)

    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE, signSession(user.id, rt.authSecret), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    })
    return json({ role: user.role })
  })
}
