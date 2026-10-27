import { toTicketSummary } from '@nexo/agent'
import type { TicketSummary } from '@nexo/shared'
import { eq } from 'drizzle-orm'
import { getConversation, listMessages } from '@/server/conversations'
import { users } from '@/server/db/schema'
import { handle, json, requireUser } from '@/server/http'
import { getRuntime } from '@/server/runtime'

/** Detalhe para o analista: histórico com traces e os chamados do funcionário. */
export async function GET(_request: Request, ctx: RouteContext<'/api/console/conversations/[id]'>) {
  return handle(async () => {
    await requireUser('analyst')
    const rt = getRuntime()
    const { id } = await ctx.params
    const conversation = getConversation(rt.db, id)
    const employee = rt.db.select().from(users).where(eq(users.id, conversation.userId)).get()
    let tickets: TicketSummary[] | null
    try {
      const now = new Date()
      const list = await rt.tickets.listTickets(conversation.userId)
      tickets = list.map((t) => toTicketSummary(t, now))
    } catch {
      tickets = null // sistema de chamados fora: o painel mostra o aviso e o resto funciona
    }
    return json({ conversation, employee, messages: listMessages(rt.db, id), tickets })
  })
}
