import { FormEvent, useEffect, useState } from 'react'
import {
  api,
  type AbsenceType,
  type VacationPeriod,
  type VacationStatus,
} from './api'
import { AgendaCalendar, nextVacationRangeFromClick } from './AgendaCalendar'

const OTHER_ABSENCE_OPTIONS: Array<{ value: AbsenceType; label: string }> = [
  { value: 'licenca', label: 'Licença' },
  { value: 'afastamento', label: 'Afastamento' },
  { value: 'atestado', label: 'Atestado médico' },
  { value: 'treinamento', label: 'Treinamento' },
  { value: 'outro', label: 'Outra ausência' },
]

function formatDateBr(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split('-')
  if (!year || !month || !day) return isoDate
  return `${day}/${month}/${year}`
}

function formatDeadline(iso: string | null | undefined) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function periodLabel(period: VacationPeriod) {
  return period.absenceTypeLabel || (period.absenceType === 'ferias' ? 'Férias' : 'Ausência')
}

type AgendaPanelProps = {
  vacationStatus?: VacationStatus
  vacationDeadlineAt?: string | null
  nextVacationStart?: string | null
  nextVacationEnd?: string | null
  locked?: boolean
  onSaved: () => Promise<void> | void
}

export function AgendaPanel({
  vacationStatus,
  vacationDeadlineAt,
  nextVacationStart,
  nextVacationEnd,
  locked = false,
  onSaved,
}: AgendaPanelProps) {
  const [periods, setPeriods] = useState<VacationPeriod[]>([])
  const [status, setStatus] = useState<VacationStatus>(vacationStatus ?? 'pendente')
  const [deadlineAt, setDeadlineAt] = useState<string | null>(vacationDeadlineAt ?? null)
  const [startDate, setStartDate] = useState(nextVacationStart ?? '')
  const [endDate, setEndDate] = useState(nextVacationEnd ?? '')
  const [absenceType, setAbsenceType] = useState<AbsenceType>('licenca')
  const [absenceStart, setAbsenceStart] = useState('')
  const [absenceEnd, setAbsenceEnd] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingAbsence, setSavingAbsence] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [absenceError, setAbsenceError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showVacationForm, setShowVacationForm] = useState(false)
  const [showAbsenceForm, setShowAbsenceForm] = useState(false)

  const applyAgenda = (response: {
    periods: VacationPeriod[]
    vacationStatus: VacationStatus
    vacationDeadlineAt: string | null
    nextVacation: VacationPeriod | null
  }) => {
    setPeriods(response.periods)
    setStatus(response.vacationStatus)
    setDeadlineAt(response.vacationDeadlineAt)
    if (response.nextVacation) {
      setStartDate(response.nextVacation.startDate)
      setEndDate(response.nextVacation.endDate)
    }
  }

  useEffect(() => {
    let cancelled = false
    void api
      .getVacationAgenda()
      .then((response) => {
        if (cancelled) return
        applyAgenda(response)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Não foi possível carregar a agenda.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmitVacation = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    if (!startDate || !endDate) {
      setError('Informe o início e o fim do próximo período de férias.')
      return
    }
    if (endDate < startDate) {
      setError('A data de fim deve ser igual ou posterior ao início.')
      return
    }
    setSaving(true)
    try {
      const response = await api.saveVacationPeriod({ startDate, endDate })
      applyAgenda(response)
      setSuccess('Período de férias registrado com sucesso.')
      setShowVacationForm(false)
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o período.')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitAbsence = async (event: FormEvent) => {
    event.preventDefault()
    setAbsenceError(null)
    setSuccess(null)
    if (!absenceStart || !absenceEnd) {
      setAbsenceError('Informe o início e o fim da ausência.')
      return
    }
    if (absenceEnd < absenceStart) {
      setAbsenceError('A data de fim deve ser igual ou posterior ao início.')
      return
    }
    setSavingAbsence(true)
    try {
      const response = await api.createAbsencePeriod({
        startDate: absenceStart,
        endDate: absenceEnd,
        absenceType,
      })
      applyAgenda(response)
      setAbsenceStart('')
      setAbsenceEnd('')
      setSuccess('Período de ausência registrado. O substituto cobrirá as atividades se estiver ativo.')
      setShowAbsenceForm(false)
      await onSaved()
    } catch (err) {
      setAbsenceError(err instanceof Error ? err.message : 'Não foi possível salvar a ausência.')
    } finally {
      setSavingAbsence(false)
    }
  }

  const handleDelete = async (id: number) => {
    setAbsenceError(null)
    setSuccess(null)
    try {
      const response = await api.deleteAbsencePeriod(id)
      applyAgenda(response)
      setSuccess('Período removido.')
      await onSaved()
    } catch (err) {
      setAbsenceError(err instanceof Error ? err.message : 'Não foi possível remover o período.')
    }
  }

  const deadlineLabel = formatDeadline(deadlineAt)
  const displayStatus =
    locked
      ? 'bloqueado'
      : status === 'em_ferias'
        ? 'em_ausencia'
        : status

  return (
    <div className="agenda-panel">
      {displayStatus === 'bloqueado' ? (
        <div className="agenda-alert agenda-alert-blocked" role="alert">
          <strong>Perfil bloqueado.</strong> O prazo de 7 dias para registrar o próximo período de
          férias expirou. Você só pode usar a Agenda até concluir o registro.
          {deadlineLabel ? ` Prazo encerrou em ${deadlineLabel}.` : null}
        </div>
      ) : null}

      {displayStatus === 'em_ausencia' ? (
        <div className="agenda-alert agenda-alert-blocked" role="alert">
          <strong>Bloqueado por ausência.</strong> Durante o período ativo, as atividades ficam
          com o substituto cadastrado na liderança da área/célula.
        </div>
      ) : null}

      {displayStatus === 'pendente' ? (
        <div className="agenda-alert agenda-alert-pending" role="status">
          <strong>Férias pendentes.</strong> Registre o próximo período de férias
          {deadlineLabel ? ` até ${deadlineLabel}` : ' nos próximos 7 dias'} para evitar o bloqueio
          do perfil.
        </div>
      ) : null}

      {displayStatus === 'ok' ? (
        <div className="agenda-alert agenda-alert-ok" role="status">
          <strong>Em dia.</strong>
          {startDate && endDate
            ? ` Próximas férias: ${formatDateBr(startDate)} a ${formatDateBr(endDate)}.`
            : ' Próximo período de férias registrado.'}
        </div>
      ) : null}

      {loading ? (
        <p>Carregando agenda...</p>
      ) : (
        <>
          <div className="users-dashboard-card">
            <h3>Próximas férias (obrigatório)</h3>
            {!showVacationForm ? (
              <button
                type="button"
                className="primary-button"
                disabled={locked || displayStatus === 'em_ausencia'}
                onClick={() => {
                  setShowVacationForm(true)
                  setShowAbsenceForm(false)
                  setError(null)
                }}
              >
                Registrar férias
              </button>
            ) : (
              <>
                <p className="users-dashboard-ranking-hint">
                  O período de férias aparece destacado no calendário. Você pode marcar as datas
                  clicando nos dias ou usando os campos abaixo.
                </p>
                <div className="agenda-vacation-layout">
                  <AgendaCalendar
                    periods={periods}
                    vacationStart={startDate}
                    vacationEnd={endDate}
                    interactive={!saving && !locked && displayStatus !== 'em_ausencia'}
                    onSelectDate={(isoDate) => {
                      const next = nextVacationRangeFromClick(isoDate, startDate, endDate)
                      setStartDate(next.startDate)
                      setEndDate(next.endDate)
                      setError(null)
                    }}
                  />
                  <form className="gestao-create-cell-form agenda-form" onSubmit={handleSubmitVacation}>
                    <label>
                      Início das férias
                      <input
                        type="date"
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                        required
                        disabled={saving || locked || displayStatus === 'em_ausencia'}
                      />
                    </label>
                    <label>
                      Fim das férias
                      <input
                        type="date"
                        value={endDate}
                        onChange={(event) => setEndDate(event.target.value)}
                        required
                        disabled={saving || locked || displayStatus === 'em_ausencia'}
                        min={startDate || undefined}
                      />
                    </label>
                    {error ? (
                      <p className="gestao-create-cell-error" role="alert">
                        {error}
                      </p>
                    ) : null}
                    <div className="agenda-form-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={saving}
                        onClick={() => {
                          setShowVacationForm(false)
                          setError(null)
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="primary-button"
                        disabled={saving || locked || displayStatus === 'em_ausencia'}
                      >
                        {saving ? 'Salvando…' : 'Salvar período de férias'}
                      </button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </div>

          <div className="users-dashboard-card" style={{ marginTop: 18 }}>
            <h3>Outros períodos de ausência</h3>
            {!showAbsenceForm ? (
              <button
                type="button"
                className="primary-button"
                disabled={locked || displayStatus === 'em_ausencia'}
                onClick={() => {
                  setShowAbsenceForm(true)
                  setShowVacationForm(false)
                  setAbsenceError(null)
                }}
              >
                Registrar ausência
              </button>
            ) : (
              <>
                <p className="users-dashboard-ranking-hint">
                  Licença, atestado, treinamento e demais ausências também acionam o substituto.
                </p>
                <form className="gestao-create-cell-form agenda-form" onSubmit={handleSubmitAbsence}>
                  <label>
                    Tipo de ausência
                    <select
                      value={absenceType}
                      onChange={(event) => setAbsenceType(event.target.value as AbsenceType)}
                      disabled={savingAbsence || locked || displayStatus === 'em_ausencia'}
                    >
                      {OTHER_ABSENCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Início
                    <input
                      type="date"
                      value={absenceStart}
                      onChange={(event) => setAbsenceStart(event.target.value)}
                      required
                      disabled={savingAbsence || locked || displayStatus === 'em_ausencia'}
                    />
                  </label>
                  <label>
                    Fim
                    <input
                      type="date"
                      value={absenceEnd}
                      onChange={(event) => setAbsenceEnd(event.target.value)}
                      required
                      disabled={savingAbsence || locked || displayStatus === 'em_ausencia'}
                      min={absenceStart || undefined}
                    />
                  </label>
                  {absenceError ? (
                    <p className="gestao-create-cell-error" role="alert">
                      {absenceError}
                    </p>
                  ) : null}
                  <div className="agenda-form-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={savingAbsence}
                      onClick={() => {
                        setShowAbsenceForm(false)
                        setAbsenceError(null)
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={savingAbsence || locked || displayStatus === 'em_ausencia'}
                    >
                      {savingAbsence ? 'Salvando…' : 'Salvar ausência'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>

          {success ? <p className="agenda-success">{success}</p> : null}

          <div className="users-dashboard-card" style={{ marginTop: 18 }}>
            <h3>Histórico registrado</h3>
            {periods.length ? (
              <ul className="agenda-period-list">
                {periods.map((period) => (
                  <li key={period.id} className="agenda-period-item">
                    <span>
                      <strong>{periodLabel(period)}</strong>
                      {`: ${formatDateBr(period.startDate)} — ${formatDateBr(period.endDate)}`}
                    </span>
                    {!locked && displayStatus !== 'em_ausencia' ? (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => void handleDelete(period.id)}
                      >
                        Remover
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="generated-password-empty">Nenhum período cadastrado ainda.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
