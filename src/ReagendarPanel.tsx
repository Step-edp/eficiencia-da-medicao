import { FormEvent, useCallback, useState } from 'react'
import {
  api,
  ApiError,
  type MeterScheduleHistoryRecord,
  type MeterScheduleRecord,
} from './api'
import { formatAuditAction, formatAuditDate } from './auditLabels'
import { LoginFeedback } from './LoginFeedback'
import {
  NUMERIC_FIELD_LIMITS,
  sanitizeNumericInput,
  validateNumericField,
} from './numericFieldValidation'

function toDatetimeLocalValue(isoDate: string) {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return ''

  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatActor(entry: MeterScheduleHistoryRecord) {
  const name = entry.userName?.trim()
  const registration = entry.userRegistration?.trim()
  if (name && registration) return `${name} (${registration})`
  if (name) return name
  if (registration) return registration
  return 'Sistema / público'
}

export function ReagendarPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [meterQuery, setMeterQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [schedules, setSchedules] = useState<MeterScheduleRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [history, setHistory] = useState<MeterScheduleHistoryRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [newScheduledAt, setNewScheduledAt] = useState('')
  const [justification, setJustification] = useState('')
  const [saving, setSaving] = useState(false)
  const [searchedMeter, setSearchedMeter] = useState('')
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const selected = schedules.find((item) => item.id === selectedId) ?? null

  const loadHistory = useCallback(async (meter: string) => {
    setLoadingHistory(true)
    try {
      const response = await api.listMeterScheduleHistory(meter)
      setHistory(response.history)
    } catch {
      setHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault()
    const meter = meterQuery.trim()
    const validationError = validateNumericField(meter, 'medidor')
    if (validationError) {
      setFeedback({ type: 'error', message: validationError })
      return
    }

    setSearching(true)
    setFeedback(null)
    setSchedules([])
    setSelectedId(null)
    setHistory([])
    setNewScheduledAt('')
    setJustification('')
    setSearchedMeter(meter)

    try {
      const response = await api.listMeterSchedules(undefined, { meter })
      setSchedules(response.schedules)
      if (response.schedules.length === 0) {
        setFeedback({
          type: 'error',
          message: `Nenhum agendamento encontrado para o medidor ${meter}.`,
        })
      } else {
        const first = response.schedules[0]
        setSelectedId(first.id)
        setNewScheduledAt(toDatetimeLocalValue(first.scheduledAt))
      }
      await loadHistory(meter)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível pesquisar o medidor.',
      })
    } finally {
      setSearching(false)
    }
  }

  const handleSelectSchedule = (schedule: MeterScheduleRecord) => {
    setSelectedId(schedule.id)
    setNewScheduledAt(toDatetimeLocalValue(schedule.scheduledAt))
    setJustification('')
    setFeedback(null)
  }

  const handleReschedule = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return

    if (!newScheduledAt) {
      setFeedback({ type: 'error', message: 'Informe a nova data de ensaio.' })
      return
    }

    const trimmedJustification = justification.trim()
    if (trimmedJustification.length < 5) {
      setFeedback({
        type: 'error',
        message: 'Informe a justificativa (mínimo 5 caracteres).',
      })
      return
    }

    const nextDate = new Date(newScheduledAt)
    if (Number.isNaN(nextDate.getTime())) {
      setFeedback({ type: 'error', message: 'Data de ensaio inválida.' })
      return
    }

    setSaving(true)
    setFeedback(null)
    try {
      const { schedule } = await api.rescheduleMeterSchedule(selected.id, {
        scheduledAt: nextDate.toISOString(),
        justification: trimmedJustification,
      })
      setSchedules((current) =>
        current.map((item) => (item.id === schedule.id ? schedule : item)),
      )
      setNewScheduledAt(toDatetimeLocalValue(schedule.scheduledAt))
      setJustification('')
      setFeedback({
        type: 'success',
        message: `Medidor ${schedule.meter} reagendado para ${schedule.scheduledAtLabel}.`,
      })
      await loadHistory(schedule.meter)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível reagendar o ensaio.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="reagendar-panel">
      <p className="reagendar-intro">
        Pesquise o medidor, altere a data de ensaio e registre a justificativa. Todas as
        alterações ficam no histórico do medidor com o responsável pela mudança.
      </p>

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      <form className="reagendar-search" onSubmit={(event) => void handleSearch(event)}>
        <label>
          Medidor
          <input
            type="text"
            inputMode="numeric"
            value={meterQuery}
            onChange={(event) =>
              setMeterQuery(sanitizeNumericInput(event.target.value, NUMERIC_FIELD_LIMITS.medidor))
            }
            placeholder="Número do medidor"
            maxLength={NUMERIC_FIELD_LIMITS.medidor}
            disabled={searching}
            required
          />
        </label>
        <button type="submit" className="primary-button" disabled={searching}>
          {searching ? 'Pesquisando…' : 'Pesquisar'}
        </button>
      </form>

      {schedules.length > 0 ? (
        <div className="reagendar-results">
          <div className="entrada-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Selecionar</th>
                  <th>Medidor</th>
                  <th>Instalação</th>
                  <th>TOI</th>
                  <th>CSD</th>
                  <th>Etapa</th>
                  <th>Data atual</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((schedule) => (
                  <tr
                    key={schedule.id}
                    className={schedule.id === selectedId ? 'reagendar-row-selected' : undefined}
                  >
                    <td>
                      <input
                        type="radio"
                        name="reagendar-schedule"
                        checked={schedule.id === selectedId}
                        onChange={() => handleSelectSchedule(schedule)}
                        aria-label={`Selecionar agendamento do medidor ${schedule.meter}`}
                      />
                    </td>
                    <td>{schedule.meter}</td>
                    <td>{schedule.installation || '—'}</td>
                    <td>{schedule.toi || '—'}</td>
                    <td>{schedule.csd || '—'}</td>
                    <td>{schedule.trailStep || '—'}</td>
                    <td>{schedule.scheduledAtLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && !readOnly ? (
            <form
              className="material-form-grid apresentacao-form reagendar-form"
              onSubmit={(event) => void handleReschedule(event)}
            >
              <label>
                Nova data de ensaio
                <input
                  type="datetime-local"
                  value={newScheduledAt}
                  onChange={(event) => setNewScheduledAt(event.target.value)}
                  required
                  disabled={saving}
                />
              </label>
              <label className="full-width">
                Justificativa
                <textarea
                  value={justification}
                  onChange={(event) => setJustification(event.target.value)}
                  rows={3}
                  placeholder="Descreva o motivo do reagendamento"
                  required
                  minLength={5}
                  disabled={saving}
                />
              </label>
              <div className="agenda-form-actions full-width">
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar reagendamento'}
                </button>
              </div>
            </form>
          ) : null}

          {readOnly ? (
            <p className="field-hint">Modo visualização: alterações de data não estão disponíveis.</p>
          ) : null}
        </div>
      ) : null}

      {searchedMeter ? (
        <section className="reagendar-history" aria-label="Histórico do medidor">
          <h3>Histórico do medidor {searchedMeter}</h3>
          {loadingHistory ? (
            <p className="entrada-panel-empty">Carregando histórico...</p>
          ) : history.length === 0 ? (
            <p className="entrada-panel-empty">Nenhuma alteração registrada para este medidor.</p>
          ) : (
            <div className="entrada-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Responsável</th>
                    <th>Ação</th>
                    <th>Resumo</th>
                    <th>Justificativa</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatAuditDate(entry.occurredAt)}</td>
                      <td>{formatActor(entry)}</td>
                      <td>
                        <span className={`audit-action audit-action-${entry.action}`}>
                          {formatAuditAction(entry.action)}
                        </span>
                      </td>
                      <td>{entry.summary ?? '—'}</td>
                      <td>{entry.justification || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
