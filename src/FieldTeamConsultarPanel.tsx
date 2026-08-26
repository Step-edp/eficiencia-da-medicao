import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, type MeterInspectionSummary, type MeterScheduleRecord } from './api'
import { FormFieldError } from './FormFieldError'
import { inspectionPdfFilesFromList, readFileAsBase64 } from './fileUtils'
import { inspectionIssueReason } from './inspectionStatusReason'
import { InspectionDocumentAnalysisModal } from './InspectionDocumentAnalysisModal'
import { LoginFeedback } from './LoginFeedback'
import {
  NUMERIC_FIELD_LIMITS,
  sanitizeNumericInput,
  validateNumericField,
} from './numericFieldValidation'
import { formatSchedulePartnerLabel, formatScheduleCreatedByLabel, formatScheduleCreatedAtLabel, formatScheduleCollaborator1Label, formatScheduleCollaborator2Label, scheduleAuditSearchText } from './schedulePartnerLabel'
import { getLabTrailLabel } from './labTrailSteps'
import { useCsdsOptions } from './useCsdsOptions'
import { FillingCorrectionBadge, FillingCorrectionNote } from './fillingCorrection'
import { isLavraturaPontoFocalScope } from './profilesAccess'

type FieldTeamSchedulesPanelProps = {
  mode?: 'all' | 'mine'
  /** Admin "Ver como": aplica o escopo CSD deste usuário no Consultar. */
  scopeUserId?: string
  /** Ponto Focal importa documentos só em Enviar documentos. */
  hideInspectionImport?: boolean
  /** Ponto Focal justifica atraso de entrega. */
  allowDelayJustification?: boolean
  /** Ponto Focal pode excluir o agendamento com justificativa. */
  allowCancelSchedule?: boolean
  /** Consultar Medidor: lista todas as etapas da trilha, não só Entrada. */
  allTrailSteps?: boolean
  /** Laboratório pode corrigir dados do agendamento. */
  allowEdit?: boolean
}

type EnvelopePreview = {
  src: string
  meter: string
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function deliveryStatusLabel(item: MeterScheduleRecord) {
  if (item.isLate) return 'Atrasado'
  if (item.trailStep === 'Entrada de medidores') return 'No prazo'
  return 'Entregue'
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

function scheduleSearchText(item: MeterScheduleRecord) {
  return normalizeSearch(
    [
      item.meter,
      digitsOnly(item.meter),
      item.installation,
      item.toi,
      item.note,
      item.csd,
      formatSchedulePartnerLabel(item),
      scheduleAuditSearchText(item),
      item.partnerName,
      item.partnerRegistration,
      item.scheduledAtLabel,
      item.deliveryDeadlineLabel,
      deliveryStatusLabel(item),
      item.trailStep,
      getLabTrailLabel(item.trailStep),
      item.toiCollaborator1Name,
      item.toiCollaborator1Registration,
      item.toiCollaborator2Name,
      item.toiCollaborator2Registration,
      item.schedulingNotes,
      item.installationMark === 'wrong' ? 'instalação digitada errada erro de preenchimento' : '',
      item.installationMark === 'adjusted' ? 'instalação ajustada' : '',
      item.toiMark === 'wrong' ? 'toi digitado errado erro de preenchimento' : '',
      item.toiMark === 'adjusted' ? 'toi ajustado' : '',
      item.noteMark === 'wrong' ? 'nota digitada errada erro de preenchimento' : '',
      item.noteMark === 'adjusted' ? 'nota ajustada' : '',
      item.csdMark === 'wrong' ? 'csd digitado errado erro de preenchimento' : '',
      item.csdMark === 'adjusted' ? 'csd ajustado' : '',
    ]
      .filter(Boolean)
      .join(' '),
  )
}

function scheduleMatchesQuery(item: MeterScheduleRecord, query: string) {
  if (scheduleSearchText(item).includes(query)) return true
  const queryDigits = digitsOnly(query)
  const meterDigits = digitsOnly(item.meter)
  return queryDigits.length >= 4 && meterDigits.includes(queryDigits)
}

function displayValue(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : '—'
}

function scheduleSourceLabel(source: string) {
  if (source === 'bulk_import') return 'Importação em massa'
  if (source === 'passivo') return 'Passivo (Lab)'
  if (source === 'field_team') return 'Equipe de campo'
  return source || '—'
}

function inspectionStatusLabel(summary: MeterInspectionSummary | undefined) {
  if (!summary) return 'Sem documento de inspeção'
  if (summary.hasToi && summary.hasComunicado && !summary.anyBlocked) return 'Liberado'
  return inspectionIssueReason(summary) ?? 'Sem documento de inspeção'
}

function inspectionStatusBadgeClass(summary: MeterInspectionSummary | undefined) {
  if (summary?.hasToi && summary?.hasComunicado && !summary.anyBlocked) {
    return 'schedule-ok-badge'
  }
  return 'schedule-late-badge'
}

function scheduleHasFillingCorrection(item: MeterScheduleRecord) {
  return Boolean(item.installationMark || item.toiMark || item.noteMark || item.csdMark)
}

type ScheduleDetailModalProps = {
  schedule: MeterScheduleRecord
  allowEdit?: boolean
  allowCancel?: boolean
  onClose: () => void
  onPreviewEnvelope: (preview: EnvelopePreview) => void
  onSaved?: (schedule: MeterScheduleRecord) => void
  onRequestCancel?: () => void
}

function ScheduleDetailModal({
  schedule,
  allowEdit = false,
  allowCancel = false,
  onClose,
  onPreviewEnvelope,
  onSaved,
  onRequestCancel,
}: ScheduleDetailModalProps) {
  const deliveryStatus = deliveryStatusLabel(schedule)
  const collaborator1 = formatScheduleCollaborator1Label(schedule)
  const collaborator2 = formatScheduleCollaborator2Label(schedule)
  const scheduledBy = formatScheduleCreatedByLabel(schedule)
  const createdAtLabel = formatScheduleCreatedAtLabel(schedule.createdAt)
  const { options: csdOptions, loading: csdLoading, error: csdError } = useCsdsOptions()
  const [installation, setInstallation] = useState(schedule.installation)
  const [toi, setToi] = useState(schedule.toi)
  const [note, setNote] = useState(schedule.note)
  const [csd, setCsd] = useState(schedule.csd)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'instalacao' | 'toi' | 'nota' | 'csd', string>>>({})

  useEffect(() => {
    setInstallation(schedule.installation)
    setToi(schedule.toi)
    setNote(schedule.note)
    setCsd(schedule.csd)
    setFormError('')
    setFieldErrors({})
  }, [schedule])

  const handleSave = async () => {
    const nextErrors: typeof fieldErrors = {}
    for (const [value, field] of [
      [installation, 'instalacao'],
      [toi, 'toi'],
      [note, 'nota'],
    ] as const) {
      const error = validateNumericField(value, field, true)
      if (error) nextErrors[field] = error
    }
    if (!csd.trim()) nextErrors.csd = 'Selecione um CSD.'
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const { schedule: updated } = await api.updateMeterSchedule(schedule.id, {
        installation,
        toi,
        note,
        csd,
      })
      onSaved?.(updated)
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Não foi possível salvar as alterações.',
      )
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="ensaios-block-modal demm-modal schedule-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-button schedule-slot-modal-close"
          onClick={onClose}
          aria-label="Fechar"
          title="Fechar"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <h3 id="schedule-detail-title">Medidor {schedule.meter}</h3>
        <p className="demm-modal-intro">Etapa: {schedule.trailStep}</p>

        <dl className="user-detail-grid schedule-detail-grid">
          <div>
            <dt>Medidor</dt>
            <dd>{schedule.meter}</dd>
          </div>
          <div>
            <dt>Instalação</dt>
            <dd>
              {allowEdit ? (
                <>
                  <input
                    value={installation}
                    inputMode="numeric"
                    maxLength={NUMERIC_FIELD_LIMITS.instalacao}
                    aria-invalid={Boolean(fieldErrors.instalacao)}
                    onChange={(event) =>
                      setInstallation(
                        sanitizeNumericInput(event.target.value, NUMERIC_FIELD_LIMITS.instalacao),
                      )
                    }
                  />
                  <FormFieldError message={fieldErrors.instalacao} />
                </>
              ) : (
                displayValue(schedule.installation)
              )}
              <FillingCorrectionNote
                field="installation"
                mark={schedule.installationMark}
                previous={schedule.previousInstallation}
              />
            </dd>
          </div>
          <div>
            <dt>TOI</dt>
            <dd>
              {allowEdit ? (
                <>
                  <input
                    value={toi}
                    inputMode="numeric"
                    maxLength={NUMERIC_FIELD_LIMITS.toi}
                    aria-invalid={Boolean(fieldErrors.toi)}
                    onChange={(event) =>
                      setToi(sanitizeNumericInput(event.target.value, NUMERIC_FIELD_LIMITS.toi))
                    }
                  />
                  <FormFieldError message={fieldErrors.toi} />
                </>
              ) : (
                displayValue(schedule.toi)
              )}
              <FillingCorrectionNote
                field="toi"
                mark={schedule.toiMark}
                previous={schedule.previousToi}
              />
            </dd>
          </div>
          <div>
            <dt>Nota</dt>
            <dd>
              {allowEdit ? (
                <>
                  <input
                    value={note}
                    inputMode="numeric"
                    maxLength={NUMERIC_FIELD_LIMITS.nota}
                    aria-invalid={Boolean(fieldErrors.nota)}
                    onChange={(event) =>
                      setNote(sanitizeNumericInput(event.target.value, NUMERIC_FIELD_LIMITS.nota))
                    }
                  />
                  <FormFieldError message={fieldErrors.nota} />
                </>
              ) : (
                displayValue(schedule.note)
              )}
              <FillingCorrectionNote
                field="note"
                mark={schedule.noteMark}
                previous={schedule.previousNote}
              />
            </dd>
          </div>
          <div>
            <dt>CSD</dt>
            <dd>
              {allowEdit ? (
                <>
                  <select
                    value={csd}
                    aria-invalid={Boolean(fieldErrors.csd)}
                    onChange={(event) => setCsd(event.target.value)}
                  >
                    <option value="">{csdLoading ? 'Carregando CSDs...' : 'Selecione'}</option>
                    {csdOptions.map((option) => (
                      <option key={option.id} value={option.label}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <FormFieldError message={fieldErrors.csd ?? csdError ?? undefined} />
                </>
              ) : (
                displayValue(schedule.csd)
              )}
              <FillingCorrectionNote
                field="csd"
                mark={schedule.csdMark}
                previous={schedule.previousCsd}
              />
            </dd>
          </div>
          <div>
            <dt>Agendado por</dt>
            <dd>{displayValue(scheduledBy)}</dd>
          </div>
          <div>
            <dt>Colaborador 1</dt>
            <dd>{displayValue(collaborator1)}</dd>
          </div>
          <div>
            <dt>Colaborador 2</dt>
            <dd>{displayValue(collaborator2)}</dd>
          </div>
          {schedule.toiTeamReason?.trim() ? (
            <div className="user-detail-full">
              <dt>Motivo do agendamento pela equipe</dt>
              <dd>{schedule.toiTeamReason.trim()}</dd>
            </div>
          ) : null}
          <div>
            <dt>Data de agendamento</dt>
            <dd>{displayValue(createdAtLabel)}</dd>
          </div>
          <div>
            <dt>Data de ensaio</dt>
            <dd>{displayValue(schedule.scheduledAtLabel)}</dd>
          </div>
          <div>
            <dt>Prazo entrega</dt>
            <dd>{displayValue(schedule.deliveryDeadlineLabel)}</dd>
          </div>
          <div>
            <dt>Status entrega</dt>
            <dd>{deliveryStatus}</dd>
          </div>
          {schedule.delayJustification?.trim() ? (
            <div className="user-detail-full">
              <dt>Motivo do atraso</dt>
              <dd>{schedule.delayJustification.trim()}</dd>
            </div>
          ) : null}
          <div>
            <dt>Origem</dt>
            <dd>{scheduleSourceLabel(schedule.source)}</dd>
          </div>
          {schedule.scheduledByName?.trim() && schedule.source !== 'bulk_import' ? (
            <div>
              <dt>Agendamento feito por</dt>
              <dd>{schedule.scheduledByName.trim()}</dd>
            </div>
          ) : null}
          {schedule.schedulingDate?.trim() ? (
            <div>
              <dt>Data do agendamento</dt>
              <dd>{schedule.schedulingDate.trim()}</dd>
            </div>
          ) : null}
          {schedule.demmFileName?.trim() ? (
            <>
              <div>
                <dt>DEMM vinculada</dt>
                <dd>{schedule.demmFileName.trim()}</dd>
              </div>
              <div>
                <dt>Medidores na DEMM</dt>
                <dd>{schedule.demmMeterCount}</dd>
              </div>
            </>
          ) : null}
          {schedule.schedulingNotes?.trim() ? (
            <div className="user-detail-full">
              <dt>Observações</dt>
              <dd>{schedule.schedulingNotes.trim()}</dd>
            </div>
          ) : null}
          {schedule.envelopePhoto ? (
            <div className="user-detail-full">
              <dt>Invólucro</dt>
              <dd>
                <button
                  type="button"
                  className="envelope-photo-link"
                  onClick={() =>
                    onPreviewEnvelope({
                      src: schedule.envelopePhoto!,
                      meter: schedule.meter,
                    })
                  }
                  aria-label={`Ampliar foto do invólucro do medidor ${schedule.meter}`}
                  title="Clique para ampliar"
                >
                  <img
                    className="envelope-photo-thumb"
                    src={schedule.envelopePhoto}
                    alt={`Invólucro do medidor ${schedule.meter}`}
                  />
                </button>
              </dd>
            </div>
          ) : null}
        </dl>

        {formError ? <LoginFeedback type="error" message={formError} /> : null}

        <div className="ensaios-block-modal-actions">
          {allowEdit ? (
            <button
              type="button"
              className="primary-button"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          ) : null}
          {allowCancel ? (
            <button
              type="button"
              className="danger-button"
              disabled={saving}
              onClick={() => onRequestCancel?.()}
            >
              Excluir agendamento
            </button>
          ) : null}
          <button type="button" className={allowEdit ? 'secondary-button' : 'primary-button'} onClick={onClose}>
            {allowEdit ? 'Cancelar' : 'Fechar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function FieldTeamConsultarPanel({
  mode = 'all',
  scopeUserId,
  hideInspectionImport = false,
  allowDelayJustification = false,
  allowCancelSchedule = false,
  allTrailSteps = false,
  allowEdit = false,
}: FieldTeamSchedulesPanelProps) {
  const [schedules, setSchedules] = useState<MeterScheduleRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )
  const [envelopePreview, setEnvelopePreview] = useState<EnvelopePreview | null>(null)
  const [selectedSchedule, setSelectedSchedule] = useState<MeterScheduleRecord | null>(null)
  const [uploadingInspectionId, setUploadingInspectionId] = useState<string | null>(null)
  const [inspectionDocumentTarget, setInspectionDocumentTarget] = useState<{
    meter: string
    scheduleId: string
  } | null>(null)
  const [inspectionSummaryByScheduleId, setInspectionSummaryByScheduleId] = useState<
    Record<string, MeterInspectionSummary>
  >({})
  const [delayTarget, setDelayTarget] = useState<MeterScheduleRecord | null>(null)
  const [delayDraft, setDelayDraft] = useState('')
  const [savingDelay, setSavingDelay] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<MeterScheduleRecord | null>(null)
  const [cancelDraft, setCancelDraft] = useState('')
  const [savingCancel, setSavingCancel] = useState(false)
  const [canCancelSchedule, setCanCancelSchedule] = useState(allowCancelSchedule)
  const isMine = mode === 'mine'

  useEffect(() => {
    if (allowCancelSchedule) {
      setCanCancelSchedule(true)
      return
    }
    let cancelled = false
    void Promise.all([api.me(), api.listCsds()])
      .then(([{ user }, { csds }]) => {
        if (cancelled) return
        setCanCancelSchedule(
          user.role === 'admin' ||
            isLavraturaPontoFocalScope(user.workSubtype) ||
            csds.some((csd) => csd.responsibleUserId === user.id),
        )
      })
      .catch(() => {
        if (!cancelled) setCanCancelSchedule(false)
      })
    return () => {
      cancelled = true
    }
  }, [allowCancelSchedule])

  const loadInspectionPendencias = useCallback(async () => {
    try {
      const response = await api.listInspectionPendencias(scopeUserId)
      setInspectionSummaryByScheduleId(response.byScheduleId)
    } catch {
      // Não bloqueia a listagem principal se a consulta de pendências falhar.
    }
  }, [scopeUserId])

  const load = useCallback(async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const { schedules: rows } = await api.listMeterSchedules(undefined, {
        mine: isMine,
        forUserId: !isMine && scopeUserId ? scopeUserId : undefined,
        allTrailSteps,
      })
      setSchedules(rows)
    } catch (error) {
      setSchedules([])
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : isMine
              ? 'Não foi possível carregar seus TOIs.'
              : 'Não foi possível carregar os agendamentos.',
      })
    } finally {
      setLoading(false)
    }
  }, [allTrailSteps, isMine, scopeUserId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadInspectionPendencias()
  }, [loadInspectionPendencias])

  const handleUploadInspectionDocument = async (
    target: { id: string; meter: string },
    files: File[],
  ) => {
    const pdfs = files.filter(
      (file) =>
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
    )
    if (!pdfs.length) {
      setFeedback({ type: 'error', message: 'Envie um ou mais arquivos PDF (TOI e/ou CSM).' })
      return
    }

    setUploadingInspectionId(target.id)
    setFeedback(null)

    try {
      let document: Awaited<ReturnType<typeof api.uploadInspectionDocument>>['document'] | null =
        null
      for (const file of pdfs) {
        const fileBase64 = await readFileAsBase64(file)
        const response = await api.uploadInspectionDocument(target.id, {
          fileName: file.name,
          fileBase64,
        })
        document = response.document
      }
      if (!document) return

      const docTypeLabel =
        document.docType === 'toi'
          ? 'TOI'
          : document.docType === 'comunicado'
            ? 'CSM'
            : 'TOI + CSM'
      const attachedLabel = pdfs.length > 1 ? 'Documentos anexados' : `${docTypeLabel} anexado`

      if (!document.complete) {
        const missing = !document.hasToi ? 'TOI' : 'CSM'
        setFeedback({
          type: 'success',
          message: `${attachedLabel} ao medidor ${target.meter}. Ainda falta anexar o ${missing}.`,
        })
      } else if (document.blocked) {
        setFeedback({
          type: 'error',
          message: `Documento anexado, mas o medidor ${target.meter} ficou bloqueado: ${document.blockReason}`,
        })
      } else {
        setFeedback({
          type: 'success',
          message: `Documento de inspeção anexado ao medidor ${target.meter}.`,
        })
      }

      void loadInspectionPendencias()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível anexar o documento de inspeção.',
      })
    } finally {
      setUploadingInspectionId(null)
    }
  }

  const handleSaveDelayJustification = async () => {
    if (!delayTarget) return
    const justification = delayDraft.trim()
    setSavingDelay(true)
    setFeedback(null)
    try {
      const { schedule } = await api.saveDelayJustification(delayTarget.id, justification)
      setSchedules((current) =>
        current.map((item) => (item.id === schedule.id ? { ...item, ...schedule } : item)),
      )
      setDelayTarget(null)
      setDelayDraft('')
      setFeedback({
        type: 'success',
        message: `Justificativa do medidor ${schedule.meter} salva.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível salvar a justificativa do atraso.',
      })
    } finally {
      setSavingDelay(false)
    }
  }

  const handleCancelSchedule = async () => {
    if (!cancelTarget) return
    const justification = cancelDraft.trim()
    setSavingCancel(true)
    setFeedback(null)
    try {
      const { schedule } = await api.cancelMeterSchedule(cancelTarget.id, justification)
      setSchedules((current) => current.filter((item) => item.id !== schedule.id))
      setCancelTarget(null)
      setCancelDraft('')
      setSelectedSchedule(null)
      setFeedback({
        type: 'success',
        message: `Agendamento do medidor ${schedule.meter} excluído. O registro foi para Medidores atrasados → Excluídos.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível excluir o agendamento.',
      })
    } finally {
      setSavingCancel(false)
    }
  }

  useEffect(() => {
    if (
      !envelopePreview &&
      !selectedSchedule &&
      !inspectionDocumentTarget &&
      !delayTarget &&
      !cancelTarget
    ) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (envelopePreview) {
          setEnvelopePreview(null)
          return
        }
        if (inspectionDocumentTarget) {
          setInspectionDocumentTarget(null)
          return
        }
        if (cancelTarget && !savingCancel) {
          setCancelTarget(null)
          return
        }
        if (delayTarget) {
          setDelayTarget(null)
          return
        }
        setSelectedSchedule(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [envelopePreview, selectedSchedule, inspectionDocumentTarget, delayTarget, cancelTarget, savingCancel])

  const filteredSchedules = useMemo(() => {
    const query = normalizeSearch(searchQuery)
    if (!query) return schedules
    return schedules.filter((item) => scheduleMatchesQuery(item, query))
  }, [schedules, searchQuery])

  const totalCount = schedules.length
  const shownCount = filteredSchedules.length
  const unitLabel = isMine
    ? totalCount === 1
      ? 'TOI'
      : 'TOIs'
    : allTrailSteps
      ? totalCount === 1
        ? 'medidor'
        : 'medidores'
      : totalCount === 1
        ? 'agendamento'
        : 'agendamentos'
  const counterLabel =
    shownCount === totalCount ? `${totalCount} ${unitLabel}` : `${shownCount} de ${totalCount} ${unitLabel}`

  return (
    <div className="entrada-panel">
      {feedback ? (
        <LoginFeedback
          fixed
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      {allTrailSteps ? (
        <p className="entrada-panel-intro">
          Pesquisa todos os medidores do laboratório, em qualquer etapa da trilha.
        </p>
      ) : null}

      {!loading && totalCount > 0 ? (
        <div className="consultar-toolbar">
          <label className="consultar-search">
            <span className="sr-only">Pesquisar</span>
            <span className="consultar-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle
                  cx="11"
                  cy="11"
                  r="7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M20 20l-3.5-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Pesquisar por medidor, nota, CSD, colaborador, usuário, data de agendamento, status…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="consultar-count" aria-live="polite">
            {counterLabel}
          </p>
        </div>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">
          {isMine ? 'Carregando seus TOIs...' : allTrailSteps ? 'Carregando medidores...' : 'Carregando agendamentos...'}
        </p>
      ) : schedules.length === 0 ? (
        <p className="entrada-panel-empty">
          {isMine
            ? 'Nenhum TOI encontrado para o seu usuário.'
            : allTrailSteps
              ? 'Nenhum medidor encontrado.'
              : 'Nenhum agendamento encontrado.'}
        </p>
      ) : filteredSchedules.length === 0 ? (
        <p className="entrada-panel-empty">Nenhum resultado para a pesquisa.</p>
      ) : (
        <div className="entrada-table-wrap">
          <table className="data-table entrada-table">
            <thead>
              <tr>
                <th>Medidor</th>
                {allTrailSteps ? <th>Etapa</th> : null}
                <th>Instalação</th>
                <th>TOI</th>
                <th>Invólucro</th>
                <th>Nota</th>
                <th>CSD</th>
                <th>Agendado por</th>
                <th>Colaborador 1</th>
                <th>Colaborador 2</th>
                <th>Data de agendamento</th>
                <th>Data de ensaio</th>
                <th>Prazo entrega</th>
                <th>Status entrega</th>
                <th>Documento de inspeção</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedules.map((item) => {
                const summary = inspectionSummaryByScheduleId[item.id]
                const inspectionBadgeClass = inspectionStatusBadgeClass(summary)

                return (
                <tr
                  key={item.id}
                  className={item.isLate ? 'schedule-row-late' : undefined}
                >
                  <td>
                    <button
                      type="button"
                      className="schedule-meter-link"
                      onClick={() => setSelectedSchedule(item)}
                      aria-label={`Ver dados do medidor ${item.meter}`}
                      title="Ver todos os dados"
                    >
                      {item.meter}
                    </button>
                  </td>
                  {allTrailSteps ? <td>{getLabTrailLabel(item.trailStep)}</td> : null}
                  <td>
                    <div className="table-installation-cell">
                      <span>{item.installation || '—'}</span>
                      <FillingCorrectionBadge field="installation" mark={item.installationMark} />
                    </div>
                  </td>
                  <td>
                    <div className="table-installation-cell">
                      <span>{item.toi || '—'}</span>
                      <FillingCorrectionBadge field="toi" mark={item.toiMark} />
                    </div>
                  </td>
                  <td>
                    {item.envelopePhoto ? (
                      <button
                        type="button"
                        className="envelope-photo-link"
                        onClick={() => {
                          const photo = item.envelopePhoto
                          if (!photo) return
                          setEnvelopePreview({
                            src: photo,
                            meter: item.meter,
                          })
                        }}
                        aria-label={`Ampliar foto do invólucro do medidor ${item.meter}`}
                        title="Clique para ampliar"
                      >
                        <img
                          className="envelope-photo-thumb"
                          src={item.envelopePhoto}
                          alt={`Invólucro do medidor ${item.meter}`}
                        />
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="table-installation-cell">
                      <span>{item.note || '—'}</span>
                      <FillingCorrectionBadge field="note" mark={item.noteMark} />
                    </div>
                  </td>
                  <td>
                    <div className="table-installation-cell">
                      <span>{item.csd || '—'}</span>
                      <FillingCorrectionBadge field="csd" mark={item.csdMark} />
                    </div>
                  </td>
                  <td>{formatScheduleCreatedByLabel(item) || '—'}</td>
                  <td>{formatScheduleCollaborator1Label(item) || '—'}</td>
                  <td>{formatScheduleCollaborator2Label(item) || '—'}</td>
                  <td>{formatScheduleCreatedAtLabel(item.createdAt) || '—'}</td>
                  <td>{item.scheduledAtLabel || '—'}</td>
                  <td>{item.deliveryDeadlineLabel || '—'}</td>
                  <td>
                    {item.isLate ? (
                      <div className="table-inspection-actions">
                        <span className="schedule-late-badge">Atrasado</span>
                        {item.delayJustification?.trim() ? (
                          <span className="schedule-ok-badge">Justificado</span>
                        ) : allowDelayJustification ? (
                          <span className="schedule-late-badge">Pendente</span>
                        ) : null}
                        {allowDelayJustification ? (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              setDelayTarget(item)
                              setDelayDraft(item.delayJustification ?? '')
                            }}
                          >
                            Justificar
                          </button>
                        ) : null}
                      </div>
                    ) : item.trailStep === 'Entrada de medidores' ? (
                      <span className="schedule-ok-badge">No prazo</span>
                    ) : (
                      'Entregue'
                    )}
                  </td>
                  <td className="table-inspection-cell">
                    <div className="table-inspection-actions">
                      <span
                        className={inspectionBadgeClass}
                        title={inspectionStatusLabel(summary)}
                      >
                        {summary?.hasToi && summary.hasComunicado && !summary.anyBlocked
                          ? 'Liberado'
                          : inspectionStatusLabel(summary)}
                      </span>
                      <div className="table-inspection-actions__buttons">
                        {hideInspectionImport ? null : (
                          <>
                            <input
                              id={`consultar-inspection-${item.id}`}
                              type="file"
                              accept="application/pdf,.pdf"
                              multiple
                              className="file-picker-input"
                              disabled={uploadingInspectionId === item.id}
                              onChange={(event) => {
                                const files = inspectionPdfFilesFromList(event.target.files)
                                event.target.value = ''
                                if (files.length) {
                                  void handleUploadInspectionDocument(
                                    { id: item.id, meter: item.meter },
                                    files,
                                  )
                                }
                              }}
                            />
                            <label
                              htmlFor={`consultar-inspection-${item.id}`}
                              className="file-picker-button"
                              title="Importar documento de inspeção"
                            >
                              {uploadingInspectionId === item.id ? 'Enviando...' : 'Importar'}
                            </label>
                          </>
                        )}
                        {summary?.hasToi || summary?.hasComunicado ? (
                          <button
                            type="button"
                            className="secondary-button"
                            title="Ver documento de inspeção"
                            onClick={() =>
                              setInspectionDocumentTarget({
                                meter: item.meter,
                                scheduleId: item.id,
                              })
                            }
                          >
                            Ver
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedSchedule ? (
        <ScheduleDetailModal
          schedule={selectedSchedule}
          allowEdit={allowEdit}
          allowCancel={canCancelSchedule}
          onClose={() => setSelectedSchedule(null)}
          onPreviewEnvelope={setEnvelopePreview}
          onRequestCancel={() => {
            setCancelTarget(selectedSchedule)
            setCancelDraft('')
            setSelectedSchedule(null)
          }}
          onSaved={(updated) => {
            setSchedules((current) =>
              current.map((item) => (item.id === updated.id ? updated : item)),
            )
            setSelectedSchedule(updated)
            setFeedback({
              type: 'success',
              message: scheduleHasFillingCorrection(updated)
                ? 'Dados salvos. A correção ficou marcada como ajustada e consta no histórico do medidor. Os colaboradores do TOI veem como preenchimento digitado errado em Meus TOIs.'
                : 'Dados do agendamento atualizados.',
            })
          }}
        />
      ) : null}

      {envelopePreview ? (
        <div
          className="envelope-photo-lightbox"
          role="presentation"
          onClick={() => setEnvelopePreview(null)}
        >
          <div
            className="envelope-photo-lightbox-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Foto do invólucro do medidor ${envelopePreview.meter}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="icon-button schedule-slot-modal-close"
              onClick={() => setEnvelopePreview(null)}
              aria-label="Fechar"
              title="Fechar"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <p className="envelope-photo-lightbox-caption">
              Invólucro · medidor {envelopePreview.meter}
            </p>
            <img
              className="envelope-photo-lightbox-image"
              src={envelopePreview.src}
              alt={`Foto ampliada do invólucro do medidor ${envelopePreview.meter}`}
            />
          </div>
        </div>
      ) : null}

      {inspectionDocumentTarget ? (
        <InspectionDocumentAnalysisModal
          meter={inspectionDocumentTarget.meter}
          scheduleId={inspectionDocumentTarget.scheduleId}
          onClose={() => setInspectionDocumentTarget(null)}
          onDocumentsChanged={() => {
            void loadInspectionPendencias()
            void load()
          }}
        />
      ) : null}

      {delayTarget
        ? createPortal(
            <div
              className="ensaios-block-modal-overlay"
              role="presentation"
              onClick={() => {
                if (!savingDelay) setDelayTarget(null)
              }}
            >
              <div
                className="ensaios-block-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delay-justification-title"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 id="delay-justification-title">Justificar atraso</h3>
                <p className="csds-form-hint">
                  Medidor {delayTarget.meter} · prazo {delayTarget.deliveryDeadlineLabel || '—'}.
                  Informe o motivo do atraso na entrega.
                </p>
                <label>
                  Motivo do atraso
                  <textarea
                    value={delayDraft}
                    onChange={(event) => setDelayDraft(event.target.value)}
                    rows={4}
                    placeholder="Descreva o motivo do atraso"
                    disabled={savingDelay}
                    required
                  />
                </label>
                <div className="ensaios-block-modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setDelayTarget(null)}
                    disabled={savingDelay}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={savingDelay || delayDraft.trim().length < 5}
                    onClick={() => void handleSaveDelayJustification()}
                  >
                    {savingDelay ? 'Salvando...' : 'Salvar justificativa'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {cancelTarget
        ? createPortal(
            <div
              className="ensaios-block-modal-overlay"
              role="presentation"
              onClick={() => {
                if (!savingCancel) setCancelTarget(null)
              }}
            >
              <div
                className="ensaios-block-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="cancel-schedule-title"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 id="cancel-schedule-title">Excluir agendamento</h3>
                <p className="csds-form-hint">
                  Medidor {cancelTarget.meter}. Informe o motivo da exclusão. O medidor sai da
                  consulta e passa a constar em Medidores atrasados → Excluídos.
                </p>
                <label>
                  Justificativa
                  <textarea
                    value={cancelDraft}
                    onChange={(event) => setCancelDraft(event.target.value)}
                    rows={4}
                    placeholder="Descreva o motivo da exclusão do agendamento"
                    disabled={savingCancel}
                    required
                  />
                </label>
                <div className="ensaios-block-modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setCancelTarget(null)}
                    disabled={savingCancel}
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={savingCancel || cancelDraft.trim().length < 5}
                    onClick={() => void handleCancelSchedule()}
                  >
                    {savingCancel ? 'Excluindo...' : 'Excluir agendamento'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
