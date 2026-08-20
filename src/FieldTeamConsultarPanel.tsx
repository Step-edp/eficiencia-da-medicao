import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, type MeterInspectionSummary, type MeterScheduleRecord } from './api'
import { readFileAsBase64 } from './fileUtils'
import { InspectionDocumentAnalysisModal } from './InspectionDocumentAnalysisModal'
import { LoginFeedback } from './LoginFeedback'
import { formatSchedulePartnerLabel, formatScheduleCreatedByLabel, formatScheduleCreatedAtLabel, formatScheduleCollaborator1Label, formatScheduleCollaborator2Label, scheduleAuditSearchText } from './schedulePartnerLabel'

type FieldTeamSchedulesPanelProps = {
  mode?: 'all' | 'mine'
  /** Admin "Ver como": aplica o escopo CSD deste usuário no Consultar. */
  scopeUserId?: string
  /** Ponto Focal importa documentos só em Enviar documentos. */
  hideInspectionImport?: boolean
  /** Ponto Focal justifica atraso de entrega. */
  allowDelayJustification?: boolean
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

function scheduleSearchText(item: MeterScheduleRecord) {
  return normalizeSearch(
    [
      item.meter,
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
      item.toiCollaborator1Name,
      item.toiCollaborator1Registration,
      item.toiCollaborator2Name,
      item.toiCollaborator2Registration,
      item.schedulingNotes,
    ]
      .filter(Boolean)
      .join(' '),
  )
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
  if (!summary?.hasToi && !summary?.hasComunicado) return 'Sem documento de inspeção'
  if (summary.hasToi && !summary.hasComunicado) return 'Falta CSM'
  if (!summary.hasToi && summary.hasComunicado) return 'Falta TOI'
  if (summary.anyBlocked) return 'Bloqueado'
  if (summary.hasToi && summary.hasComunicado) return 'Liberado'
  return 'Sem documento de inspeção'
}

function inspectionStatusShortLabel(summary: MeterInspectionSummary | undefined) {
  if (!summary?.hasToi && !summary?.hasComunicado) return 'Sem doc.'
  if (summary.hasToi && !summary.hasComunicado) return 'Falta CSM'
  if (!summary.hasToi && summary.hasComunicado) return 'Falta TOI'
  if (summary.anyBlocked) return 'Bloqueado'
  if (summary.hasToi && summary.hasComunicado) return 'Liberado'
  return 'Sem doc.'
}

function inspectionStatusBadgeClass(summary: MeterInspectionSummary | undefined) {
  if (summary?.hasToi && summary?.hasComunicado && !summary.anyBlocked) {
    return 'schedule-ok-badge'
  }
  return 'schedule-late-badge'
}

type ScheduleDetailModalProps = {
  schedule: MeterScheduleRecord
  onClose: () => void
  onPreviewEnvelope: (preview: EnvelopePreview) => void
}

function ScheduleDetailModal({ schedule, onClose, onPreviewEnvelope }: ScheduleDetailModalProps) {
  const deliveryStatus = deliveryStatusLabel(schedule)
  const collaborator1 = formatScheduleCollaborator1Label(schedule)
  const collaborator2 = formatScheduleCollaborator2Label(schedule)
  const scheduledBy = formatScheduleCreatedByLabel(schedule)
  const createdAtLabel = formatScheduleCreatedAtLabel(schedule.createdAt)

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
            <dd>{displayValue(schedule.installation)}</dd>
          </div>
          <div>
            <dt>TOI</dt>
            <dd>{displayValue(schedule.toi)}</dd>
          </div>
          <div>
            <dt>Nota</dt>
            <dd>{displayValue(schedule.note)}</dd>
          </div>
          <div>
            <dt>CSD</dt>
            <dd>{displayValue(schedule.csd)}</dd>
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

        <div className="ensaios-block-modal-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            Fechar
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
  const isMine = mode === 'mine'

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
  }, [isMine, scopeUserId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadInspectionPendencias()
  }, [loadInspectionPendencias])

  const handleUploadInspectionDocument = async (
    target: { id: string; meter: string },
    file: File,
  ) => {
    setUploadingInspectionId(target.id)
    setFeedback(null)

    try {
      const fileBase64 = await readFileAsBase64(file)
      const { document } = await api.uploadInspectionDocument(target.id, {
        fileName: file.name,
        fileBase64,
      })

      const docTypeLabel =
        document.docType === 'toi'
          ? 'TOI'
          : document.docType === 'comunicado'
            ? 'CSM'
            : 'TOI + CSM'

      if (!document.complete) {
        const missing = !document.hasToi ? 'TOI' : 'CSM'
        setFeedback({
          type: 'success',
          message: `${docTypeLabel} anexado ao medidor ${target.meter}. Ainda falta anexar o ${missing}.`,
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

  useEffect(() => {
    if (!envelopePreview && !selectedSchedule && !inspectionDocumentTarget && !delayTarget) return

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
        if (delayTarget) {
          setDelayTarget(null)
          return
        }
        setSelectedSchedule(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [envelopePreview, selectedSchedule, inspectionDocumentTarget, delayTarget])

  const filteredSchedules = useMemo(() => {
    const query = normalizeSearch(searchQuery)
    if (!query) return schedules
    return schedules.filter((item) => scheduleSearchText(item).includes(query))
  }, [schedules, searchQuery])

  const totalCount = schedules.length
  const shownCount = filteredSchedules.length
  const counterLabel = isMine
    ? shownCount === totalCount
      ? `${totalCount} TOI${totalCount === 1 ? '' : 's'}`
      : `${shownCount} de ${totalCount} TOI${totalCount === 1 ? '' : 's'}`
    : shownCount === totalCount
      ? `${totalCount} agendamento${totalCount === 1 ? '' : 's'}`
      : `${shownCount} de ${totalCount} agendamento${totalCount === 1 ? '' : 's'}`

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
          {isMine ? 'Carregando seus TOIs...' : 'Carregando agendamentos...'}
        </p>
      ) : schedules.length === 0 ? (
        <p className="entrada-panel-empty">
          {isMine ? 'Nenhum TOI encontrado para o seu usuário.' : 'Nenhum agendamento encontrado.'}
        </p>
      ) : filteredSchedules.length === 0 ? (
        <p className="entrada-panel-empty">Nenhum resultado para a pesquisa.</p>
      ) : (
        <div className="entrada-table-wrap">
          <table className="data-table entrada-table">
            <thead>
              <tr>
                <th>Medidor</th>
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
                  <td>{item.installation || '—'}</td>
                  <td>{item.toi || '—'}</td>
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
                  <td>{item.note || '—'}</td>
                  <td>{item.csd || '—'}</td>
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
                        title={summary?.blockReasons ?? inspectionStatusLabel(summary)}
                      >
                        {inspectionStatusShortLabel(summary)}
                      </span>
                      <div className="table-inspection-actions__buttons">
                        {hideInspectionImport ? null : (
                          <>
                            <input
                              id={`consultar-inspection-${item.id}`}
                              type="file"
                              accept="application/pdf,.pdf"
                              className="file-picker-input"
                              disabled={uploadingInspectionId === item.id}
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                event.target.value = ''
                                if (file) {
                                  void handleUploadInspectionDocument(
                                    { id: item.id, meter: item.meter },
                                    file,
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
          onClose={() => setSelectedSchedule(null)}
          onPreviewEnvelope={setEnvelopePreview}
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
    </div>
  )
}
