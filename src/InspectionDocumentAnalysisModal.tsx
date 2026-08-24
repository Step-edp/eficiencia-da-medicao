import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  api,
  ApiError,
  type InspectionDocumentConference,
  type InspectionDocumentRecord,
  type InspectionDocumentType,
  type InspectionPhotoRecord,
} from './api'
import { LoginFeedback } from './LoginFeedback'
import { readImageAsDataUrl } from './readImageAsDataUrl'

type InspectionDocumentAnalysisModalProps = {
  meter: string
  scheduleId: string
  onClose: () => void
  onDocumentsChanged?: () => void
}

type DocumentFieldsDraft = {
  meter: string
  lacre: string
  coverSeal: string
  reading: string
  scheduledAt: string
}

function draftFromDocument(document: InspectionDocumentRecord): DocumentFieldsDraft {
  return {
    meter: document.extractedMeterRetirado ?? document.extractedMeter ?? '',
    lacre: document.extractedLacre ?? '',
    coverSeal: document.extractedCoverSeal ?? '',
    reading: document.extractedReading ?? '',
    scheduledAt: document.extractedScheduledAt ?? '',
  }
}

function inspectionDocTypeLabel(docType: InspectionDocumentType) {
  switch (docType) {
    case 'toi':
      return 'TOI'
    case 'comunicado':
      return 'CSM'
    case 'ambos':
      return 'TOI + CSM'
    default:
      return docType
  }
}

function formatDateTime(isoDate: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(isoDate))
}

function formatAttachedBy(
  name: string | null | undefined,
  registration: string | null | undefined,
) {
  const normalizedName = name?.trim()
  const normalizedRegistration = registration?.trim()
  if (normalizedName && normalizedRegistration) {
    return `${normalizedName} (${normalizedRegistration})`
  }
  return normalizedName || normalizedRegistration || '—'
}

function MatchIndicator({ matches }: { matches: boolean | null | undefined }) {
  if (matches === true) {
    return (
      <span className="inspection-document-match is-match" aria-label="Confere">
        ✓
      </span>
    )
  }
  if (matches === false) {
    return (
      <span className="inspection-document-match is-mismatch" aria-label="Não confere">
        ✗
      </span>
    )
  }
  return (
    <span className="inspection-document-match is-unknown" aria-label="Comparação indisponível">
      —
    </span>
  )
}

function displayConferenceValue(value: string | null | undefined, emptyLabel = '—') {
  const trimmed = value?.trim()
  return trimmed ? trimmed : emptyLabel
}

function hasConferenceValue(value: string | null | undefined) {
  return Boolean(value?.trim())
}

function inspectionAnalysisComplete(fields: Array<string | null | undefined>) {
  return fields.every((value) => hasConferenceValue(value))
}

function normalizeConferenceDigits(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null
  return digits.replace(/^0+/, '') || '0'
}

function normalizeConferenceDate(value: string | null | undefined) {
  const match = String(value ?? '').match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/,
  )
  if (!match) return null
  const day = match[1].padStart(2, '0')
  const month = match[2].padStart(2, '0')
  const year = match[3]
  const hour = match[4]
  const minute = match[5]
  if (hour == null || minute == null) return `${year}-${month}-${day}`
  return `${year}-${month}-${day}T${hour.padStart(2, '0')}:${minute}`
}

function conferenceMatches(
  values: Array<string | null | undefined>,
  kind: 'digits' | 'date' | 'text' = 'digits',
): boolean | null {
  if (kind === 'text') {
    const normalized = values
      .map((value) => value?.replace(/\s+/g, ' ').trim().toLowerCase())
      .filter((value): value is string => Boolean(value))
    if (normalized.length < 2) return null
    return normalized.every((value) => value === normalized[0])
  }
  if (kind === 'date') {
    const normalized = values
      .map((value) => normalizeConferenceDate(value))
      .filter((value): value is string => Boolean(value))
    if (normalized.length < 2) return null
    const timed = normalized.filter((value) => value.includes('T'))
    const dates = normalized.map((value) => value.slice(0, 10))
    const sameDate = dates.every((value) => value === dates[0])
    if (!sameDate) return false
    if (timed.length >= 2) {
      return timed.every((value) => value === timed[0])
    }
    return true
  }

  const normalized = values
    .map((value) => normalizeConferenceDigits(value))
    .filter((value): value is string => Boolean(value))
  if (normalized.length < 2) return null
  return normalized.every((value) => value === normalized[0])
}

function ComparisonField({
  label,
  campo,
  documento,
  agendamento,
  laboratorio,
  kind = 'digits',
  campoEmpty = '',
  documentoEmpty = '—',
  agendamentoEmpty = '—',
  laboratorioEmpty = '—',
  campoEditable = false,
  documentoEditable = false,
  onCampoChange,
  onDocumentoChange,
  showAdjust = false,
  adjusting = false,
  onAdjust,
  agendamentoPhoto,
  onPreviewAgendamentoPhoto,
}: {
  label: string
  campo?: string | null
  documento?: string | null
  agendamento?: string | null
  laboratorio?: string | null
  kind?: 'digits' | 'date' | 'text'
  campoEmpty?: string
  documentoEmpty?: string
  agendamentoEmpty?: string
  laboratorioEmpty?: string
  campoEditable?: boolean
  documentoEditable?: boolean
  onCampoChange?: (value: string) => void
  onDocumentoChange?: (value: string) => void
  showAdjust?: boolean
  adjusting?: boolean
  onAdjust?: () => void
  agendamentoPhoto?: string | null
  onPreviewAgendamentoPhoto?: () => void
}) {
  const matches = conferenceMatches([campo, documento, agendamento, laboratorio], kind)
  return (
    <div className="inspection-document-comparison">
      <dt>{label}</dt>
      <dd>
        <div className="inspection-document-comparison-grid is-four">
          <div className="inspection-document-comparison-item">
            <span className="inspection-document-comparison-label">WPA</span>
            {campoEditable ? (
              <input
                type="text"
                className="inspection-document-wpa-input"
                value={campo ?? ''}
                placeholder={campoEmpty}
                inputMode={kind === 'digits' ? 'numeric' : 'text'}
                aria-label={`${label} no WPA`}
                onChange={(event) => onCampoChange?.(event.target.value)}
              />
            ) : (
              <strong>{displayConferenceValue(campo, campoEmpty)}</strong>
            )}
          </div>
          <div className="inspection-document-comparison-item">
            <span className="inspection-document-comparison-label">Documento</span>
            {documentoEditable ? (
              <input
                type="text"
                className="inspection-document-wpa-input"
                value={documento ?? ''}
                placeholder={documentoEmpty}
                inputMode={kind === 'digits' ? 'numeric' : 'text'}
                aria-label={`${label} no documento`}
                onChange={(event) => onDocumentoChange?.(event.target.value)}
              />
            ) : (
              <strong>{displayConferenceValue(documento, documentoEmpty)}</strong>
            )}
          </div>
          <div className="inspection-document-comparison-item">
            <span className="inspection-document-comparison-label">Agendamento</span>
            <div className="inspection-document-comparison-value-row">
              {hasConferenceValue(agendamento) || !agendamentoPhoto ? (
                <strong>{displayConferenceValue(agendamento, agendamentoEmpty)}</strong>
              ) : null}
              {agendamentoPhoto ? (
                <button
                  type="button"
                  className="inspection-document-photo-eye"
                  onClick={onPreviewAgendamentoPhoto}
                  aria-label={`Visualizar foto do ${label.toLowerCase()} no agendamento`}
                  title="Visualizar foto do agendamento"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
          <div className="inspection-document-comparison-item">
            <span className="inspection-document-comparison-label">Laboratório</span>
            <strong>{displayConferenceValue(laboratorio, laboratorioEmpty)}</strong>
          </div>
          <MatchIndicator matches={matches} />
          {showAdjust && matches === false ? (
            <button
              type="button"
              className="secondary-button inspection-document-adjust-btn"
              disabled={adjusting}
              onClick={onAdjust}
            >
              {adjusting ? 'Ajustando...' : 'Ajustar'}
            </button>
          ) : null}
        </div>
      </dd>
    </div>
  )
}

export function InspectionDocumentAnalysisModal({
  meter,
  scheduleId,
  onClose,
  onDocumentsChanged,
}: InspectionDocumentAnalysisModalProps) {
  const [loading, setLoading] = useState(true)
  const [documents, setDocuments] = useState<InspectionDocumentRecord[]>([])
  const [canDelete, setCanDelete] = useState(false)
  const [deleteBlockedReason, setDeleteBlockedReason] = useState<string | null>(null)
  const [registeredMeter, setRegisteredMeter] = useState(meter)
  const [conference, setConference] = useState<InspectionDocumentConference | null>(null)
  const [canEditWpa, setCanEditWpa] = useState(false)
  const [wpaDraft, setWpaDraft] = useState({
    meter: '',
    lacre: '',
    coverSeal: '',
    reading: '',
  })
  const [documentDrafts, setDocumentDrafts] = useState<Record<string, DocumentFieldsDraft>>({})
  const wpaSaveTimerRef = useRef<number | null>(null)
  const documentSaveTimerRef = useRef<number | null>(null)
  const observationsTimerRef = useRef<number | null>(null)
  const [observations, setObservations] = useState('')
  const [photos, setPhotos] = useState<InspectionPhotoRecord[]>([])
  const [envelopePhoto, setEnvelopePhoto] = useState<string | null>(null)
  const [canManagePhotos, setCanManagePhotos] = useState(false)
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)
  const [previewPhoto, setPreviewPhoto] = useState<{ src: string; caption: string } | null>(null)
  const photoInputId = useId()
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const [deletingDocType, setDeletingDocType] = useState<InspectionDocumentType | null>(null)
  const [adjustingDocType, setAdjustingDocType] = useState<InspectionDocumentType | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const response = await api.listInspectionDocuments(scheduleId)
      setDocuments(response.documents)
      setCanDelete(response.canDelete)
      setDeleteBlockedReason(response.deleteBlockedReason)
      setRegisteredMeter(response.meter)
      const nextConference = response.conference ?? {
        campoMeter: null,
        campoLacre: null,
        campoCoverSeal: null,
        campoReading: null,
        campoScheduleDate: null,
        scheduleMeter: response.meter,
        scheduleLacre: response.registeredLacre,
        scheduleCoverSeal: response.registeredCoverSeal ?? null,
        scheduleReading: response.registeredReading ?? null,
        scheduleScheduleDate: null,
        labMeter: null,
        labLacre: null,
        labCoverSeal: null,
        labReading: null,
        labScheduleDate: null,
      }
      setConference(nextConference)
      setWpaDraft({
        meter: nextConference.campoMeter ?? '',
        lacre: nextConference.campoLacre ?? '',
        coverSeal: nextConference.campoCoverSeal ?? '',
        reading: nextConference.campoReading ?? '',
      })
      setDocumentDrafts(
        Object.fromEntries(
          response.documents.map((document) => [document.docType, draftFromDocument(document)]),
        ),
      )
      setPhotos(response.photos ?? [])
      setEnvelopePhoto(response.envelopePhoto?.trim() || null)
      setCanManagePhotos(response.canManagePhotos !== false)
      setCanEditWpa(response.canEditWpa === true || response.canManagePhotos === true)
      setObservations(response.observations ?? '')
    } catch {
      setDocuments([])
      setCanDelete(false)
      setDeleteBlockedReason(null)
      setRegisteredMeter(meter)
      setConference(null)
      setWpaDraft({ meter: '', lacre: '', coverSeal: '', reading: '' })
      setDocumentDrafts({})
      setPhotos([])
      setEnvelopePhoto(null)
      setCanManagePhotos(false)
      setCanEditWpa(false)
      setObservations('')
    } finally {
      setLoading(false)
    }
  }, [meter, scheduleId])

  const persistWpaDraft = useCallback(
    async (next: { meter: string; lacre: string; coverSeal: string; reading: string }) => {
      try {
        await api.updateInspectionWpa(scheduleId, next)
      } catch (error) {
        setFeedback({
          type: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'Não foi possível salvar o WPA informado.',
        })
      }
    },
    [scheduleId],
  )

  const handleWpaChange = useCallback(
    (field: 'meter' | 'lacre' | 'coverSeal' | 'reading', value: string) => {
      setWpaDraft((current) => {
        const next = { ...current, [field]: value }
        if (wpaSaveTimerRef.current != null) {
          window.clearTimeout(wpaSaveTimerRef.current)
        }
        wpaSaveTimerRef.current = window.setTimeout(() => {
          void persistWpaDraft(next)
        }, 400)
        return next
      })
    },
    [persistWpaDraft],
  )

  const persistDocumentDraft = useCallback(
    async (docType: InspectionDocumentType, next: DocumentFieldsDraft) => {
      try {
        const response = await api.updateInspectionExtracted(scheduleId, {
          docType,
          ...next,
        })
        setDocuments((current) =>
          current.map((document) =>
            document.docType === docType
              ? {
                  ...document,
                  extractedMeter: response.document.extractedMeter,
                  extractedMeterRetirado: response.document.extractedMeterRetirado,
                  extractedLacre: response.document.extractedLacre,
                  extractedCoverSeal: response.document.extractedCoverSeal,
                  extractedReading: response.document.extractedReading,
                  extractedScheduledAt: response.document.extractedScheduledAt,
                  blocked: response.document.blocked,
                  blockReason: response.document.blockReason,
                }
              : document,
          ),
        )
      } catch (error) {
        setFeedback({
          type: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'Não foi possível salvar os campos do documento.',
        })
      }
    },
    [scheduleId],
  )

  const handleDocumentoChange = useCallback(
    (
      docType: InspectionDocumentType,
      field: keyof DocumentFieldsDraft,
      value: string,
    ) => {
      setDocumentDrafts((current) => {
        const previous = current[docType] ?? {
          meter: '',
          lacre: '',
          coverSeal: '',
          reading: '',
          scheduledAt: '',
        }
        const next = { ...previous, [field]: value }
        if (documentSaveTimerRef.current != null) {
          window.clearTimeout(documentSaveTimerRef.current)
        }
        documentSaveTimerRef.current = window.setTimeout(() => {
          void persistDocumentDraft(docType, next)
        }, 400)
        return { ...current, [docType]: next }
      })
    },
    [persistDocumentDraft],
  )

  const persistObservations = useCallback(
    async (next: string) => {
      try {
        await api.updateInspectionObservations(scheduleId, next)
      } catch (error) {
        setFeedback({
          type: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'Não foi possível salvar as observações.',
        })
      }
    },
    [scheduleId],
  )

  const handleObservationsChange = (value: string) => {
    setObservations(value)
    if (observationsTimerRef.current != null) {
      window.clearTimeout(observationsTimerRef.current)
    }
    observationsTimerRef.current = window.setTimeout(() => {
      void persistObservations(value)
    }, 400)
  }

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  useEffect(() => {
    return () => {
      if (wpaSaveTimerRef.current != null) {
        window.clearTimeout(wpaSaveTimerRef.current)
      }
      if (documentSaveTimerRef.current != null) {
        window.clearTimeout(documentSaveTimerRef.current)
      }
      if (observationsTimerRef.current != null) {
        window.clearTimeout(observationsTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (previewPhoto) {
        setPreviewPhoto(null)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, previewPhoto])

  const handleDeleteDocument = async (document: InspectionDocumentRecord) => {
    const label = inspectionDocTypeLabel(document.docType)
    const confirmed = window.confirm(
      `Excluir o documento ${label} (${document.fileName}) do medidor ${meter}?`,
    )
    if (!confirmed) return

    setDeletingDocType(document.docType)
    setFeedback(null)

    try {
      await api.deleteInspectionDocument(document.meterScheduleId, document.docType)
      setFeedback({ type: 'success', message: `Documento ${label} excluído.` })
      onDocumentsChanged?.()
      await loadDocuments()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível excluir o documento de inspeção.',
      })
    } finally {
      setDeletingDocType(null)
    }
  }

  const handleAdjustScheduleDate = async (document: InspectionDocumentRecord) => {
    setAdjustingDocType(document.docType)
    setFeedback(null)
    try {
      const response = await api.adjustScheduleDateFromDocument(
        document.meterScheduleId,
        document.docType,
      )
      setFeedback({
        type: 'success',
        message: `Data de agendamento ajustada para ${response.scheduleDateLabel}.`,
      })
      onDocumentsChanged?.()
      await loadDocuments()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível ajustar a data de agendamento.',
      })
    } finally {
      setAdjustingDocType(null)
    }
  }

  const openPhotoPicker = () => {
    photoInputRef.current?.click()
  }

  const handlePhotoFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return
    setUploadingPhotos(true)
    setFeedback(null)
    try {
      const photosToUpload = []
      for (const file of Array.from(fileList)) {
        const photoData = await readImageAsDataUrl(file)
        photosToUpload.push({ fileName: file.name, photoData })
      }
      const response = await api.uploadInspectionPhotos(scheduleId, photosToUpload)
      setPhotos(response.photos)
      setFeedback({
        type: 'success',
        message:
          photosToUpload.length === 1
            ? 'Foto enviada.'
            : `${photosToUpload.length} fotos enviadas.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError ? error.message : 'Não foi possível enviar as fotos.',
      })
    } finally {
      setUploadingPhotos(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  const handleDeletePhoto = async (photo: InspectionPhotoRecord) => {
    const confirmed = window.confirm('Excluir esta foto da análise?')
    if (!confirmed) return
    setDeletingPhotoId(photo.id)
    setFeedback(null)
    try {
      const response = await api.deleteInspectionPhoto(scheduleId, photo.id)
      setPhotos(response.photos)
      if (previewPhoto?.src === photo.photoData) setPreviewPhoto(null)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError ? error.message : 'Não foi possível excluir a foto.',
      })
    } finally {
      setDeletingPhotoId(null)
    }
  }

  return createPortal(
    <div
      className="inspection-analysis-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inspection-document-title"
    >
      <header className="inspection-analysis-screen-bar">
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Voltar"
          title="Voltar"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="inspection-analysis-screen-heading">
          <h3 id="inspection-document-title">Documento de inspeção — medidor {meter}</h3>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={onClose}
        >
          Voltar
        </button>
      </header>

      <div className="inspection-analysis-screen-body">

        {feedback ? (
          <LoginFeedback
            fixed
            type={feedback.type}
            message={feedback.message}
            onClose={() => setFeedback(null)}
          />
        ) : null}

        {deleteBlockedReason ? (
          <p className="field-hint" role="status">
            {deleteBlockedReason}
          </p>
        ) : null}

        {loading ? (
          <p className="entrada-panel-empty">Carregando documentos...</p>
        ) : documents.length === 0 ? (
          <p className="entrada-panel-empty">Nenhum documento de inspeção anexado.</p>
        ) : (
          <div className="inspection-document-list">
            {documents.map((document) => {
              const campoMeter = canEditWpa ? wpaDraft.meter : conference?.campoMeter
              const campoLacre = canEditWpa ? wpaDraft.lacre : conference?.campoLacre
              const campoCoverSeal = canEditWpa ? wpaDraft.coverSeal : conference?.campoCoverSeal
              const campoReading = canEditWpa ? wpaDraft.reading : conference?.campoReading
              const documentoDraft = documentDrafts[document.docType] ?? draftFromDocument(document)
              const documentoMeter = canEditWpa
                ? documentoDraft.meter
                : (document.extractedMeterRetirado ?? document.extractedMeter)
              const documentoLacre = canEditWpa ? documentoDraft.lacre : document.extractedLacre
              const documentoCoverSeal = canEditWpa
                ? documentoDraft.coverSeal
                : document.extractedCoverSeal
              const documentoReading = canEditWpa ? documentoDraft.reading : document.extractedReading
              const documentoScheduledAt = canEditWpa
                ? documentoDraft.scheduledAt
                : document.extractedScheduledAt
              const analysisComplete = inspectionAnalysisComplete([
                campoMeter,
                documentoMeter,
                conference?.scheduleMeter ?? document.registeredMeter ?? registeredMeter,
                conference?.labMeter,
                campoLacre,
                documentoLacre,
                conference?.scheduleLacre ?? document.registeredLacre,
                conference?.labLacre,
                campoCoverSeal,
                documentoCoverSeal,
                conference?.labCoverSeal,
                campoReading,
                documentoReading,
                conference?.labReading,
                documentoScheduledAt,
                conference?.scheduleScheduleDate,
              ])
              const status = document.blocked
                ? 'blocked'
                : analysisComplete
                  ? 'ok'
                  : 'pending'

              return (
              <article key={document.id} className="inspection-document-card">
                <div className="inspection-document-card-header">
                  <strong>{inspectionDocTypeLabel(document.docType)}</strong>
                  <span
                    className={`inspection-document-status is-${status}`}
                  >
                    {status === 'blocked' ? 'Bloqueado' : status === 'ok' ? 'OK' : 'Pendente'}
                  </span>
                </div>

                <dl className="user-detail-grid schedule-detail-grid">
                  <div>
                    <dt>Anexado por</dt>
                    <dd>
                      {formatAttachedBy(document.createdByName, document.createdByRegistration)}
                    </dd>
                  </div>
                  <div>
                    <dt>Anexado em</dt>
                    <dd>{formatDateTime(document.createdAt)}</dd>
                  </div>
                  <ComparisonField
                    label="Medidor retirado"
                    campo={canEditWpa ? wpaDraft.meter : conference?.campoMeter}
                    documento={documentoMeter}
                    agendamento={conference?.scheduleMeter ?? document.registeredMeter ?? registeredMeter}
                    laboratorio={conference?.labMeter}
                    laboratorioEmpty="Pendente"
                    campoEditable={canEditWpa}
                    documentoEditable={canEditWpa}
                    onCampoChange={(value) => handleWpaChange('meter', value)}
                    onDocumentoChange={(value) => handleDocumentoChange(document.docType, 'meter', value)}
                  />
                  <ComparisonField
                    label="Lacre do invólucro"
                    campo={canEditWpa ? wpaDraft.lacre : conference?.campoLacre}
                    documento={documentoLacre}
                    agendamento={conference?.scheduleLacre ?? document.registeredLacre}
                    laboratorio={conference?.labLacre}
                    laboratorioEmpty="Pendente"
                    campoEditable={canEditWpa}
                    documentoEditable={canEditWpa}
                    onCampoChange={(value) => handleWpaChange('lacre', value)}
                    onDocumentoChange={(value) => handleDocumentoChange(document.docType, 'lacre', value)}
                    agendamentoPhoto={envelopePhoto}
                    onPreviewAgendamentoPhoto={() =>
                      envelopePhoto
                        ? setPreviewPhoto({
                            src: envelopePhoto,
                            caption: `Foto do lacre do invólucro no agendamento do medidor ${meter}`,
                          })
                        : undefined
                    }
                  />
                  <ComparisonField
                    label="Lacre da tampa"
                    kind="text"
                    campo={canEditWpa ? wpaDraft.coverSeal : conference?.campoCoverSeal}
                    documento={documentoCoverSeal}
                    laboratorio={conference?.labCoverSeal}
                    agendamentoEmpty="Não aplicável"
                    laboratorioEmpty="Pendente"
                    campoEditable={canEditWpa}
                    documentoEditable={canEditWpa}
                    onCampoChange={(value) => handleWpaChange('coverSeal', value)}
                    onDocumentoChange={(value) =>
                      handleDocumentoChange(document.docType, 'coverSeal', value)
                    }
                  />
                  <ComparisonField
                    label="Leitura"
                    campo={canEditWpa ? wpaDraft.reading : conference?.campoReading}
                    documento={documentoReading}
                    laboratorio={conference?.labReading}
                    agendamentoEmpty="Não aplicável"
                    laboratorioEmpty="Pendente"
                    campoEditable={canEditWpa}
                    documentoEditable={canEditWpa}
                    onCampoChange={(value) => handleWpaChange('reading', value)}
                    onDocumentoChange={(value) =>
                      handleDocumentoChange(document.docType, 'reading', value)
                    }
                  />
                  <ComparisonField
                    label="Data de agendamento"
                    kind="date"
                    documento={documentoScheduledAt}
                    agendamento={conference?.scheduleScheduleDate}
                    laboratorio={conference?.labScheduleDate}
                    campoEmpty="Não aplicável"
                    laboratorioEmpty="Não aplicável"
                    documentoEditable={canEditWpa}
                    onDocumentoChange={(value) =>
                      handleDocumentoChange(document.docType, 'scheduledAt', value)
                    }
                    showAdjust={canEditWpa}
                    adjusting={adjustingDocType === document.docType}
                    onAdjust={() => void handleAdjustScheduleDate(document)}
                  />
                  {document.blockReason ? (
                    <div className="user-detail-full">
                      <dt>Motivo do bloqueio</dt>
                      <dd>{document.blockReason}</dd>
                    </div>
                  ) : null}
                </dl>

                <section className="inspection-photo-section" aria-label="Observações da análise">
                  <div className="inspection-photo-section-header">
                    <h4>Observações</h4>
                  </div>
                  {canEditWpa ? (
                    <label className="inspection-observations-label">
                      <textarea
                        className="inspection-observations-input"
                        rows={4}
                        maxLength={4000}
                        value={observations}
                        placeholder="Registre observações da análise de TOI e CSM"
                        onChange={(event) => handleObservationsChange(event.target.value)}
                      />
                    </label>
                  ) : (
                    <p className="inspection-observations-readonly">
                      {observations.trim() || 'Nenhuma observação registrada.'}
                    </p>
                  )}
                </section>

                <div className="inspection-document-card-actions">
                  <a
                    className="secondary-button"
                    href={api.getInspectionDocumentFileUrl(
                      document.meterScheduleId,
                      document.docType,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir PDF
                  </a>
                  <a
                    className="primary-button"
                    href={api.getInspectionDocumentDownloadUrl(
                      document.meterScheduleId,
                      document.docType,
                    )}
                    download
                  >
                    Baixar PDF
                  </a>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={uploadingPhotos}
                    onClick={openPhotoPicker}
                  >
                    {uploadingPhotos ? 'Enviando...' : 'Enviar fotos'}
                  </button>
                  {canDelete ? (
                    <button
                      type="button"
                      className="danger-button"
                      disabled={deletingDocType === document.docType}
                      onClick={() => void handleDeleteDocument(document)}
                    >
                      {deletingDocType === document.docType ? 'Excluindo...' : 'Excluir'}
                    </button>
                  ) : null}
                </div>
              </article>
            )
            })}
          </div>
        )}

        <section className="inspection-photo-section" aria-label="Fotos da análise">
            <div className="inspection-photo-section-header">
              <h4>Fotos</h4>
              <button
                type="button"
                className="secondary-button"
                disabled={uploadingPhotos}
                onClick={openPhotoPicker}
              >
                {uploadingPhotos ? 'Enviando...' : 'Enviar fotos'}
              </button>
            </div>
            {photos.length === 0 ? (
              <p className="entrada-panel-empty">Nenhuma foto enviada ainda.</p>
            ) : (
              <div className="inspection-photo-grid">
                {photos.map((photo) => (
                  <figure key={photo.id} className="inspection-photo-item">
                    <button
                      type="button"
                      className="inspection-photo-thumb-button"
                      onClick={() =>
                        setPreviewPhoto({
                          src: photo.photoData,
                          caption: photo.fileName || `Foto do medidor ${meter}`,
                        })
                      }
                      aria-label={`Ampliar foto ${photo.fileName || photo.id}`}
                    >
                      <img src={photo.photoData} alt={photo.fileName || 'Foto da análise'} />
                    </button>
                    {canManagePhotos ? (
                      <button
                        type="button"
                        className="inspection-photo-delete"
                        disabled={deletingPhotoId === photo.id}
                        onClick={() => void handleDeletePhoto(photo)}
                      >
                        {deletingPhotoId === photo.id ? 'Excluindo...' : 'Excluir'}
                      </button>
                    ) : null}
                  </figure>
                ))}
              </div>
            )}
          </section>

        <input
          id={photoInputId}
          ref={photoInputRef}
          className="file-picker-input"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(event) => void handlePhotoFiles(event.target.files)}
        />

        <div className="inspection-analysis-screen-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            Voltar
          </button>
        </div>
      </div>
      {previewPhoto ? (
        <div
          className="envelope-photo-lightbox"
          role="presentation"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="envelope-photo-lightbox-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Foto ampliada"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="icon-button schedule-slot-modal-close"
              onClick={() => setPreviewPhoto(null)}
              aria-label="Fechar"
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
            <p className="envelope-photo-lightbox-caption">{previewPhoto.caption}</p>
            <img
              className="envelope-photo-lightbox-image"
              src={previewPhoto.src}
              alt={previewPhoto.caption}
            />
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
