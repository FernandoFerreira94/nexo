import type { Priority } from '../schemas/ticket'

/**
 * SLA do Anexo A.
 * - Crítica: 1 hora corrida (24h por dia).
 * - Alta: 4 horas úteis.
 * - Média: 3 dias úteis = 30 horas úteis (dia útil de 10h).
 * - Baixa: 5 dias úteis = 50 horas úteis.
 * Horário útil: seg–sex, 8h–18h, America/Sao_Paulo, sem feriados (decisão D04).
 */
export const BUSINESS_HOURS = { startHour: 8, endHour: 18 } as const

/**
 * O Brasil não tem horário de verão desde 2019, então São Paulo é sempre UTC-3.
 * Usamos um offset fixo em vez de uma biblioteca de fuso (decisão D05).
 */
export const SAO_PAULO_OFFSET_MINUTES = -3 * 60

type SlaRule = { kind: 'wall_clock'; minutes: number } | { kind: 'business'; minutes: number }

export const SLA_BY_PRIORITY: Record<Priority, SlaRule> = {
  critical: { kind: 'wall_clock', minutes: 60 },
  high: { kind: 'business', minutes: 4 * 60 },
  medium: { kind: 'business', minutes: 3 * 10 * 60 },
  low: { kind: 'business', minutes: 5 * 10 * 60 },
}

export const SLA_LABELS: Record<Priority, string> = {
  critical: '1 hora (corrida, 24h)',
  high: '4 horas úteis',
  medium: '3 dias úteis',
  low: '5 dias úteis',
}

const MINUTE = 60_000
const OFFSET_MS = SAO_PAULO_OFFSET_MINUTES * MINUTE

/** Prazo final a partir do início do relógio (criação ou último retorno do analista). */
export function computeDueAt(slaStartAt: Date, priority: Priority): Date {
  const rule = SLA_BY_PRIORITY[priority]
  if (rule.kind === 'wall_clock') {
    return new Date(slaStartAt.getTime() + rule.minutes * MINUTE)
  }
  return addBusinessMinutes(slaStartAt, rule.minutes)
}

/**
 * Soma minutos úteis a uma data.
 * Trabalha num "relógio local" (UTC deslocado para São Paulo) e usa os getters UTC
 * para ler dia da semana e hora sem depender do fuso da máquina.
 */
export function addBusinessMinutes(start: Date, minutes: number): Date {
  let local = new Date(start.getTime() + OFFSET_MS)
  let remaining = minutes

  local = moveToBusinessTime(local)
  while (remaining > 0) {
    const endOfDay = atHour(local, BUSINESS_HOURS.endHour)
    const availableToday = (endOfDay.getTime() - local.getTime()) / MINUTE
    if (remaining <= availableToday) {
      local = new Date(local.getTime() + remaining * MINUTE)
      remaining = 0
    } else {
      remaining -= availableToday
      local = moveToBusinessTime(nextDayAt(local, BUSINESS_HOURS.startHour))
    }
  }
  return new Date(local.getTime() - OFFSET_MS)
}

/** Se a data cair fora do expediente, avança para o próximo início de expediente. */
function moveToBusinessTime(local: Date): Date {
  let current = local
  for (;;) {
    const day = current.getUTCDay()
    const isWeekend = day === 0 || day === 6
    const minutesOfDay = current.getUTCHours() * 60 + current.getUTCMinutes()
    const startMinutes = BUSINESS_HOURS.startHour * 60
    const endMinutes = BUSINESS_HOURS.endHour * 60

    if (isWeekend || minutesOfDay >= endMinutes) {
      current = nextDayAt(current, BUSINESS_HOURS.startHour)
    } else if (minutesOfDay < startMinutes) {
      return atHour(current, BUSINESS_HOURS.startHour)
    } else {
      return current
    }
  }
}

function atHour(local: Date, hour: number): Date {
  const copy = new Date(local)
  copy.setUTCHours(hour, 0, 0, 0)
  return copy
}

function nextDayAt(local: Date, hour: number): Date {
  const copy = atHour(local, hour)
  copy.setUTCDate(copy.getUTCDate() + 1)
  return copy
}
