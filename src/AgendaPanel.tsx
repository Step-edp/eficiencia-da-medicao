import { FormEvent, useEffect, useId, useState } from 'react'
import {
  api,
  type AbsenceType,
  type VacationPeriod,
  type VacationStatus,
} from './api'
import { AgendaCalendar, nextVacationRangeFromClick } from './AgendaCalendar'
import { readAttachmentAsDataUrl } from './readAttachmentAsDataUrl'

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
  const [justification, setJustification] = useState('')
  const [attachment, setAttachment] = useState('')
  const [attachmentName, setAttachmentName] = useState('')
  const [absenceStart, setAbsenceStart] = useState('')
  const [absenceEnd, setAbsenceEnd] = useState('')
  const attachmentInputId = useId()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingAbsence, setSavingAbsence] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [absenceError, setAbsenceError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showVacationForm, setShowVacationForm] = useState(false)
  const [showAbsenceForm, setShowAbsenceForm] = useState(false)
  const [dismissedOkAlert, setDismissedOkAlert] = useState(false)

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
    setDismissedOkAlert(false)
  }, [status, startDate, endDate])

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
    if (!justification.trim()) {
      setAbsenceError('Informe a justificativa da ausência.')
      return
    }
    if (!attachment.trim()) {
      setAbsenceError('Anexe um documento ou foto da ausência.')
      return
    }
    setSavingAbsence(true)
    try {
      const response = await api.createAbsencePeriod({
        startDate: absenceStart,
        endDate: absenceEnd,
        absenceType,
        justification: justification.trim(),
        attachment,
        attachmentName: attachmentName || 'anexo',
      })
      applyAgenda(response)
      setAbsenceStart('')
      setAbsenceEnd('')
      setJustification('')
      setAttachment('')
      setAttachmentName('')
      setSuccess('Período de ausência registrado. O substituto cobrirá as atividades se estiver ativo.')
      setShowAbsenceForm(false)
      await onSaved()
    } catch (err) {
      setAbsenceError(err instanceof Error ? err.message : 'Não foi possível salvar a ausência.')
    } finally {
      setSavingAbsence(false)
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

      {displayStatus === 'ok' && !dismissedOkAlert ? (
        <div className="agenda-alert agenda-alert-ok has-dismiss" role="status">
          <span className="agenda-alert-message">
            <strong>Em dia.</strong>
            {startDate && endDate
              ? ` Próximas férias: ${formatDateBr(startDate)} a ${formatDateBr(endDate)}.`
              : ' Próximo período de férias registrado.'}
          </span>
          <button
            type="button"
            className="notice-dismiss"
            aria-label="Fechar aviso"
            onClick={() => setDismissedOkAlert(true)}
          >
            ×
          </button>
        </div>
      ) : null}

      {loading ? (
        <p>Carregando agenda...</p>
      ) : (
        <>
          <section className="agenda-calendar-section" aria-label="Calendário">
            <div className="agenda-calendar-actions">
              <button
                type="button"
                className={`agenda-quiet-button${showVacationForm ? ' is-active' : ''}`}
                disabled={locked || displayStatus === 'em_ausencia'}
                onClick={() => {
                  setShowVacationForm(true)
                  setShowAbsenceForm(false)
                  setError(null)
                }}
              >
                Registrar férias
              </button>
              <button
                type="button"
                className={`agenda-quiet-button${showAbsenceForm ? ' is-active' : ''}`}
                disabled={locked || displayStatus === 'em_ausencia'}
                onClick={() => {
                  setShowAbsenceForm(true)
                  setShowVacationForm(false)
                  setAbsenceError(null)
                }}
              >
                Registrar ausência
              </button>
            </div>
            <AgendaCalendar
              periods={periods}
              vacationStart={startDate}
              vacationEnd={endDate}
              interactive={
                showVacationForm && !saving && !locked && displayStatus !== 'em_ausencia'
              }
              onSelectDate={
                showVacationForm
                  ? (isoDate) => {
                      const next = nextVacationRangeFromClick(isoDate, startDate, endDate)
                      setStartDate(next.startDate)
                      setEndDate(next.endDate)
                      setError(null)
                    }
                  : undefined
              }
            />
          </section>

          {showVacationForm ? (
            <div className="users-dashboard-card" style={{ marginTop: 18 }}>
              <h3>Próximas férias (obrigatório)</h3>
              <p className="users-dashboard-ranking-hint">
                Use o calendário acima ou os campos abaixo para definir o período.
              </p>
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
          ) : null}

          {showAbsenceForm ? (
            <div className="users-dashboard-card" style={{ marginTop: 18 }}>
              <h3>Outros períodos de ausência</h3>
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
                  Justificativa
                  <textarea
                    value={justification}
                    onChange={(event) => setJustification(event.target.value)}
                    placeholder="Descreva o motivo da ausência"
                    rows={3}
                    required
                    disabled={savingAbsence || locked || displayStatus === 'em_ausencia'}
                  />
                </label>
                <div className="full-width">
                  <span className="agenda-attachment-label">Documento ou foto</span>
                  <div className="file-picker">
                    <input
                      id={attachmentInputId}
                      className="file-picker-input"
                      type="file"
                      accept="image/*,application/pdf"
                      required={!attachment}
                      disabled={savingAbsence || locked || displayStatus === 'em_ausencia'}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) {
                          setAttachment('')
                          setAttachmentName('')
                          return
                        }
                        void readAttachmentAsDataUrl(file)
                          .then((dataUrl) => {
                            setAttachment(dataUrl)
                            setAttachmentName(file.name)
                            setAbsenceError(null)
                          })
                          .catch((error: unknown) => {
                            setAttachment('')
                            setAttachmentName('')
                            event.target.value = ''
                            setAbsenceError(
                              error instanceof Error
                                ? error.message
                                : 'Não foi possível carregar o arquivo.',
                            )
                          })
                      }}
                    />
                    <label htmlFor={attachmentInputId} className="file-picker-button">
                      Anexar arquivo
                    </label>
                    <span className="file-picker-name">
                      {attachmentName || 'Nenhum arquivo selecionado'}
                    </span>
                  </div>
                  {attachment.startsWith('data:image/') ? (
                    <span className="envelope-photo-preview">
                      <img src={attachment} alt="Pré-visualização do anexo" />
                    </span>
                  ) : null}
                </div>
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
            </div>
          ) : null}

          {success ? (
            <div className="agenda-success has-dismiss" role="status">
              <span>{success}</span>
              <button
                type="button"
                className="notice-dismiss"
                aria-label="Fechar aviso"
                onClick={() => setSuccess(null)}
              >
                ×
              </button>
            </div>
          ) : null}

          <div className="users-dashboard-card" style={{ marginTop: 18 }}>
            <h3>Histórico registrado</h3>
            {periods.length ? (
              <ul className="agenda-period-list">
                {periods.map((period) => (
                  <li key={period.id} className="agenda-period-item">
                    <div className="agenda-period-details">
                      <span>
                        <strong>{periodLabel(period)}</strong>
                        {`: ${formatDateBr(period.startDate)} — ${formatDateBr(period.endDate)}`}
                      </span>
                      {period.justification ? (
                        <span className="agenda-period-justification">
                          Justificativa: {period.justification}
                        </span>
                      ) : null}
                      {period.attachment ? (
                        <a
                          className="link-button"
                          href={period.attachment}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {period.attachmentName || 'Ver anexo'}
                        </a>
                      ) : null}
                    </div>
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
