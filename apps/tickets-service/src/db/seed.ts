import { computeDueAt, type Ticket } from '@nexo/shared'
import type { TicketsDb } from './client'
import { idempotencyKeys, tickets } from './schema'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

type SeedTicket = Omit<
  Ticket,
  'createdAt' | 'updatedAt' | 'slaStartAt' | 'dueAt' | 'resolvedAt'
> & {
  /** Há quanto tempo foi aberto. Datas relativas a "agora" para os estados não envelhecerem. */
  openedAgoMs: number
  /** Há quanto tempo o relógio do SLA começou (padrão: na abertura). */
  slaStartedAgoMs?: number
  resolvedAgoMs?: number
}

/** Anexo B: chamados variados, incluindo os três citados no PRD. */
const SEED_TICKETS: SeedTicket[] = [
  {
    id: 'INC-20311',
    type: 'INC',
    title: 'Notebook lento após atualização do Windows',
    description:
      'Depois da atualização do Windows o notebook ficou muito lento para abrir o Excel e o navegador. Já reiniciei duas vezes.',
    category: 'hardware',
    priority: 'medium',
    status: 'awaiting_analyst',
    requesterId: 'u_ana',
    affected: 'one',
    openedAgoMs: 6 * DAY,
    comments: [],
  },
  {
    id: 'REQ-10442',
    type: 'REQ',
    title: 'Segundo monitor para home office',
    description:
      'Preciso de um segundo monitor para trabalhar de casa com as planilhas de fechamento.',
    category: 'hardware',
    priority: 'low',
    status: 'approved',
    requesterId: 'u_ana',
    affected: 'one',
    openedAgoMs: 7 * DAY,
    // A aprovação foi o último retorno do analista: o relógio reiniciou ali (decisões D03/D15).
    slaStartedAgoMs: 2 * DAY,
    comments: [
      {
        author: 'analyst',
        body: 'Pedido aprovado pela gestão. Aguardando entrega pelo almoxarifado.',
        createdAt: new Date(0).toISOString(),
      },
    ],
  },
  {
    id: 'INC-20150',
    type: 'INC',
    title: 'Senha do SAP bloqueada',
    description: 'Errei a senha do SAP algumas vezes e a conta bloqueou.',
    category: 'access',
    priority: 'medium',
    status: 'resolved',
    requesterId: 'u_ana',
    affected: 'one',
    openedAgoMs: 5 * DAY,
    resolvedAgoMs: 4 * DAY,
    comments: [],
  },
  {
    id: 'INC-19876',
    type: 'INC',
    title: 'Outlook não sincroniza a caixa compartilhada',
    description: 'A caixa compartilhada do financeiro parou de sincronizar no Outlook.',
    category: 'email',
    priority: 'medium',
    status: 'resolved',
    requesterId: 'u_ana',
    affected: 'team',
    openedAgoMs: 15 * DAY,
    resolvedAgoMs: 12 * DAY,
    comments: [],
  },
  {
    id: 'INC-20352',
    type: 'INC',
    title: 'Teams sem áudio nas reuniões',
    description: 'Nas reuniões do Teams ninguém me ouve. Estou usando o celular como alternativa.',
    category: 'software',
    priority: 'medium',
    status: 'open',
    requesterId: 'u_ana',
    affected: 'one',
    openedAgoMs: 3 * HOUR,
    comments: [],
  },
  {
    id: 'INC-20333',
    type: 'INC',
    title: 'Impressora do 3º andar não imprime',
    description: 'A impressora do 3º andar mostra erro de papel atolado, mas não há papel preso.',
    category: 'hardware',
    priority: 'medium',
    status: 'in_progress',
    requesterId: 'u_bruno',
    affected: 'team',
    openedAgoMs: 1 * DAY,
    comments: [],
  },
  {
    id: 'REQ-10450',
    type: 'REQ',
    title: 'Acesso ao Power BI de campanhas',
    description: 'Preciso de acesso de leitura ao workspace de campanhas no Power BI.',
    category: 'access',
    priority: 'low',
    status: 'open',
    requesterId: 'u_carla',
    affected: 'one',
    openedAgoMs: 2 * DAY,
    comments: [],
  },
  {
    id: 'INC-20290',
    type: 'INC',
    title: 'VPN cai a cada 10 minutos',
    description: 'A VPN desconecta sozinha a cada 10 minutos desde ontem.',
    category: 'network_vpn',
    priority: 'high',
    status: 'awaiting_analyst',
    requesterId: 'u_diego',
    affected: 'one',
    openedAgoMs: 2 * DAY,
    comments: [],
  },
]

export function seedTickets(db: TicketsDb, now: Date = new Date()): number {
  db.delete(tickets).run()
  db.delete(idempotencyKeys).run()

  for (const seed of SEED_TICKETS) {
    const { openedAgoMs, slaStartedAgoMs, resolvedAgoMs, ...ticket } = seed
    const createdAt = new Date(now.getTime() - openedAgoMs)
    const slaStartAt = new Date(now.getTime() - (slaStartedAgoMs ?? openedAgoMs))
    const resolvedAt = resolvedAgoMs === undefined ? null : new Date(now.getTime() - resolvedAgoMs)
    const updatedAt = resolvedAt ?? slaStartAt

    db.insert(tickets)
      .values({
        ...ticket,
        number: Number(ticket.id.split('-')[1]),
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        slaStartAt: slaStartAt.toISOString(),
        dueAt: computeDueAt(slaStartAt, ticket.priority).toISOString(),
        resolvedAt: resolvedAt?.toISOString() ?? null,
        comments: ticket.comments.map((comment) => ({
          ...comment,
          createdAt: slaStartAt.toISOString(),
        })),
      })
      .run()
  }
  return SEED_TICKETS.length
}
