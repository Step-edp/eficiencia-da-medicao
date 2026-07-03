import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, type EnsaiosManualBlock } from './api'
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

function formatDisplayDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-')
  return `${day}/${month}/${year}`
}

function blocksToMap(blocks: EnsaiosManualBlock[]) {
  return new Map(blocks.map((block) => [block.date, block.reason]))
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
  const [manualBlocks, setManualBlocks] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busyDate, setBusyDate] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [pendingBlockDate, setPendingBlockDate] = useState<string | null>(null)
  const [pendingUnblockDate, setPendingUnblockDate] = useState<string | null>(null)
  const [blockReason, setBlockReason] = useState('')
  const [submittingBlock, setSubmittingBlock] = useState(false)
  const [submittingUnblock, setSubmittingUnblock] = useState(false)

  const loadBlocks = useCallback(async () => {
    setLoading(true)
    try {
      const { blocks } = await api.listEnsaiosManualBlocks()
      setManualBlocks(blocksToMap(blocks))
    } catch {
      setFeedback({
        type: 'error',
        message: 'Não foi possível carregar as datas bloqueadas.',
      })
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

  const closeBlockModal = () => {
    setPendingBlockDate(null)
    setBlockReason('')
    setSubmittingBlock(false)
  }

  const closeUnblockModal = () => {
    setPendingUnblockDate(null)
    setSubmittingUnblock(false)
  }

  const handleDayClick = (date: Date) => {
    if (isAutoBlocked(date)) return

    const key = toDateKey(date)
    const manualReason = manualBlocks.get(key)

    if (manualReason) {
      setPendingUnblockDate(key)
      setFeedback(null)
      return
    }

    setPendingBlockDate(key)
    setBlockReason('')
    setFeedback(null)
  }

  const confirmUnblock = async () => {
    if (!pendingUnblockDate) return

    setSubmittingUnblock(true)
    setFeedback(null)

    try {
      const { blocks } = await api.toggleEnsaiosManualBlock(pendingUnblockDate)
      setManualBlocks(blocksToMap(blocks))
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
      <p className="ensaios-calendar-intro">
        Clique em um dia útil para bloquear (informando o motivo) ou liberar. Sextas,
        sábados, domingos e feriados nacionais permanecem sempre indisponíveis.
      </p>

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
          const canToggle = inMonth && !autoReason && !loading

          let title = ''
          if (autoReason) {
            title =
              autoReason.startsWith('Feriado') ||
              autoReason === 'Recebimento de Medidores' ||
              autoReason === 'Fim de Semana'
                ? autoReason
                : `Indisponível (${autoReason})`
          } else if (isManual) {
            title = `Bloqueio manual: ${manualReason} — clique para liberar`
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
              onClick={() => handleDayClick(date)}
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
          manual (com motivo)
        </li>
        <li>
          <span className="ensaios-calendar-swatch is-auto-blocked" /> Sexta
          (Recebimento de Medidores), sábado e domingo (Fim de Semana) ou feriado
        </li>
      </ul>

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
