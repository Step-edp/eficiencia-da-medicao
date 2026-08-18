import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type InspectionDocumentRecord, type InspectionDocumentType } from './api'

type InspectionDocumentAnalysisModalProps = {
  meter: string
  scheduleId: string
  onClose: () => void
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
}: InspectionDocumentAnalysisModalProps) {
  const [loading, setLoading] = useState(true)
  const [documents, setDocuments] = useState<InspectionDocumentRecord[]>([])
  const [complete, setComplete] = useState(false)
  const [registeredMeter, setRegisteredMeter] = useState(meter)
  const [registeredLacre, setRegisteredLacre] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const response = await api.listInspectionDocuments(scheduleId)
        if (cancelled) return
        setDocuments(response.documents)
        setComplete(response.complete)
        setRegisteredMeter(response.meter)
        setRegisteredLacre(response.registeredLacre)
      } catch {
        if (!cancelled) {
          setDocuments([])
          setComplete(false)
          setRegisteredMeter(meter)
          setRegisteredLacre(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [meter, scheduleId])

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="ensaios-block-modal demm-modal inspection-document-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspection-document-title"
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

        <h3 id="inspection-document-title">Documento de inspeção — medidor {meter}</h3>
        <p className="demm-modal-intro">
          {complete
            ? 'TOI e CSM anexados. Confira a análise e baixe o PDF.'
            : 'Análise dos documentos já anexados a este medidor.'}
        </p>

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
                    <dt>Arquivo</dt>
                    <dd>{document.fileName}</dd>
                  </div>
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
                    href={api.getInspectionDocumentFileUrl(scheduleId, document.docType)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir PDF
                  </a>
                  <a
                    className="primary-button"
                    href={api.getInspectionDocumentDownloadUrl(scheduleId, document.docType)}
                    download
                  >
                    Baixar PDF
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}

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
