import { useMemo, useState } from 'react'
import type { VacationPeriod } from './api'

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseIsoDate(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function monthLabel(year: number, monthIndex: number) {
  const label = new Date(year, monthIndex, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function isInRange(iso: string, start: string, end: string) {
  if (!start || !end) return false
  return iso >= start && iso <= end
}

type DayMark = {
  isVacation: boolean
  isOtherAbsence: boolean
  isRangeStart: boolean
  isRangeEnd: boolean
  labels: string[]
}

type AgendaCalendarProps = {
  periods: VacationPeriod[]
  vacationStart: string
  vacationEnd: string
  interactive?: boolean
  onSelectDate?: (isoDate: string) => void
}

export function AgendaCalendar({
  periods,
  vacationStart,
  vacationEnd,
  interactive = false,
  onSelectDate,
}: AgendaCalendarProps) {
  const initial = parseIsoDate(vacationStart) ?? new Date()
  const [cursor, setCursor] = useState(() => ({
    year: initial.getFullYear(),
    month: initial.getMonth(),
  }))

  const vacationPeriods = useMemo(
    () => periods.filter((period) => period.absenceType === 'ferias'),
    [periods],
  )
  const otherPeriods = useMemo(
    () => periods.filter((period) => period.absenceType !== 'ferias'),
    [periods],
  )

  const activeVacationStart = vacationStart || vacationPeriods[0]?.startDate || ''
  const activeVacationEnd = vacationEnd || vacationPeriods[0]?.endDate || ''

  const days = useMemo(() => {
    const firstOfMonth = new Date(cursor.year, cursor.month, 1)
    const startOffset = (firstOfMonth.getDay() + 6) % 7 // Monday-first
    const gridStart = new Date(cursor.year, cursor.month, 1 - startOffset)
    const cells: Array<{
      iso: string
      day: number
      inMonth: boolean
      mark: DayMark
    }> = []

    for (let index = 0; index < 42; index += 1) {
      const date = new Date(gridStart)
      date.setDate(gridStart.getDate() + index)
      const iso = toIsoDate(date)
      const inVacationDraft = isInRange(iso, activeVacationStart, activeVacationEnd)
      const vacationHit = vacationPeriods.some((period) =>
        isInRange(iso, period.startDate, period.endDate),
      )
      const otherHits = otherPeriods.filter((period) =>
        isInRange(iso, period.startDate, period.endDate),
      )
      const isVacation = inVacationDraft || vacationHit
      const labels: string[] = []
      if (isVacation) labels.push('Férias')
      for (const period of otherHits) {
        const label =
          period.absenceTypeLabel ||
          (period.absenceType === 'ferias' ? 'Férias' : 'Ausência')
        if (!labels.includes(label)) labels.push(label)
      }

      cells.push({
        iso,
        day: date.getDate(),
        inMonth: date.getMonth() === cursor.month,
        mark: {
          isVacation,
          isOtherAbsence: otherHits.length > 0,
          isRangeStart: Boolean(
            activeVacationStart &&
              iso === activeVacationStart &&
              activeVacationEnd,
          ),
          isRangeEnd: Boolean(
            activeVacationEnd && iso === activeVacationEnd && activeVacationStart,
          ),
          labels,
        },
      })
    }

    return cells
  }, [activeVacationEnd, activeVacationStart, cursor.month, cursor.year, otherPeriods, vacationPeriods])

  const goMonth = (delta: number) => {
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  const todayIso = toIsoDate(new Date())

  return (
    <div className="agenda-calendar" aria-label="Calendário de férias e ausências">
      <div className="agenda-calendar-toolbar">
        <button
          type="button"
          className="secondary-button agenda-calendar-nav"
          onClick={() => goMonth(-1)}
          aria-label="Mês anterior"
        >
          ‹
        </button>
        <h4 className="agenda-calendar-title">{monthLabel(cursor.year, cursor.month)}</h4>
        <button
          type="button"
          className="secondary-button agenda-calendar-nav"
          onClick={() => goMonth(1)}
          aria-label="Próximo mês"
        >
          ›
        </button>
      </div>

      <div className="agenda-calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="agenda-calendar-grid" role="grid">
        {days.map((cell) => {
          const classNames = [
            'agenda-calendar-day',
            cell.inMonth ? '' : 'is-outside',
            cell.iso === todayIso ? 'is-today' : '',
            cell.mark.isVacation ? 'is-vacation' : '',
            cell.mark.isOtherAbsence ? 'is-absence' : '',
            cell.mark.isRangeStart ? 'is-range-start' : '',
            cell.mark.isRangeEnd ? 'is-range-end' : '',
            interactive ? 'is-interactive' : '',
          ]
            .filter(Boolean)
            .join(' ')

          const title = cell.mark.labels.length
            ? `${cell.iso} · ${cell.mark.labels.join(', ')}`
            : cell.iso

          if (interactive && onSelectDate && cell.inMonth) {
            return (
              <button
                key={cell.iso}
                type="button"
                className={classNames}
                title={title}
                aria-label={title}
                onClick={() => onSelectDate(cell.iso)}
              >
                <span>{cell.day}</span>
              </button>
            )
          }

          return (
            <div key={cell.iso} className={classNames} title={title} role="gridcell">
              <span>{cell.day}</span>
            </div>
          )
        })}
      </div>

      <div className="agenda-calendar-legend" aria-label="Legenda do calendário">
        <span className="agenda-calendar-legend-item">
          <span className="agenda-calendar-swatch is-vacation" aria-hidden="true" />
          Férias
        </span>
        <span className="agenda-calendar-legend-item">
          <span className="agenda-calendar-swatch is-absence" aria-hidden="true" />
          Outras ausências
        </span>
        <span className="agenda-calendar-legend-item">
          <span className="agenda-calendar-swatch is-today" aria-hidden="true" />
          Hoje
        </span>
      </div>

      {interactive ? (
        <p className="agenda-calendar-hint">
          Clique em um dia para definir o início; clique em outro dia para definir o fim das
          férias.
        </p>
      ) : null}
    </div>
  )
}

/** Helpers de seleção início/fim a partir do clique no calendário. */
export function nextVacationRangeFromClick(
  isoDate: string,
  currentStart: string,
  currentEnd: string,
): { startDate: string; endDate: string } {
  if (!currentStart || (currentStart && currentEnd)) {
    return { startDate: isoDate, endDate: '' }
  }
  if (isoDate < currentStart) {
    return { startDate: isoDate, endDate: currentStart }
  }
  return { startDate: currentStart, endDate: isoDate }
}
