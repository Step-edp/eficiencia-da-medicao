import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  api,
  ApiError,
  type EnsaiosCalendarMeter,
  type EnsaiosManualBlock,
} from './api'
import {
  getAutoBlockReason,
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

function formatDisplayDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-')
  return `${day}/${month}/${year}`
}

function blocksToMap(blocks: EnsaiosManualBlock[]) {
  return new Map(blocks.map((block) => [block.date, block.reason]))
}

function metersToMap(meters: EnsaiosCalendarMeter[]) {
  const map = new Map<string, EnsaiosCalendarMeter[]>()
  for (const meter of meters) {
    const current = map.get(meter.scheduledDate) ?? []
    current.push(meter)
    map.set(meter.scheduledDate, current)
  }
  return map
}

function getMonthDateRange(year: number, month: number) {
  const pad = (value: number) => String(value).padStart(2, '0')
  const from = `${year}-${pad(month + 1)}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const to = `${year}-${pad(month + 1)}-${pad(lastDay)}`
  return { from, to }
}

function calendarMeterStatusLabel(status: EnsaiosCalendarMeter['status']) {
  switch (status) {
    case 'Agendado':
      return 'Agendado'
    case 'Recebido':
      return 'Recebido'
    case 'Ensaiado':
      return 'Ensaiado'
    default:
      return status
  }
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

export function EnsaiosCalendar({
  readOnly = false,
  onEnsaiar,
}: {
  readOnly?: boolean
  onEnsaiar?: (meter: EnsaiosCalendarMeter) => void
}) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [manualBlocks, setManualBlocks] = useState<Map<string, string>>(new Map())
  const [dayMeters, setDayMeters] = useState<Map<string, EnsaiosCalendarMeter[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busyDate, setBusyDate] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [pendingBlockDate, setPendingBlockDate] = useState<string | null>(null)
  const [pendingUnblockDate, setPendingUnblockDate] = useState<string | null>(null)
  const [blockReason, setBlockReason] = useState('')
  const [submittingBlock, setSubmittingBlock] = useState(false)
  const [submittingUnblock, setSubmittingUnblock] = useState(false)

  const loadCalendarData = useCallback(async () => {
    setLoading(true)
    const { from, to } = getMonthDateRange(viewYear, viewMonth)
    try {
      const [blocksResponse, metersResponse] = await Promise.all([
        api.listEnsaiosManualBlocks(),
        api.listEnsaiosCalendarMeters(from, to),
      ])
      setManualBlocks(blocksToMap(blocksResponse.blocks))
      setDayMeters(metersToMap(metersResponse.meters))
    } catch {
      setFeedback({
        type: 'error',
        message: 'Não foi possível carregar o calendário de ensaios.',
      })
    } finally {
      setLoading(false)
    }
  }, [viewMonth, viewYear])

  useEffect(() => {
    void loadCalendarData()
  }, [loadCalendarData])

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

  const closeBlockModal = () => {
    setPendingBlockDate(null)
    setBlockReason('')
    setSubmittingBlock(false)
  }

  const closeUnblockModal = () => {
    setPendingUnblockDate(null)
    setSubmittingUnblock(false)
  }

  const closeDayModal = () => {
    setSelectedDay(null)
  }

  const handleDayClick = (date: Date, inMonth: boolean) => {
    if (!inMonth) return
    setSelectedDay(toDateKey(date))
    setFeedback(null)
  }

  const openBlockFromDay = (dateKey: string) => {
    closeDayModal()
    setPendingBlockDate(dateKey)
    setBlockReason('')
    setFeedback(null)
  }

  const openUnblockFromDay = (dateKey: string) => {
    closeDayModal()
    setPendingUnblockDate(dateKey)
    setFeedback(null)
  }

  const selectedDayMeters = selectedDay ? (dayMeters.get(selectedDay) ?? []) : []
  const selectedDayDate = selectedDay ? new Date(`${selectedDay}T12:00:00`) : null
  const selectedDayAutoReason = selectedDayDate ? getAutoBlockReason(selectedDayDate) : null
  const selectedDayManualReason = selectedDay ? manualBlocks.get(selectedDay) : undefined

  const confirmUnblock = async () => {
    if (!pendingUnblockDate) return

    setSubmittingUnblock(true)
    setFeedback(null)

    try {
      const { blocks } = await api.toggleEnsaiosManualBlock(pendingUnblockDate)
      setManualBlocks(blocksToMap(blocks))
      void loadCalendarData()
      setFeedback({
        type: 'success',
        message: `Data ${formatDisplayDate(pendingUnblockDate)} liberada.`,
      })
      closeUnblockModal()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível liberar a data.',
      })
      setSubmittingUnblock(false)
    } finally {
      setBusyDate(null)
    }
  }

  const handleBlockSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!pendingBlockDate) return

    const reason = blockReason.trim()
    if (!reason) {
      setFeedback({
        type: 'error',
        message: 'Informe o motivo do bloqueio manual.',
      })
      return
    }

    setSubmittingBlock(true)
    setFeedback(null)

    try {
      const { blocks } = await api.toggleEnsaiosManualBlock(pendingBlockDate, reason)
      setManualBlocks(blocksToMap(blocks))
      void loadCalendarData()
      setFeedback({
        type: 'success',
        message: `Data ${formatDisplayDate(pendingBlockDate)} bloqueada.`,
      })
      closeBlockModal()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível bloquear a data.',
      })
      setSubmittingBlock(false)
    }
  }

  return (
    <div className="ensaios-calendar">
      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
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
          const manualReason = manualBlocks.get(key)
          const isManual = Boolean(manualReason)
          const isBlocked = Boolean(autoReason) || isManual
          const isToday = key === toDateKey(today)
          const meters = dayMeters.get(key) ?? []
          const hasMeters = meters.length > 0
          const allEnsaiados =
            hasMeters && meters.every((meter) => meter.status === 'Ensaiado')
          const previewMeters = meters.slice(0, 3)
          const extraMeters = meters.length - previewMeters.length

          let title = hasMeters
            ? 'Clique para ver os medidores programados'
            : 'Sem ensaio programado — clique para detalhes'
          if (autoReason) {
            title =
              autoReason.startsWith('Feriado') ||
              autoReason === 'Recebimento de Medidores' ||
              autoReason === 'Fim de Semana'
                ? `${autoReason} — ${title}`
                : `Indisponível (${autoReason}) — ${title}`
          } else if (isManual) {
            title = `Bloqueio manual: ${manualReason} — ${title}`
          } else if (allEnsaiados) {
            title = 'Todos os medidores ensaiados'
          }

          return (
            <button
              key={key}
              type="button"
              className={[
                'ensaios-calendar-day',
                !inMonth ? 'is-outside' : '',
                inMonth && !hasMeters ? 'is-no-ensaio' : '',
                isBlocked ? 'is-blocked' : '',
                hasMeters && !allEnsaiados ? 'is-available' : '',
                autoReason &&
                autoReason !== 'Fim de Semana' &&
                autoReason !== 'Recebimento de Medidores'
                  ? 'is-auto-blocked'
                  : '',
                isManual ? 'is-manual-blocked' : '',
                allEnsaiados ? 'is-all-ensaiado' : '',
                isToday ? 'is-today' : '',
                busyDate === key ? 'is-busy' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!inMonth || busyDate === key}
              title={title}
              onClick={() => handleDayClick(date, inMonth)}
            >
              <span className="ensaios-calendar-day-number">{date.getDate()}</span>
              {autoReason === 'Recebimento de Medidores' ||
              autoReason === 'Fim de Semana' ? (
                <span className="ensaios-calendar-day-reason">{autoReason}</span>
              ) : autoReason?.startsWith('Feriado') ? (
                <span className="ensaios-calendar-day-tag">Feriado</span>
              ) : null}
              {manualReason ? (
                <span className="ensaios-calendar-day-reason">{manualReason}</span>
              ) : null}
              {meters.length > 0 ? (
                <span className="ensaios-calendar-day-meters" aria-hidden="true">
                  {previewMeters.map((meter) => (
                    <span
                      key={meter.id}
                      className={`ensaios-calendar-day-meter is-${meter.status.toLowerCase()}`}
                    >
                      {meter.meter}
                    </span>
                  ))}
                  {extraMeters > 0 ? (
                    <span className="ensaios-calendar-day-meter is-more">+{extraMeters}</span>
                  ) : null}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <ul className="ensaios-calendar-legend" aria-label="Legenda do calendário">
        <li>
          <span className="ensaios-calendar-swatch is-available" /> Com medidor para ensaiar
        </li>
        <li>
          <span className="ensaios-calendar-swatch is-no-ensaio" /> Sem ensaio programado
        </li>
        <li>
          <span className="ensaios-calendar-swatch is-all-ensaiado" /> Dia concluído (todos
          ensaiados)
        </li>
        <li>
          <span className="ensaios-calendar-swatch is-manual-blocked" /> Bloqueio
          manual (com motivo)
        </li>
        <li>
          <span className="ensaios-calendar-swatch is-auto-blocked" /> Feriado
        </li>
      </ul>

      {selectedDay
        ? createPortal(
            <div
              className="ensaios-block-modal-overlay"
              role="presentation"
              onClick={closeDayModal}
            >
              <div
                className="ensaios-block-modal ensaios-day-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ensaios-day-title"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 id="ensaios-day-title">Medidores do dia</h3>
                <p className="ensaios-block-modal-date">{formatDisplayDate(selectedDay)}</p>

                {selectedDayMeters.length === 0 ? (
                  <p className="entrada-panel-empty">Nenhum medidor programado para ensaio.</p>
                ) : (
                  <ul className="ensaios-day-meter-list">
                    {selectedDayMeters.map((meter) => (
                      <li key={meter.id} className="ensaios-day-meter-item">
                        <div className="ensaios-day-meter-main">
                          <strong>{meter.meter}</strong>
                          <span className="ensaios-day-meter-csd">{meter.csd || '—'}</span>
                        </div>
                        <div className="ensaios-day-meter-actions">
                          <span
                            className={`ensaios-day-meter-status is-${meter.status.toLowerCase()}`}
                          >
                            {calendarMeterStatusLabel(meter.status)}
                          </span>
                          {!readOnly && meter.status === 'Recebido' && onEnsaiar ? (
                            <button
                              type="button"
                              className="primary-button compact-button"
                              onClick={() => {
                                closeDayModal()
                                onEnsaiar(meter)
                              }}
                            >
                              Ensaiar
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {!readOnly && selectedDay && !selectedDayAutoReason ? (
                  <div className="ensaios-day-modal-admin">
                    {selectedDayManualReason ? (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openUnblockFromDay(selectedDay)}
                      >
                        Liberar bloqueio manual
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openBlockFromDay(selectedDay)}
                      >
                        Bloquear dia manualmente
                      </button>
                    )}
                  </div>
                ) : null}

                <div className="ensaios-block-modal-actions">
                  <button type="button" className="primary-button" onClick={closeDayModal}>
                    Fechar
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {pendingUnblockDate
        ? createPortal(
            <div
              className="ensaios-block-modal-overlay"
              role="presentation"
              onClick={closeUnblockModal}
            >
              <div
                className="ensaios-block-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ensaios-unblock-title"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 id="ensaios-unblock-title">Liberar data</h3>
                <p className="ensaios-block-modal-date">
                  {formatDisplayDate(pendingUnblockDate)}
                </p>
                {manualBlocks.get(pendingUnblockDate) ? (
                  <p className="ensaios-unblock-reason">
                    Motivo atual: {manualBlocks.get(pendingUnblockDate)}
                  </p>
                ) : null}
                <p className="ensaios-unblock-message">
                  Deseja liberar esta data e remover o bloqueio manual?
                </p>

                <div className="ensaios-block-modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={closeUnblockModal}
                    disabled={submittingUnblock}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={submittingUnblock}
                    onClick={() => void confirmUnblock()}
                  >
                    {submittingUnblock ? 'Liberando...' : 'Confirmar liberação'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {pendingBlockDate
        ? createPortal(
            <div
              className="ensaios-block-modal-overlay"
              role="presentation"
              onClick={closeBlockModal}
            >
              <form
                className="ensaios-block-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ensaios-block-title"
                onClick={(event) => event.stopPropagation()}
                onSubmit={(event) => void handleBlockSubmit(event)}
              >
                <h3 id="ensaios-block-title">Bloquear data</h3>
                <p className="ensaios-block-modal-date">
                  {formatDisplayDate(pendingBlockDate)}
                </p>

                <label className="full-width">
                  Motivo do bloqueio
                  <textarea
                    rows={4}
                    value={blockReason}
                    onChange={(event) => setBlockReason(event.target.value)}
                    placeholder="Ex.: Manutenção do equipamento, falta de pessoal..."
                    required
                    autoFocus
                  />
                </label>

                <div className="ensaios-block-modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={closeBlockModal}
                    disabled={submittingBlock}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={submittingBlock}
                  >
                    {submittingBlock ? 'Salvando...' : 'Confirmar bloqueio'}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
