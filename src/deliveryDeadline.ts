/** Entrega de medidores: somente às sextas; prazo = última sexta antes da data de ensaio. */

export function toCalendarDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Última sexta-feira estritamente anterior à data do ensaio.
 * Ex.: ensaio 13/08/2026 (qui) → prazo 07/08/2026 (sex).
 */
export function lastFridayBeforeAssay(scheduledAt: Date | string): Date {
  const source = typeof scheduledAt === 'string' ? new Date(scheduledAt) : scheduledAt
  const assayDay = toCalendarDate(source)
  const cursor = new Date(assayDay)
  cursor.setDate(cursor.getDate() - 1)
  while (cursor.getDay() !== 5) {
    cursor.setDate(cursor.getDate() - 1)
  }
  return cursor
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function formatDeliveryDeadlineLabel(deadline: Date): string {
  return `${pad(deadline.getDate())}/${pad(deadline.getMonth() + 1)}/${deadline.getFullYear()}`
}

export function isMeterDeliveryLate(options: {
  scheduledAt: Date | string
  trailStep: string
  entradaTrailStep?: string
  now?: Date
}): boolean {
  const entrada = options.entradaTrailStep ?? 'Entrada de medidores'
  if (options.trailStep !== entrada) {
    return false
  }
  const source =
    typeof options.scheduledAt === 'string'
      ? new Date(options.scheduledAt)
      : options.scheduledAt
  const now = options.now ?? new Date()
  const today = toCalendarDate(now)
  const deadline = lastFridayBeforeAssay(source)
  return today.getTime() > deadline.getTime()
}
