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

export type AgendaView = 'overview' | 'ferias' | 'ausencia' | 'historico'

export function agendaViewTitle(
  view: AgendaView,
  options?: { hasRegisteredVacation?: boolean },
): string {
  if (view === 'ferias') {
    return options?.hasRegisteredVacation ? 'Editar férias' : 'Registrar férias'
  }
  if (view === 'ausencia') return 'Registrar ausência'
  if (view === 'historico') return 'Histórico registrado'
  return 'Agenda'
}

type AgendaPanelProps = {
  vacationStatus?: VacationStatus
  vacationDeadlineAt?: string | null
  nextVacationStart?: string | null
  nextVacationEnd?: string | null
  locked?: boolean
  view: AgendaView
  onViewChange: (view: AgendaView) => void
  onSaved: () => Promise<void> | void
}

export function AgendaPanel({
  vacationStatus,
  vacationDeadlineAt,
  nextVacationStart,
  nextVacationEnd,
  locked = false,
  view,
  onViewChange,
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
  const [dismissedOkAlert, setDismissedOkAlert] = useState(false)
  const [vacationDraftStart, setVacationDraftStart] = useState(nextVacationStart ?? '')
  const [vacationDraftEnd, setVacationDraftEnd] = useState(nextVacationEnd ?? '')
  const [editingExistingVacation, setEditingExistingVacation] = useState(false)

  const todayIso = new Date().toISOString().slice(0, 10)
  const hasRegisteredVacation =
    Boolean(vacationDraftStart && vacationDraftEnd) ||
    periods.some(
      (period) =>
        (period.absenceType ?? 'ferias') === 'ferias' && period.endDate >= todayIso,
    )

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
      setVacationDraftStart(response.nextVacation.startDate)
      setVacationDraftEnd(response.nextVacation.endDate)
    } else {
      setStartDate('')
      setEndDate('')
      setVacationDraftStart('')
      setVacationDraftEnd('')
    }
  }

  const openVacationForm = (period?: { startDate: string; endDate: string } | null) => {
    const nextStart = period?.startDate ?? startDate
    const nextEnd = period?.endDate ?? endDate
    setVacationDraftStart(nextStart)
    setVacationDraftEnd(nextEnd)
    setStartDate(nextStart)
    setEndDate(nextEnd)
    setEditingExistingVacation(Boolean(nextStart && nextEnd))
    setError(null)
    setSuccess(null)
    onViewChange('ferias')
  }

  const closeVacationForm = () => {
    setStartDate(vacationDraftStart)
    setEndDate(vacationDraftEnd)
    setEditingExistingVacation(false)
    setError(null)
    onViewChange('overview')
  }

  const openAbsenceForm = () => {
    setAbsenceError(null)
    setSuccess(null)
    onViewChange('ausencia')
  }

  const closeAbsenceForm = () => {
    setAbsenceError(null)
    onViewChange('overview')
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
      setSuccess(
        editingExistingVacation
          ? 'Período de férias atualizado com sucesso.'
          : 'Período de férias registrado com sucesso.',
      )
      setEditingExistingVacation(false)
      onViewChange('overview')
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
      onViewChange('overview')
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
      ) : view === 'overview' ? (
        <>
          <section className="agenda-calendar-section" aria-label="Calendário">
            <div className="agenda-calendar-actions" role="group" aria-label="Ações da agenda">
              <button
                type="button"
                className="agenda-action-chip"
                disabled={locked || displayStatus === 'em_ausencia'}
                title={
                  hasRegisteredVacation
                    ? startDate && endDate
                      ? `${formatDateBr(startDate)} a ${formatDateBr(endDate)}`
                      : 'Alterar período registrado'
                    : 'Período obrigatório'
                }
                onClick={() => openVacationForm()}
              >
                <span className="agenda-action-chip-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                    <rect
                      x="3"
                      y="5"
                      width="18"
                      height="16"
                      rx="2.5"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    />
                    <path
                      d="M3 10h18M8 3v4M16 3v4"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="agenda-action-chip-text">
                  <span className="agenda-action-chip-title">
                    {hasRegisteredVacation ? 'Editar férias' : 'Registrar férias'}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="agenda-action-chip"
                disabled={locked || displayStatus === 'em_ausencia'}
                title="Licença, atestado e outros"
                onClick={openAbsenceForm}
              >
                <span className="agenda-action-chip-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                    <path
                      d="M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2Z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="agenda-action-chip-text">
                  <span className="agenda-action-chip-title">Registrar ausência</span>
                </span>
              </button>
              <button
                type="button"
                className="agenda-action-chip"
                title={
                  periods.length
                    ? `${periods.length} período${periods.length > 1 ? 's' : ''}`
                    : 'Nenhum período ainda'
                }
                onClick={() => {
                  setSuccess(null)
                  onViewChange('historico')
                }}
              >
                <span className="agenda-action-chip-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                    <path
                      d="M12 8v5l3 2"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="8.5"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    />
                  </svg>
                </span>
                <span className="agenda-action-chip-text">
                  <span className="agenda-action-chip-title">Histórico registrado</span>
                </span>
              </button>
            </div>

            <AgendaCalendar
              periods={periods}
              vacationStart={startDate}
              vacationEnd={endDate}
              interactive={false}
            />
          </section>

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
        </>
      ) : view === 'ferias' ? (
        <section className="agenda-dedicated-screen" aria-label="Registrar férias">
          <p className="entrada-panel-intro">
            Selecione o período no calendário ou preencha as datas abaixo.
          </p>
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
                onClick={closeVacationForm}
              >
                Voltar
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={saving || locked || displayStatus === 'em_ausencia'}
              >
                {saving
                  ? 'Salvando…'
                  : editingExistingVacation
                    ? 'Salvar alterações'
                    : 'Salvar período de férias'}
              </button>
            </div>
          </form>
        </section>
      ) : view === 'ausencia' ? (
        <section className="agenda-dedicated-screen" aria-label="Registrar ausência">
          <p className="entrada-panel-intro">
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
                onClick={closeAbsenceForm}
              >
                Voltar
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
        </section>
      ) : (
        <section className="agenda-dedicated-screen" aria-label="Histórico registrado">
          <div className="agenda-history-panel agenda-history-panel-dedicated">
            {periods.length ? (
              <ul className="agenda-period-list">
                {periods.map((period) => {
                  const canEditVacation =
                    !locked &&
                    displayStatus !== 'em_ausencia' &&
                    (period.absenceType ?? 'ferias') === 'ferias' &&
                    period.endDate >= todayIso

                  return (
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
                      {canEditVacation ? (
                        <button
                          type="button"
                          className="secondary-button compact-button"
                          onClick={() =>
                            openVacationForm({
                              startDate: period.startDate,
                              endDate: period.endDate,
                            })
                          }
                        >
                          Editar
                        </button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="generated-password-empty">Nenhum período cadastrado ainda.</p>
            )}
          </div>
          <div className="agenda-form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => onViewChange('overview')}
            >
              Voltar
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
