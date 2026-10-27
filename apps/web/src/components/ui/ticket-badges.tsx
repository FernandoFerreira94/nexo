import {
  PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  type Priority,
  type TicketStatus,
} from '@nexo/shared'
import { Badge } from './badge'

type Variant = 'secondary' | 'info' | 'success' | 'warning' | 'destructive'

const PRIORITY_VARIANT: Record<Priority, Variant> = {
  critical: 'destructive',
  high: 'warning',
  medium: 'info',
  low: 'secondary',
}

const STATUS_VARIANT: Record<TicketStatus, Variant> = {
  open: 'info',
  awaiting_analyst: 'warning',
  in_progress: 'info',
  approved: 'success',
  resolved: 'success',
  closed: 'secondary',
}

export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <Badge variant={PRIORITY_VARIANT[priority]}>{PRIORITY_LABELS[priority]}</Badge>
)

export const StatusBadge = ({ status }: { status: TicketStatus }) => (
  <Badge variant={STATUS_VARIANT[status]}>{TICKET_STATUS_LABELS[status]}</Badge>
)
