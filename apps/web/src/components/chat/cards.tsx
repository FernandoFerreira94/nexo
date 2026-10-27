'use client'

import {
  AFFECTED_LABELS,
  CATEGORY_LABELS,
  TICKET_TYPE_LABELS,
  type Card,
  type Draft,
  type TicketSummary,
} from '@nexo/shared'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PriorityBadge, StatusBadge } from '@/components/ui/ticket-badges'
import { formatDateTime } from '@/lib/format'

export function MessageCard({
  card,
  onDraftAction,
}: {
  card: Card
  onDraftAction?: (draft: Draft, action: 'confirm' | 'cancel') => Promise<void>
}) {
  if (card.type === 'tickets') return <TicketList tickets={card.tickets} />
  if (card.type === 'article') return <ArticleCard id={card.articleId} title={card.title} />
  return <DraftCard draft={card.draft} onAction={onDraftAction} />
}

export function TicketList({ tickets }: { tickets: TicketSummary[] }) {
  return (
    <ul className="grid gap-2">
      {tickets.map((t) => (
        <li
          key={t.id}
          className={`rounded-[var(--radius-card)] border bg-surface p-3 ${t.overdue ? 'border-danger/40' : 'border-line'}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-ink">{t.id}</span>
            <StatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} />
            {t.overdue && <Badge tone="danger">Vencido</Badge>}
          </div>
          <p className="mt-1.5 text-sm text-ink">{t.title}</p>
          <p className="mt-1 text-xs text-ink-faint">
            {CATEGORY_LABELS[t.category]} · aberto em {formatDateTime(t.createdAt)}
            {t.resolvedAt
              ? ` · resolvido em ${formatDateTime(t.resolvedAt)}`
              : ` · prazo ${formatDateTime(t.dueAt)}`}
          </p>
        </li>
      ))}
    </ul>
  )
}

function ArticleCard({ id, title }: { id: string; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3">
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-lg bg-brand-soft text-brand"
      >
        ?
      </span>
      <div>
        <p className="text-xs text-ink-faint">Central de ajuda · {id}</p>
        <p className="text-sm font-medium text-ink">{title}</p>
      </div>
    </div>
  )
}

const DRAFT_TITLES: Record<Draft['kind'], string> = {
  create: 'Rascunho do chamado',
  update: 'Complemento do chamado',
  reopen: 'Reabertura do chamado',
}

/** Nada é gravado até o funcionário clicar em Confirmar (decisão D01). */
function DraftCard({
  draft,
  onAction,
}: {
  draft: Draft
  onAction?: (draft: Draft, action: 'confirm' | 'cancel') => Promise<void>
}) {
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null)
  const pending = draft.status === 'pending' && onAction

  async function run(action: 'confirm' | 'cancel') {
    if (!onAction) return
    setBusy(action)
    try {
      await onAction(draft, action)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-brand/30 bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {DRAFT_TITLES[draft.kind]}
          {draft.ticketId ? ` ${draft.ticketId}` : ''}
        </p>
        <Badge
          tone={
            draft.status === 'submitted' ? 'ok' : draft.status === 'cancelled' ? 'neutral' : 'brand'
          }
        >
          {draft.status === 'submitted'
            ? 'Enviado'
            : draft.status === 'cancelled'
              ? 'Descartado'
              : `Versão ${draft.version}`}
        </Badge>
      </div>

      <dl className="mt-3 grid gap-2 text-sm">
        {draft.kind === 'create' && <Field label="Título">{draft.title}</Field>}
        <Field label={draft.kind === 'reopen' ? 'Motivo' : 'Descrição'}>{draft.description}</Field>
        {draft.kind === 'create' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {draft.type && <Field label="Tipo">{TICKET_TYPE_LABELS[draft.type]}</Field>}
              {draft.category && <Field label="Categoria">{CATEGORY_LABELS[draft.category]}</Field>}
              {draft.affected && <Field label="Afetados">{AFFECTED_LABELS[draft.affected]}</Field>}
              {draft.priority && (
                <Field label="Prioridade">
                  <PriorityBadge priority={draft.priority} />
                </Field>
              )}
            </div>
            {draft.priorityReason && (
              <p className="rounded-lg bg-canvas p-2 text-xs text-ink-soft">
                {draft.priorityReason}
                {draft.slaLabel && ` Prazo: ${draft.slaLabel}`}
                {draft.dueAtPreview && ` (até ${formatDateTime(draft.dueAtPreview)}).`}
              </p>
            )}
          </>
        )}
      </dl>

      {pending && (
        <div className="mt-4 flex gap-2">
          <Button onClick={() => run('confirm')} disabled={busy !== null}>
            {busy === 'confirm' ? 'Enviando…' : 'Confirmar'}
          </Button>
          <Button variant="secondary" onClick={() => run('cancel')} disabled={busy !== null}>
            Descartar
          </Button>
        </div>
      )}
      {draft.status === 'pending' && !onAction && (
        <p className="mt-3 text-xs text-ink-faint">
          Há uma versão mais nova deste rascunho abaixo.
        </p>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  )
}
