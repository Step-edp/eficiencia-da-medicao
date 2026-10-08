import { FormEvent, useCallback, useState } from 'react'
import {
  api,
  ApiError,
  type MeterRegistryRecord,
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
import { isAllowedScheduleSlot } from './availableScheduleSlots'

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

function isRescheduleBlocked(status: string, trailStep: string) {
  const normalizedStatus = status.trim()
  const trail = trailStep.trim()
  if (normalizedStatus === 'Ensaiado' || normalizedStatus === 'Aprovado') return true
  return trail === 'Aprovação de RATM' || trail === 'Sucata' || trail === 'Pesquisa de satisfação'
}

function reagendarStatusLabel(status: string, trailStep: string) {
  if (status === 'Aprovado' || trailStep === 'Sucata') return 'Aprovado'
  if (status === 'Ensaiado' || trailStep === 'Aprovação de RATM' || trailStep === 'Pesquisa de satisfação') {
    return 'Ensaiado'
  }
  if (status === 'Recebido' || trailStep === 'Ensaiar') return 'Recebido'
  if (status.trim()) return status
  if (trailStep === 'Entrada de medidores' || !trailStep) return 'Agendado'
  return trailStep
}

export function ReagendarPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [meterQuery, setMeterQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [schedules, setSchedules] = useState<MeterScheduleRecord[]>([])
  const [registry, setRegistry] = useState<MeterRegistryRecord | null>(null)
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
  const statusSource = registry
    ? { status: registry.status, trailStep: registry.trailStep }
    : selected
      ? { status: selected.registryStatus ?? '', trailStep: selected.trailStep }
      : null
  const blocked = statusSource
    ? isRescheduleBlocked(statusSource.status, statusSource.trailStep)
    : false
  const blockedLabel = statusSource
    ? reagendarStatusLabel(statusSource.status, statusSource.trailStep)
    : ''

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
    setRegistry(null)
    setSelectedId(null)
    setHistory([])
    setNewScheduledAt('')
    setJustification('')
    setSearchedMeter(meter)

    try {
      const [response, base] = await Promise.all([
        api.listMeterSchedules(undefined, { meter }),
        api.getMeterRegistry(meter),
      ])
      setSchedules(response.schedules)
      setRegistry(base.registry)
      if (!base.registry && response.schedules.length === 0) {
        setFeedback({
          type: 'error',
          message: `Medidor ${meter} não encontrado na base de medidores.`,
        })
      } else {
        const source = base.registry
          ? { status: base.registry.status, trailStep: base.registry.trailStep }
          : {
              status: response.schedules[0]?.registryStatus ?? '',
              trailStep: response.schedules[0]?.trailStep ?? '',
            }
        if (isRescheduleBlocked(source.status, source.trailStep)) {
          setFeedback({
            type: 'error',
            message: `O medidor ${meter} já está ${reagendarStatusLabel(source.status, source.trailStep).toLocaleLowerCase('pt-BR')}. Não é possível reagendar a data de ensaio.`,
          })
        }
        if (response.schedules.length > 0) {
          const first = response.schedules[0]
          setSelectedId(first.id)
          setNewScheduledAt(toDatetimeLocalValue(first.scheduledAt))
        } else if (base.registry?.scheduledAt) {
          setNewScheduledAt(toDatetimeLocalValue(base.registry.scheduledAt))
        }
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
    if (!selected || blocked) return

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
    if (!isAllowedScheduleSlot(nextDate)) {
      setFeedback({
        type: 'error',
        message:
          'O horário de ensaio deve estar entre 08:30 e 11:30 ou entre 14:00 e 16:30, de 10 em 10 minutos.',
      })
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
        Pesquise o medidor na base de medidores e altere a data de ensaio. Medidor ensaiado,
        aprovado ou em etapa posterior não pode ser reagendado. A mudança fica registrada
        com quem a fez.
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

      {schedules.length > 0 || registry ? (
        <div className="reagendar-results">
          <div className="entrada-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {schedules.length > 1 ? <th>Selecionar</th> : null}
                  <th>Medidor</th>
                  <th>Instalação</th>
                  <th>TOI</th>
                  <th>CSD</th>
                  <th>Status</th>
                  <th>Data de ensaio</th>
                </tr>
              </thead>
              <tbody>
                {schedules.length > 0
                  ? schedules.map((schedule) => (
                      <tr
                        key={schedule.id}
                        className={schedule.id === selectedId ? 'reagendar-row-selected' : undefined}
                      >
                        {schedules.length > 1 ? (
                          <td>
                            <input
                              type="radio"
                              name="reagendar-schedule"
                              checked={schedule.id === selectedId}
                              onChange={() => handleSelectSchedule(schedule)}
                              aria-label={`Selecionar agendamento do medidor ${schedule.meter}`}
                            />
                          </td>
                        ) : null}
                        <td>{schedule.meter}</td>
                        <td>{schedule.installation || registry?.installation || '—'}</td>
                        <td>{schedule.toi || registry?.toi || '—'}</td>
                        <td>{schedule.csd || registry?.csd || '—'}</td>
                        <td>
                          {reagendarStatusLabel(
                            registry?.status || schedule.registryStatus || '',
                            registry?.trailStep || schedule.trailStep,
                          )}
                        </td>
                        <td>{schedule.scheduledAtLabel}</td>
                      </tr>
                    ))
                  : registry ? (
                      <tr>
                        <td>{registry.meter}</td>
                        <td>{registry.installation || '—'}</td>
                        <td>{registry.toi || '—'}</td>
                        <td>{registry.csd || '—'}</td>
                        <td>{reagendarStatusLabel(registry.status, registry.trailStep)}</td>
                        <td>
                          {registry.scheduledAt
                            ? new Date(registry.scheduledAt).toLocaleString('pt-BR')
                            : '—'}
                        </td>
                      </tr>
                    ) : null}
              </tbody>
            </table>
          </div>

          {blocked ? (
            <p className="field-hint">
              Medidor {blockedLabel.toLocaleLowerCase('pt-BR')}. A data de ensaio não pode ser
              alterada a partir deste status.
            </p>
          ) : selected && !readOnly ? (
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
