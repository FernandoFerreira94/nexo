'use client'

import {
  AFFECTED_LABELS,
  CATEGORY_LABELS,
  TICKET_TYPE_LABELS,
  type Card as MessageCardData,
  type Draft,
  type TicketSummary,
} from '@nexo/shared'
import { BookOpen, Clock, FileText, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PriorityBadge, StatusBadge } from '@/components/ui/ticket-badges'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export function MessageCard({
  card,
  onDraftAction,
}: {
  card: MessageCardData
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
        <li key={t.id}>
          <Card
            className={cn(
              'gap-0 py-3 shadow-xs transition-shadow hover:shadow-sm',
              t.overdue && 'border-destructive/40 bg-destructive/[0.03]',
            )}
          >
            <div className="flex flex-wrap items-center gap-1.5 px-4">
              <span className="font-mono text-caption font-semibold text-foreground">{t.id}</span>
              <StatusBadge status={t.status} />
              <PriorityBadge priority={t.priority} />
              {t.overdue && (
                <Badge variant="destructive">
                  <TriangleAlert /> Vencido
                </Badge>
              )}
            </div>
            <p className="mt-1.5 px-4 text-body font-medium">{t.title}</p>
            <p className="mt-1 flex items-center gap-1 px-4 text-caption text-muted-foreground">
              <Clock className="size-3" />
              {CATEGORY_LABELS[t.category]} ·{' '}
              {t.resolvedAt
                ? `resolvido em ${formatDateTime(t.resolvedAt)}`
                : `prazo ${formatDateTime(t.dueAt)}`}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  )
}

function ArticleCard({ id, title }: { id: string; title: string }) {
  return (
    <Card className="flex-row items-center gap-3 px-4 py-3 shadow-xs">
      <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
        <BookOpen className="size-4" />
      </span>
      <div>
        <p className="text-overline text-muted-foreground">Central de ajuda · {id}</p>
        <p className="mt-0.5 text-body font-medium">{title}</p>
      </div>
    </Card>
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
  const actionable = draft.status === 'pending' && onAction

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
    <Card
      className={cn(
        'gap-4 py-4 shadow-sm',
        actionable && 'border-primary/30 ring-4 ring-primary/5',
        draft.status !== 'pending' && 'opacity-80',
      )}
    >
      <div className="flex items-center justify-between gap-2 px-5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-accent text-accent-foreground">
            <FileText className="size-4" />
          </span>
          <p className="text-heading">
            {DRAFT_TITLES[draft.kind]}
            {draft.ticketId ? ` ${draft.ticketId}` : ''}
          </p>
        </div>
        <Badge
          variant={
            draft.status === 'submitted'
              ? 'success'
              : draft.status === 'cancelled'
                ? 'secondary'
                : 'info'
          }
        >
          {draft.status === 'submitted'
            ? 'Enviado'
            : draft.status === 'cancelled'
              ? 'Descartado'
              : `Versão ${draft.version}`}
        </Badge>
      </div>

      <Separator />

      <dl className="grid gap-3 px-5 text-body">
        {draft.kind === 'create' && <Field label="Título">{draft.title}</Field>}
        <Field label={draft.kind === 'reopen' ? 'Motivo' : 'Descrição'}>{draft.description}</Field>
        {draft.kind === 'create' && (
          <>
            <div className="grid grid-cols-2 gap-3">
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
              <p className="flex gap-2 rounded-md bg-muted p-3 text-caption text-muted-foreground">
                <Clock className="mt-px size-3.5 shrink-0" />
                <span>
                  {draft.priorityReason}
                  {draft.slaLabel && ` Prazo: ${draft.slaLabel}`}
                  {draft.dueAtPreview && ` (até ${formatDateTime(draft.dueAtPreview)}).`}
                </span>
              </p>
            )}
          </>
        )}
      </dl>

      {actionable && (
        <div className="flex gap-2 px-5">
          <Button onClick={() => run('confirm')} disabled={busy !== null}>
            {busy === 'confirm' && <LoaderCircle className="animate-spin" />}
            Confirmar
          </Button>
          <Button variant="outline" onClick={() => run('cancel')} disabled={busy !== null}>
            Descartar
          </Button>
        </div>
      )}
      {draft.status === 'pending' && !onAction && (
        <p className="px-5 text-caption text-muted-foreground">
          Há uma versão mais nova deste rascunho abaixo.
        </p>
      )}
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-overline text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground">{children}</dd>
    </div>
  )
}
