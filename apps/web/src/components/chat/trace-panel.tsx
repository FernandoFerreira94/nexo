'use client'

import { HANDOFF_REASON_LABELS, type DecisionTrace, type TraceAction } from '@nexo/shared'
import { Check, ChevronDown, LoaderCircle, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'

const INTENT_LABELS: Record<DecisionTrace['understood']['intent'], string> = {
  question: 'Dúvida',
  ticket_status: 'Consultar chamado',
  new_issue: 'Problema ou pedido novo',
  add_info: 'Complementar chamado',
  reopen: 'Reabrir chamado',
  talk_to_human: 'Falar com analista',
  out_of_scope: 'Fora de TI',
  greeting: 'Saudação',
  unknown: 'Não identificado',
}

/** Linha de ações acima da resposta: "✓ consultou seus chamados". */
export function ActionLine({
  actions,
}: {
  actions: { label: string; status: TraceAction['status'] | 'running' }[]
}) {
  if (actions.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5">
      {actions.map((action, index) => (
        <li
          key={`${action.label}-${index}`}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-caption text-muted-foreground',
            action.status === 'error' && 'border-destructive/30 text-destructive',
          )}
        >
          {action.status === 'running' ? (
            <LoaderCircle className="size-3 animate-spin text-primary" />
          ) : action.status === 'error' ? (
            <X className="size-3" />
          ) : (
            <Check className="size-3 text-success" />
          )}
          {action.status === 'running' ? `${action.label}…` : action.label}
        </li>
      ))}
    </ul>
  )
}

function confidenceTone(value: number) {
  if (value >= 0.8) return { bar: 'bg-success', text: 'text-success' }
  if (value >= 0.6) return { bar: 'bg-warning', text: 'text-warning' }
  return { bar: 'bg-destructive', text: 'text-destructive' }
}

/** "Como decidi": entendeu / fez / confiança / porquê / regras / custo. */
export function TracePanel({
  trace,
  defaultOpen = false,
}: {
  trace: DecisionTrace
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const percent = Math.round(trace.confidence * 100)
  const tone = confidenceTone(trace.confidence)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group inline-flex items-center gap-1.5 rounded-md text-caption font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <Sparkles className="size-3.5" />
        Como decidi
        <span className={cn('font-semibold', tone.text)}>· {percent}%</span>
        <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1">
        <dl className="mt-2 grid gap-3 rounded-lg border bg-muted/50 p-4 text-caption">
          <Row label="Entendi">
            <span className="font-medium text-foreground">
              {INTENT_LABELS[trace.understood.intent]}
            </span>
            {' · '}
            {trace.understood.summary}
            {Object.keys(trace.understood.entities).length > 0 && (
              <span className="text-muted-foreground/80">
                {' '}
                (
                {Object.entries(trace.understood.entities)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(', ')}
                )
              </span>
            )}
          </Row>

          <Row label="Fiz">
            {trace.actions.length === 0 ? (
              'Respondi sem consultar sistemas.'
            ) : (
              <ul className="grid gap-1">
                {trace.actions.map((a, i) => (
                  <li key={i}>
                    <span className={a.status === 'error' ? 'text-destructive' : 'text-foreground'}>
                      {a.label}
                    </span>
                    <span className="text-muted-foreground/80">
                      {' '}
                      → {a.outputSummary} · {a.durationMs} ms
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Row>

          <Row label="Confiança">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-border" aria-hidden>
                <div
                  className={cn('h-full rounded-full', tone.bar)}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className={cn('font-semibold', tone.text)}>{percent}%</span>
            </div>
            <p className="mt-1">{trace.confidenceReason}</p>
          </Row>

          <Row label="Por quê">{trace.rationale}</Row>

          {trace.handoff && <Row label="Transferência">{HANDOFF_REASON_LABELS[trace.handoff]}</Row>}

          {trace.rulesApplied.length > 0 && (
            <Row label="Regras">
              <div className="flex flex-wrap gap-1">
                {trace.rulesApplied.map((rule) => (
                  <code
                    key={rule}
                    className="rounded border bg-card px-1.5 py-0.5 font-mono text-[0.6875rem] text-foreground"
                  >
                    {rule}
                  </code>
                ))}
              </div>
            </Row>
          )}

          <Row label="Custo">
            <span className="font-mono">
              {trace.model} · {trace.tokens.input + trace.tokens.output} tokens ·{' '}
              {formatUsd(trace.costUsd)} · {trace.latencyMs} ms
            </span>
          </Row>
        </dl>
      </CollapsibleContent>
    </Collapsible>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3">
      <dt className="text-overline pt-0.5 text-muted-foreground/80">{label}</dt>
      <dd className="text-muted-foreground">{children}</dd>
    </div>
  )
}
