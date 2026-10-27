import {
  PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  type Priority,
  type TicketStatus,
} from '@nexo/shared'
import { Badge, type Tone } from './badge'

const PRIORITY_TONE: Record<Priority, Tone> = {
  critical: 'danger',
  high: 'warn',
  medium: 'brand',
  low: 'neutral',
}

const STATUS_TONE: Record<TicketStatus, Tone> = {
  open: 'brand',
  awaiting_analyst: 'warn',
  in_progress: 'brand',
  approved: 'ok',
  resolved: 'ok',
  closed: 'neutral',
}

export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABELS[priority]}</Badge>
)

export const StatusBadge = ({ status }: { status: TicketStatus }) => (
  <Badge tone={STATUS_TONE[status]}>{TICKET_STATUS_LABELS[status]}</Badge>
)
