import { beforeEach, describe, expect, it } from 'vitest'
import { isOverdue, type Ticket } from '@nexo/shared'
import { createApp } from './app'
import { createChaos } from './chaos'
import { openTicketsDb } from './db/client'
import { seedTickets } from './db/seed'

const TOKEN = 'test-token'
const NOW = new Date('2026-10-27T15:00:00Z') // terça, 12h em São Paulo

async function setup(failureRate = 0, random = () => 1) {
  const db = await openTicketsDb(':memory:')
  await seedTickets(db, NOW)
  const chaos = createChaos(failureRate, random)
  const app = createApp({ db, chaos, serviceToken: TOKEN, now: () => NOW })
  const call = (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: { 'x-service-token': TOKEN, 'content-type': 'application/json', ...init.headers },
    })
  return { app, chaos, call }
}

const newTicket = {
  type: 'INC',
  title: 'Excel trava ao abrir planilha',
  description: 'O Excel trava toda vez que abro a planilha de fechamento do mês.',
  category: 'software',
  priority: 'high',
  affected: 'one',
  requesterId: 'u_ana',
}

describe('tickets-service', () => {
  let ctx: Awaited<ReturnType<typeof setup>>
  beforeEach(async () => {
    ctx = await setup()
  })

  it('exige o token de serviço', async () => {
    const res = await ctx.app.request('/tickets?requesterId=u_ana')
    expect(res.status).toBe(401)
  })

  it('lista só os chamados do dono', async () => {
    const res = await ctx.call('/tickets?requesterId=u_ana')
    const tickets = (await res.json()) as Ticket[]
    expect(tickets.length).toBeGreaterThan(0)
    expect(tickets.every((t) => t.requesterId === 'u_ana')).toBe(true)
  })

  it('privacidade: chamado de outro funcionário responde 404', async () => {
    const own = await ctx.call('/tickets/INC-20333?requesterId=u_bruno')
    expect(own.status).toBe(200)
    const other = await ctx.call('/tickets/INC-20333?requesterId=u_ana')
    expect(other.status).toBe(404)
  })

  it('seed: INC-20311 vencido, REQ-10442 em dia, INC-20150 resolvido', async () => {
    const get = async (id: string) =>
      (await (await ctx.call(`/tickets/${id}?requesterId=u_ana`)).json()) as Ticket
    expect(isOverdue(await get('INC-20311'), NOW)).toBe(true)
    expect(isOverdue(await get('REQ-10442'), NOW)).toBe(false)
    expect((await get('INC-20150')).status).toBe('resolved')
  })

  it('cria chamado com numeração INC- e prazo pelo SLA', async () => {
    const res = await ctx.call('/tickets', { method: 'POST', body: JSON.stringify(newTicket) })
    expect(res.status).toBe(201)
    const ticket = (await res.json()) as Ticket
    expect(ticket.id).toBe('INC-20353')
    expect(ticket.dueAt).toBe('2026-10-27T19:00:00.000Z') // 12h + 4h úteis = 16h SP
  })

  it('Idempotency-Key: repetir o POST não duplica o chamado', async () => {
    const init = {
      method: 'POST',
      body: JSON.stringify(newTicket),
      headers: { 'idempotency-key': 'draft-1:v1' },
    }
    const first = (await (await ctx.call('/tickets', init)).json()) as Ticket
    const second = (await (await ctx.call('/tickets', init)).json()) as Ticket
    expect(second.id).toBe(first.id)
    const all = (await (await ctx.call('/tickets?requesterId=u_ana')).json()) as Ticket[]
    expect(all.filter((t) => t.title === newTicket.title)).toHaveLength(1)
  })

  it('valida a entrada com Zod', async () => {
    const res = await ctx.call('/tickets', {
      method: 'POST',
      body: JSON.stringify({ ...newTicket, category: 'rh' }),
    })
    expect(res.status).toBe(400)
  })

  it('reabre chamado resolvido há 4 dias', async () => {
    const res = await ctx.call('/tickets/INC-20150', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'reopen', requesterId: 'u_ana', reason: 'Bloqueou de novo' }),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as Ticket).status).toBe('open')
  })

  it('não reabre chamado resolvido há mais de 7 dias', async () => {
    const res = await ctx.call('/tickets/INC-19876', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'reopen', requesterId: 'u_ana', reason: 'Voltou a falhar' }),
    })
    expect(res.status).toBe(409)
  })

  it('complementa chamado aberto', async () => {
    const res = await ctx.call('/tickets/INC-20352', {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'comment',
        requesterId: 'u_ana',
        body: 'Agora o vídeo também falha.',
      }),
    })
    const ticket = (await res.json()) as Ticket
    expect(ticket.comments.at(-1)?.body).toBe('Agora o vídeo também falha.')
  })

  it('transfere: status vira Aguardando analista com o resumo', async () => {
    const res = await ctx.call('/tickets/INC-20352/transfer', {
      method: 'POST',
      body: JSON.stringify({ requesterId: 'u_ana', summary: 'Funcionária pediu analista.' }),
    })
    expect(((await res.json()) as Ticket).status).toBe('awaiting_analyst')
  })
})

describe('indisponibilidade simulada', () => {
  it('com taxa de falha 100% responde 503', async () => {
    const { call } = await setup(1, () => 0)
    const res = await call('/tickets?requesterId=u_ana')
    expect(res.status).toBe(503)
  })

  it('POST /__chaos derruba o serviço por alguns segundos', async () => {
    const { call } = await setup()
    await call('/__chaos', { method: 'POST', body: JSON.stringify({ downForSeconds: 5 }) })
    expect((await call('/tickets?requesterId=u_ana')).status).toBe(503)
  })

  it('/health não sofre o caos', async () => {
    const { app } = await setup(1, () => 0)
    expect((await app.request('/health')).status).toBe(200)
  })
})
