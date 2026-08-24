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

function displayConferenceValue(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : '—'
}

function normalizeConferenceDigits(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null
  return digits.replace(/^0+/, '') || '0'
}

function conferenceMatches(values: Array<string | null | undefined>): boolean | null {
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
}: {
  label: string
  campo?: string | null
  documento?: string | null
  agendamento?: string | null
  laboratorio?: string | null
}) {
  return (
    <div className="inspection-document-comparison">
      <dt>{label}</dt>
      <dd>
        <div className="inspection-document-comparison-grid is-four">
          <div className="inspection-document-comparison-item">
            <span className="inspection-document-comparison-label">Campo</span>
            <strong>{displayConferenceValue(campo)}</strong>
          </div>
          <div className="inspection-document-comparison-item">
            <span className="inspection-document-comparison-label">Documento</span>
            <strong>{displayConferenceValue(documento)}</strong>
          </div>
          <div className="inspection-document-comparison-item">
            <span className="inspection-document-comparison-label">Agendamento</span>
            <strong>{displayConferenceValue(agendamento)}</strong>
          </div>
          <div className="inspection-document-comparison-item">
            <span className="inspection-document-comparison-label">Laboratório</span>
            <strong>{displayConferenceValue(laboratorio)}</strong>
          </div>
          <MatchIndicator matches={conferenceMatches([campo, documento, agendamento, laboratorio])} />
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
  const [complete, setComplete] = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [deleteBlockedReason, setDeleteBlockedReason] = useState<string | null>(null)
  const [registeredMeter, setRegisteredMeter] = useState(meter)
  const [conference, setConference] = useState<InspectionDocumentConference | null>(null)
  const [photos, setPhotos] = useState<InspectionPhotoRecord[]>([])
  const [canManagePhotos, setCanManagePhotos] = useState(false)
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)
  const [previewPhoto, setPreviewPhoto] = useState<InspectionPhotoRecord | null>(null)
  const photoInputId = useId()
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const [deletingDocType, setDeletingDocType] = useState<InspectionDocumentType | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const response = await api.listInspectionDocuments(scheduleId)
      setDocuments(response.documents)
      setComplete(response.complete)
      setCanDelete(response.canDelete)
      setDeleteBlockedReason(response.deleteBlockedReason)
      setRegisteredMeter(response.meter)
      setConference(
        response.conference ?? {
          campoMeter: response.meter,
          campoLacre: response.registeredLacre,
          campoCoverSeal: response.registeredCoverSeal ?? null,
          campoReading: response.registeredReading ?? null,
          scheduleMeter: response.meter,
          scheduleLacre: response.registeredLacre,
          scheduleCoverSeal: response.registeredCoverSeal ?? null,
          scheduleReading: response.registeredReading ?? null,
          labMeter: null,
          labLacre: null,
          labCoverSeal: null,
          labReading: null,
        },
      )
      setPhotos(response.photos ?? [])
      setCanManagePhotos(Boolean(response.canManagePhotos))
    } catch {
      setDocuments([])
      setComplete(false)
      setCanDelete(false)
      setDeleteBlockedReason(null)
      setRegisteredMeter(meter)
      setConference(null)
      setPhotos([])
      setCanManagePhotos(false)
    } finally {
      setLoading(false)
    }
  }, [meter, scheduleId])

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

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
      if (previewPhoto?.id === photo.id) setPreviewPhoto(null)
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
          <p className="demm-modal-intro">
            {complete
              ? 'TOI e CSM anexados. Confira a análise e baixe o PDF.'
              : 'Análise dos documentos já anexados a este medidor.'}
          </p>
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
            {documents.map((document) => (
              <article key={document.id} className="inspection-document-card">
                <div className="inspection-document-card-header">
                  <strong>{inspectionDocTypeLabel(document.docType)}</strong>
                  <span
                    className={`inspection-document-status ${document.blocked ? 'is-blocked' : 'is-ok'}`}
                  >
                    {document.blocked ? 'Bloqueado' : 'OK'}
                  </span>
                </div>

                <dl className="user-detail-grid schedule-detail-grid">
                  <div>
                    <dt>Anexado em</dt>
                    <dd>{formatDateTime(document.createdAt)}</dd>
                  </div>
                  <ComparisonField
                    label="Medidor"
                    campo={conference?.campoMeter ?? registeredMeter}
                    documento={document.extractedMeter}
                    agendamento={conference?.scheduleMeter ?? document.registeredMeter ?? registeredMeter}
                    laboratorio={conference?.labMeter}
                  />
                  <ComparisonField
                    label="Lacre do invólucro"
                    campo={conference?.campoLacre}
                    documento={document.extractedLacre}
                    agendamento={conference?.scheduleLacre ?? document.registeredLacre}
                    laboratorio={conference?.labLacre}
                  />
                  <ComparisonField
                    label="Lacre da tampa"
                    campo={conference?.campoCoverSeal}
                    documento={document.extractedCoverSeal}
                    agendamento={conference?.scheduleCoverSeal ?? document.registeredCoverSeal}
                    laboratorio={conference?.labCoverSeal}
                  />
                  <ComparisonField
                    label="Leitura"
                    campo={conference?.campoReading}
                    documento={document.extractedReading}
                    agendamento={conference?.scheduleReading ?? document.registeredReading}
                    laboratorio={conference?.labReading}
                  />
                  {document.blockReason ? (
                    <div className="user-detail-full">
                      <dt>Motivo do bloqueio</dt>
                      <dd>{document.blockReason}</dd>
                    </div>
                  ) : null}
                </dl>

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
                  {canManagePhotos ? (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={uploadingPhotos}
                      onClick={openPhotoPicker}
                    >
                      {uploadingPhotos ? 'Enviando...' : 'Enviar fotos'}
                    </button>
                  ) : null}
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
            ))}
          </div>
        )}

        {photos.length > 0 || canManagePhotos ? (
          <section className="inspection-photo-section" aria-label="Fotos da análise">
            <div className="inspection-photo-section-header">
              <h4>Fotos</h4>
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
                      onClick={() => setPreviewPhoto(photo)}
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
        ) : null}

        <input
          id={photoInputId}
          ref={photoInputRef}
          className="file-picker-input"
          type="file"
          accept="image/*"
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
            <p className="envelope-photo-lightbox-caption">
              {previewPhoto.fileName || `Foto do medidor ${meter}`}
            </p>
            <img
              className="envelope-photo-lightbox-image"
              src={previewPhoto.photoData}
              alt={previewPhoto.fileName || `Foto do medidor ${meter}`}
            />
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
