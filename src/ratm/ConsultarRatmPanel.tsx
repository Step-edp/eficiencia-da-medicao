import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError } from '../api'
import { PdfInlineViewer } from './PdfInlineViewer'
import { formatRatmLaudoNumber, mapRatmLaudoFromApi, type RatmLaudo } from './laudos'

function laudoSearchText(laudo: RatmLaudo) {
  const created = new Date(laudo.createdAt)
  const dateLabel = Number.isNaN(created.getTime()) ? '' : created.toLocaleString('pt-BR')
  return [
    laudo.meter,
    laudo.installation,
    laudo.toi,
    laudo.note,
    laudo.client,
    laudo.id,
    String(laudo.ratmNumber),
    formatRatmLaudoNumber(laudo.ratmNumber, laudo.createdAt),
    laudo.createdByName,
    laudo.createdByRegistration,
    laudo.status,
    laudo.revokedAt ? 'Revogado' : '',
    dateLabel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function ConsultarRatmPanel({ isAdmin = false }: { isAdmin?: boolean }) {
  const [laudos, setLaudos] = useState<RatmLaudo[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )
  const [viewingLaudo, setViewingLaudo] = useState<RatmLaudo | null>(null)
  const [pdfVersion, setPdfVersion] = useState(1)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const { laudos: rows } = await api.listRatmLaudos()
      setLaudos(rows.map(mapRatmLaudoFromApi))
    } catch (error) {
      setLaudos([])
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os laudos RATM.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const deleteLaudo = async (laudo: RatmLaudo) => {
    const number = formatRatmLaudoNumber(laudo.ratmNumber, laudo.createdAt)
    const confirmed = window.confirm(`Excluir o laudo ${number} do medidor ${laudo.meter}?`)
    if (!confirmed) return

    setDeletingId(laudo.id)
    setFeedback(null)
    try {
      await api.deleteRatmLaudo(laudo.id)
      setLaudos((current) => current.filter((item) => item.id !== laudo.id))
      if (viewingLaudo?.id === laudo.id) setViewingLaudo(null)
      setFeedback({ type: 'success', message: `Laudo ${number} excluído.` })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof ApiError ? error.message : 'Não foi possível excluir o laudo.',
      })
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = useMemo(() => {
    const tokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return laudos
    return laudos.filter((laudo) => {
      const haystack = laudoSearchText(laudo)
      return tokens.every((token) => haystack.includes(token))
    })
  }, [laudos, searchQuery])

  return (
    <div className="consultar-ratm-panel">
      <p className="csds-form-hint">
        Pesquise laudos RATM gerados e abra o PDF correspondente.
      </p>

      <label className="consultar-search">
        <span className="sr-only">Pesquisar</span>
        <span className="consultar-search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
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
          placeholder="Pesquisar por medidor, instalação, TOI, nota, cliente, ID, usuário ou data…"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">Carregando laudos...</p>
      ) : filtered.length === 0 ? (
        <p className="entrada-panel-empty">Nenhum laudo encontrado.</p>
      ) : (
        <div className="approval-list" aria-label="Laudos RATM encontrados">
          {filtered.map((laudo) => (
            <article key={laudo.id} className="approval-item">
              <div className="approval-item-info">
                <strong>Laudo {formatRatmLaudoNumber(laudo.ratmNumber, laudo.createdAt)}</strong>
                <span>ID: {laudo.id}</span>
                <span>Medidor: {laudo.meter}</span>
                <span>Cliente: {laudo.client}</span>
                {laudo.installation ? <span>Instalação: {laudo.installation}</span> : null}
                {laudo.toi ? <span>TOI: {laudo.toi}</span> : null}
                {laudo.note ? <span>Nota: {laudo.note}</span> : null}
                <span>
                  Usuário:{' '}
                  {laudo.createdByName || laudo.createdByRegistration
                    ? `${laudo.createdByName || '—'}${
                        laudo.createdByRegistration
                          ? ` (${laudo.createdByRegistration})`
                          : ''
                      }`
                    : '—'}
                </span>
                <span>
                  Gerado em {new Date(laudo.createdAt).toLocaleString('pt-BR')}
                </span>
              </div>
              <div className="approval-item-actions">
                <button
                  className="primary-button compact-button"
                  type="button"
                  onClick={() => {
                    setViewingLaudo(laudo)
                    setPdfVersion((current) => current + 1)
                    setFeedback(null)
                  }}
                >
                  Ver PDF
                </button>
                {isAdmin ? (
                  <button
                    className="danger-button compact-button"
                    type="button"
                    disabled={deletingId === laudo.id}
                    onClick={() => void deleteLaudo(laudo)}
                  >
                    Excluir
                  </button>
                ) : null}
                <span className="status-badge">{laudo.revokedAt ? 'Revogado' : laudo.status}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {viewingLaudo
        ? createPortal(
            <div
              className="ensaios-block-modal-overlay"
              role="presentation"
              onClick={() => setViewingLaudo(null)}
            >
              <div
                className="ensaios-block-modal consultar-ratm-pdf-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="consultar-ratm-pdf-title"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="consultar-ratm-pdf-header">
                  <div>
                    <h3 id="consultar-ratm-pdf-title">
                      PDF · Laudo {formatRatmLaudoNumber(viewingLaudo.ratmNumber, viewingLaudo.createdAt)}
                    </h3>
                    <p>
                      Medidor {viewingLaudo.meter}
                      {viewingLaudo.client ? ` · ${viewingLaudo.client}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button compact-button"
                    onClick={() => setViewingLaudo(null)}
                  >
                    Fechar
                  </button>
                </header>
                <PdfInlineViewer
                  laudoId={viewingLaudo.id}
                  version={pdfVersion}
                  onLoadError={(message) =>
                    setFeedback({ type: 'error', message })
                  }
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
