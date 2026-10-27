import { toTicketSummary } from '@nexo/agent'
import type { Draft, Ticket } from '@nexo/shared'
import {
  addMessage,
  ConflictError,
  finishDraft,
  getDraftForConfirmation,
  saveDraft,
  type Message,
} from './conversations'
import type { Runtime } from './runtime'

/**
 * O ÚNICO caminho que grava no sistema de chamados (decisão D01): o funcionário clica em
 * Confirmar, o servidor confere dono, status e versão, e envia com Idempotency-Key
 * `draftId:versão`. Clique duplo ou retry depois de falha não criam dois chamados.
 */
export async function confirmDraft(
  rt: Runtime,
  userId: string,
  draftId: string,
  version: number,
): Promise<Message> {
  const { draft, conversation } = await getDraftForConfirmation(rt.db, draftId, userId, version)
  const idempotencyKey = `${draft.id}:${draft.version}`
  const ticket = await submit(rt, userId, draft, idempotencyKey)
  await finishDraft(rt.db, draft, 'submitted', ticket.id)

  return addMessage(rt.db, {
    conversationId: conversation.id,
    role: 'agent',
    content: confirmationText(draft, ticket),
    cards: [{ type: 'tickets', tickets: [toTicketSummary(ticket, new Date())] }],
  })
}

export async function cancelDraft(rt: Runtime, userId: string, draftId: string, version: number) {
  const { draft, conversation } = await getDraftForConfirmation(rt.db, draftId, userId, version)
  await finishDraft(rt.db, draft, 'cancelled')
  return addMessage(rt.db, {
    conversationId: conversation.id,
    role: 'agent',
    content: 'Tudo bem, descartei o rascunho. Se precisar, é só me chamar.',
  })
}

/**
 * Botão Editar do rascunho: o funcionário corrige título e descrição antes de confirmar.
 * Vira uma versão nova (o card antigo deixa de ser confirmável). Tipo, categoria e
 * prioridade não se editam aqui: saem das regras, a partir do que ele contou.
 */
export async function editDraft(
  rt: Runtime,
  userId: string,
  draftId: string,
  version: number,
  changes: { title?: string | undefined; description: string },
): Promise<Message> {
  const { draft, conversation } = await getDraftForConfirmation(rt.db, draftId, userId, version)
  const edited: Draft = {
    ...draft,
    title: draft.kind === 'create' && changes.title ? changes.title : draft.title,
    description: changes.description,
    version: draft.version + 1,
  }
  await saveDraft(rt.db, conversation.id, edited)
  return addMessage(rt.db, {
    conversationId: conversation.id,
    role: 'agent',
    content: 'Atualizei o rascunho com a sua edição. Confira e confirme quando estiver certo.',
    cards: [{ type: 'draft', draft: edited }],
  })
}

function submit(rt: Runtime, requesterId: string, draft: Draft, key: string): Promise<Ticket> {
  if (draft.kind === 'create') {
    if (!draft.type || !draft.category || !draft.priority || !draft.affected) {
      throw new ConflictError('Rascunho incompleto.')
    }
    return rt.tickets.createTicket(
      {
        type: draft.type,
        title: draft.title,
        description: draft.description,
        category: draft.category,
        priority: draft.priority,
        affected: draft.affected,
        requesterId,
      },
      key,
    )
  }
  if (!draft.ticketId) throw new ConflictError('Rascunho sem chamado.')
  const input =
    draft.kind === 'update'
      ? { action: 'comment' as const, requesterId, body: draft.description }
      : { action: 'reopen' as const, requesterId, reason: draft.description }
  return rt.tickets.updateTicket(draft.ticketId, input, key)
}

function confirmationText(draft: Draft, ticket: Ticket): string {
  if (draft.kind === 'create') {
    return `Pronto! Abri o ${ticket.id}. Você pode acompanhar por aqui quando quiser.`
  }
  if (draft.kind === 'update') return `Pronto! Adicionei a informação ao ${ticket.id}.`
  return `Pronto! Reabri o ${ticket.id}, e o prazo começou a contar de novo.`
}
