import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, type InspectionDocumentRecord, type InspectionDocumentType } from '../api'

function documentTypeLabel(docType: InspectionDocumentType) {
  if (docType === 'toi') return 'TOI'
  if (docType === 'comunicado') return 'CSM'
  if (docType === 'ambos') return 'TOI + CSM'
  return 'Documento'
}

function sortInspectionDocuments(documents: InspectionDocumentRecord[]) {
  const order: Record<string, number> = { ambos: 0, toi: 1, comunicado: 2 }
  return [...documents].sort(
    (left, right) => (order[left.docType] ?? 9) - (order[right.docType] ?? 9),
  )
}

type RatmDocumentFabProps = {
  scheduleId: string
  meter: string
}

export function RatmDocumentFab({ scheduleId, meter }: RatmDocumentFabProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [documents, setDocuments] = useState<InspectionDocumentRecord[]>([])
  const [activeDocType, setActiveDocType] = useState<InspectionDocumentType | null>(null)

  useEffect(() => {
    setOpen(false)
    setDocuments([])
    setActiveDocType(null)
    setError('')
  }, [scheduleId])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const handleOpen = async () => {
    setOpen(true)
    setLoading(true)
    setError('')

    try {
      const response = await api.listInspectionDocuments(scheduleId)
      const nextDocuments = sortInspectionDocuments(response.documents || [])
      setDocuments(nextDocuments)
      setActiveDocType(nextDocuments[0]?.docType ?? null)
      if (!nextDocuments.length) {
        setError(`Nenhum documento de inspeção anexado ao medidor ${meter || '—'}.`)
      }
    } catch (caught) {
      setDocuments([])
      setActiveDocType(null)
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Não foi possível carregar o documento de inspeção.',
      )
    } finally {
      setLoading(false)
    }
  }

  const activeDocument = documents.find((document) => document.docType === activeDocType) ?? null

  return (
    <>
      {open ? null : (
        <button
          type="button"
          className="ratm-doc-fab"
          onClick={() => void handleOpen()}
          aria-label="Exibir documento de inspeção"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 1.5V9h4.5L14 4.5ZM8 12h8v1.5H8V12Zm0 3.5h8V17H8v-1.5Zm0 3.5h5V20H8v-1.5Z"
            />
          </svg>
          Exibir documento
        </button>
      )}

      {open
        ? createPortal(
            <div
              className="ratm-doc-viewer-overlay"
              role="presentation"
              onClick={() => setOpen(false)}
            >
              <div
                className="ratm-doc-viewer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ratm-doc-viewer-title"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="ratm-doc-viewer-header">
                  <div>
                    <h3 id="ratm-doc-viewer-title">Documento de inspeção</h3>
                    <p>Medidor {meter || '—'}</p>
                  </div>
                  <div className="ratm-doc-viewer-header-actions">
                    {activeDocument ? (
                      <a
                        className="secondary-button"
                        href={api.getInspectionDocumentFileUrl(
                          activeDocument.meterScheduleId,
                          activeDocument.docType,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir em nova aba
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setOpen(false)}
                      aria-label="Fechar documento"
                      title="Fechar"
                    >
                      ×
                    </button>
                  </div>
                </header>

                {documents.length > 1 ? (
                  <div className="ratm-doc-viewer-tabs" role="tablist" aria-label="Documentos">
                    {documents.map((document) => (
                      <button
                        key={document.id}
                        type="button"
                        role="tab"
                        aria-selected={document.docType === activeDocType}
                        className={`ratm-doc-viewer-tab${
                          document.docType === activeDocType ? ' is-active' : ''
                        }`}
                        onClick={() => setActiveDocType(document.docType)}
                      >
                        {documentTypeLabel(document.docType)}
                      </button>
                    ))}
                  </div>
                ) : null}

                {loading ? (
                  <p className="ratm-doc-viewer-status">Carregando documento…</p>
                ) : error ? (
                  <p className="ratm-doc-viewer-status" role="alert">
                    {error}
                  </p>
                ) : activeDocument ? (
                  <iframe
                    className="ratm-doc-viewer-frame"
                    title={documentTypeLabel(activeDocument.docType)}
                    src={api.getInspectionDocumentFileUrl(
                      activeDocument.meterScheduleId,
                      activeDocument.docType,
                    )}
                  />
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
