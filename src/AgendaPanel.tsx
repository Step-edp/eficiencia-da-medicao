import { FormEvent, useEffect, useState } from 'react'
import { api, type VacationPeriod, type VacationStatus } from './api'

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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void api
      .getVacationAgenda()
      .then((response) => {
        if (cancelled) return
        setPeriods(response.periods)
        setStatus(response.vacationStatus)
        setDeadlineAt(response.vacationDeadlineAt)
        if (response.nextVacation) {
          setStartDate(response.nextVacation.startDate)
          setEndDate(response.nextVacation.endDate)
        }
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

  const handleSubmit = async (event: FormEvent) => {
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
      setPeriods(response.periods)
      setStatus(response.vacationStatus)
      setDeadlineAt(response.vacationDeadlineAt)
      setSuccess('Período de férias registrado com sucesso.')
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o período.')
    } finally {
      setSaving(false)
    }
  }

  const deadlineLabel = formatDeadline(deadlineAt)
  const displayStatus = locked ? 'bloqueado' : status

  return (
    <div className="agenda-panel">
      <p>
        Todo usuário deve registrar o próximo período de férias. Sem esse registro, o status fica
        pendente. Se não registrar em até 7 dias, o perfil é bloqueado até a atualização.
      </p>

      {displayStatus === 'bloqueado' ? (
        <div className="agenda-alert agenda-alert-blocked" role="alert">
          <strong>Perfil bloqueado.</strong> O prazo de 7 dias para registrar o próximo período de
          férias expirou. Você só pode usar a Agenda até concluir o registro.
          {deadlineLabel ? ` Prazo encerrou em ${deadlineLabel}.` : null}
        </div>
      ) : null}

      {displayStatus === 'em_ferias' ? (
        <div className="agenda-alert agenda-alert-blocked" role="alert">
          <strong>Bloqueado devido a férias.</strong>
          {startDate && endDate
            ? ` Período atual: ${formatDateBr(startDate)} a ${formatDateBr(endDate)}.`
            : null}{' '}
          As atividades ficam com o substituto cadastrado na liderança da área/célula.
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
          <form className="gestao-create-cell-form agenda-form" onSubmit={handleSubmit}>
            <label>
              Início das férias
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
                disabled={saving}
              />
            </label>
            <label>
              Fim das férias
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
                disabled={saving}
                min={startDate || undefined}
              />
            </label>
            {error ? (
              <p className="gestao-create-cell-error" role="alert">
                {error}
              </p>
            ) : null}
            {success ? <p className="agenda-success">{success}</p> : null}
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar período de férias'}
            </button>
          </form>

          <div className="users-dashboard-card" style={{ marginTop: 18 }}>
            <h3>Histórico registrado</h3>
            {periods.length ? (
              <ul className="agenda-period-list">
                {periods.map((period) => (
                  <li key={period.id}>
                    <strong>
                      {formatDateBr(period.startDate)} — {formatDateBr(period.endDate)}
                    </strong>
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
