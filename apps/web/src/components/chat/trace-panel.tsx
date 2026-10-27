'use client'

import { HANDOFF_REASON_LABELS, type DecisionTrace, type TraceAction } from '@nexo/shared'
import { useState } from 'react'
import { formatUsd } from '@/lib/format'

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
export function ActionLine({ actions }: { actions: Pick<TraceAction, 'label' | 'status'>[] }) {
  if (actions.length === 0) return null
  return (
    <ul className="mb-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
      {actions.map((action, index) => (
        <li key={`${action.label}-${index}`} className="inline-flex items-center gap-1">
          <span aria-hidden className={action.status === 'error' ? 'text-danger' : 'text-ok'}>
            {action.status === 'error' ? '✕' : '✓'}
          </span>
          {action.label}
        </li>
      ))}
    </ul>
  )
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
  const tone = trace.confidence >= 0.8 ? 'bg-ok' : trace.confidence >= 0.6 ? 'bg-warn' : 'bg-danger'

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-xs font-medium text-ink-soft hover:text-brand"
      >
        {open ? 'Ocultar' : 'Como decidi'} · confiança {percent}%
      </button>

      {open && (
        <dl className="animate-in mt-2 grid gap-3 rounded-[var(--radius-card)] border border-line bg-canvas p-3 text-xs">
          <Row label="Entendi">
            <span className="font-medium text-ink">{INTENT_LABELS[trace.understood.intent]}</span>
            {' · '}
            {trace.understood.summary}
            {Object.keys(trace.understood.entities).length > 0 && (
              <span className="text-ink-faint">
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
                    <span className={a.status === 'error' ? 'text-danger' : 'text-ink'}>
                      {a.label}
                    </span>
                    <span className="text-ink-faint">
                      {' '}
                      → {a.outputSummary} ({a.durationMs} ms)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Row>

          <Row label="Confiança">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line" aria-hidden>
                <div className={`h-full ${tone}`} style={{ width: `${percent}%` }} />
              </div>
              <span className="text-ink">{percent}%</span>
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
                    className="rounded bg-surface px-1.5 py-0.5 text-[11px] ring-1 ring-line"
                  >
                    {rule}
                  </code>
                ))}
              </div>
            </Row>
          )}

          <Row label="Custo">
            {trace.model} · {trace.tokens.input + trace.tokens.output} tokens ·{' '}
            {formatUsd(trace.costUsd)} · {trace.latencyMs} ms
          </Row>
        </dl>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2">
      <dt className="font-medium text-ink-faint">{label}</dt>
      <dd className="text-ink-soft">{children}</dd>
    </div>
  )
}
