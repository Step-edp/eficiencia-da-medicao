import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, type InspectionDocumentRecord, type InspectionDocumentType } from './api'
import { LoginFeedback } from './LoginFeedback'

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

type ComparisonFieldProps = {
  label: string
  documentValue: string | null | undefined
  registeredValue: string | null | undefined
  matches: boolean | null | undefined
}

function ComparisonField({
  label,
  documentValue,
  registeredValue,
  matches,
}: ComparisonFieldProps) {
  return (
    <div className="inspection-document-comparison">
      <dt>{label}</dt>
      <dd>
        <div className="inspection-document-comparison-grid">
          <div className="inspection-document-comparison-item">
            <span className="inspection-document-comparison-label">No documento</span>
            <strong>{documentValue?.trim() || '—'}</strong>
          </div>
          <div className="inspection-document-comparison-item">
            <span className="inspection-document-comparison-label">Cadastrado</span>
            <strong>{registeredValue?.trim() || '—'}</strong>
          </div>
          <MatchIndicator matches={matches} />
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
  const [registeredLacre, setRegisteredLacre] = useState<string | null>(null)
  const [registeredCoverSeal, setRegisteredCoverSeal] = useState<string | null>(null)
  const [registeredReading, setRegisteredReading] = useState<string | null>(null)
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
      setRegisteredLacre(response.registeredLacre)
      setRegisteredCoverSeal(response.registeredCoverSeal)
      setRegisteredReading(response.registeredReading)
    } catch {
      setDocuments([])
      setComplete(false)
      setCanDelete(false)
      setDeleteBlockedReason(null)
      setRegisteredMeter(meter)
      setRegisteredLacre(null)
      setRegisteredCoverSeal(null)
      setRegisteredReading(null)
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
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

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
                    documentValue={document.extractedMeter}
                    registeredValue={document.registeredMeter ?? registeredMeter}
                    matches={document.meterMatches}
                  />
                  <ComparisonField
                    label="Lacre do invólucro"
                    documentValue={document.extractedLacre}
                    registeredValue={document.registeredLacre ?? registeredLacre}
                    matches={document.lacreMatches}
                  />
                  <ComparisonField
                    label="Lacre da tampa"
                    documentValue={document.extractedCoverSeal}
                    registeredValue={document.registeredCoverSeal ?? registeredCoverSeal}
                    matches={document.coverSealMatches}
                  />
                  <ComparisonField
                    label="Leitura"
                    documentValue={document.extractedReading}
                    registeredValue={document.registeredReading ?? registeredReading}
                    matches={document.readingMatches}
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

        <div className="inspection-analysis-screen-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            Voltar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
