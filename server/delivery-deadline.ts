/** Entrega de medidores: somente às sextas; prazo = última sexta antes da data de ensaio. */

export function toCalendarDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Última sexta-feira estritamente anterior à data do ensaio.
 * Ex.: ensaio 13/08/2026 (qui) → prazo 07/08/2026 (sex).
 */
export function lastFridayBeforeAssay(scheduledAt: Date): Date {
  const assayDay = toCalendarDate(scheduledAt)
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

/**
 * Atrasado se o dia atual (calendário) já passou da sexta de entrega
 * e o medidor ainda está aguardando Entrada.
 */
export function isMeterDeliveryLate(options: {
  scheduledAt: Date
  trailStep: string
  entradaTrailStep: string
  now?: Date
}): boolean {
  if (options.trailStep !== options.entradaTrailStep) {
    return false
  }
  const now = options.now ?? new Date()
  const today = toCalendarDate(now)
  const deadline = lastFridayBeforeAssay(options.scheduledAt)
  return today.getTime() > deadline.getTime()
}
