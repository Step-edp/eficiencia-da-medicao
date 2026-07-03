import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import {
  getAutoBlockReason,
  isAutoBlocked,
  toDateKey,
} from './brazilianHolidays'

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

type CalendarCell = {
  date: Date
  inMonth: boolean
}

function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay()
  const gridStart = new Date(year, month, 1 - startOffset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return {
      date,
      inMonth: date.getMonth() === month,
    }
  })
}

export function EnsaiosCalendar() {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [manualBlocks, setManualBlocks] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busyDate, setBusyDate] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const loadBlocks = useCallback(async () => {
    setLoading(true)
    try {
      const { dates } = await api.listEnsaiosManualBlocks()
      setManualBlocks(new Set(dates))
    } catch {
      setFeedback('Não foi possível carregar as datas bloqueadas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBlocks()
  }, [loadBlocks])

  const cells = useMemo(
    () => buildMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  )

  const goToPreviousMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((year) => year - 1)
      return
    }
    setViewMonth((month) => month - 1)
  }

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((year) => year + 1)
      return
    }
    setViewMonth((month) => month + 1)
  }

  const toggleManualBlock = async (date: Date) => {
    if (isAutoBlocked(date)) return

    const key = toDateKey(date)
    setBusyDate(key)
    setFeedback(null)

    try {
      const { dates, blocked } = await api.toggleEnsaiosManualBlock(key)
      setManualBlocks(new Set(dates))
      setFeedback(
        blocked
          ? `Data ${key.split('-').reverse().join('/')} bloqueada.`
          : `Data ${key.split('-').reverse().join('/')} liberada.`,
      )
    } catch {
      setFeedback('Não foi possível atualizar a data.')
    } finally {
      setBusyDate(null)
    }
  }

  return (
    <div className="ensaios-calendar">
      <p className="ensaios-calendar-intro">
        Clique em um dia útil para bloquear ou liberar. Sextas, sábados, domingos
        e feriados nacionais permanecem sempre indisponíveis.
      </p>

      {feedback ? (
        <div className="login-feedback success" role="status">
          {feedback}
        </div>
      ) : null}

      <div className="ensaios-calendar-toolbar">
        <button type="button" className="secondary-button" onClick={goToPreviousMonth}>
          ‹ Anterior
        </button>
        <h3 className="ensaios-calendar-title">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h3>
        <button type="button" className="secondary-button" onClick={goToNextMonth}>
          Próximo ›
        </button>
      </div>

      <div
        className={`ensaios-calendar-grid${loading ? ' is-loading' : ''}`}
        aria-busy={loading}
      >
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="ensaios-calendar-weekday">
            {label}
          </div>
        ))}

        {cells.map(({ date, inMonth }) => {
          const key = toDateKey(date)
          const autoReason = getAutoBlockReason(date)
          const isManual = manualBlocks.has(key)
          const isBlocked = Boolean(autoReason) || isManual
          const isToday = key === toDateKey(today)
          const canToggle = inMonth && !autoReason && !loading

          let title = ''
          if (autoReason) {
            title = autoReason.startsWith('Feriado')
              ? autoReason
              : `Indisponível (${autoReason})`
          } else if (isManual) {
            title = 'Bloqueio manual — clique para liberar'
          } else if (canToggle) {
            title = 'Disponível — clique para bloquear'
          }

          return (
            <button
              key={key}
              type="button"
              className={[
                'ensaios-calendar-day',
                !inMonth ? 'is-outside' : '',
                isBlocked ? 'is-blocked' : 'is-available',
                autoReason ? 'is-auto-blocked' : '',
                isManual ? 'is-manual-blocked' : '',
                isToday ? 'is-today' : '',
                busyDate === key ? 'is-busy' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!canToggle || busyDate === key}
              title={title}
              onClick={() => void toggleManualBlock(date)}
            >
              <span className="ensaios-calendar-day-number">{date.getDate()}</span>
              {autoReason?.startsWith('Feriado') ? (
                <span className="ensaios-calendar-day-tag">Feriado</span>
              ) : null}
            </button>
          )
        })}
      </div>

      <ul className="ensaios-calendar-legend" aria-label="Legenda do calendário">
        <li>
          <span className="ensaios-calendar-swatch is-available" /> Disponível
        </li>
        <li>
          <span className="ensaios-calendar-swatch is-manual-blocked" /> Bloqueio
          manual
        </li>
        <li>
          <span className="ensaios-calendar-swatch is-auto-blocked" /> Sexta, fim
          de semana ou feriado
        </li>
      </ul>
    </div>
  )
}
