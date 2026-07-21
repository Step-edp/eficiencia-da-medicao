import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError } from '../api'
import { PdfInlineViewer } from './PdfInlineViewer'
import { mapRatmLaudoFromApi, type RatmLaudo } from './laudos'

function includesText(value: string, query: string) {
  if (!query.trim()) return true
  return value.toLowerCase().includes(query.trim().toLowerCase())
}

function toDateOnly(iso: string) {
  return iso.slice(0, 10)
}

export function ConsultarRatmPanel() {
  const [laudos, setLaudos] = useState<RatmLaudo[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )
  const [viewingLaudo, setViewingLaudo] = useState<RatmLaudo | null>(null)
  const [pdfVersion, setPdfVersion] = useState(1)

  const [meterFilter, setMeterFilter] = useState('')
  const [installationFilter, setInstallationFilter] = useState('')
  const [toiFilter, setToiFilter] = useState('')
  const [noteFilter, setNoteFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [idFilter, setIdFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')

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

  const filtered = useMemo(() => {
    return laudos.filter((laudo) => {
      const createdDay = toDateOnly(laudo.createdAt)
      const userLabel = `${laudo.createdByName ?? ''} ${laudo.createdByRegistration ?? ''}`
      const idLabel = `${laudo.id} ${laudo.ratmNumber}`

      if (!includesText(laudo.meter, meterFilter)) return false
      if (!includesText(laudo.installation ?? '', installationFilter)) return false
      if (!includesText(laudo.toi ?? '', toiFilter)) return false
      if (!includesText(laudo.note ?? '', noteFilter)) return false
      if (!includesText(laudo.client, clientFilter)) return false
      if (!includesText(idLabel, idFilter)) return false
      if (!includesText(userLabel, userFilter)) return false
      if (dateFilter && createdDay !== dateFilter) return false
      if (periodStart && createdDay < periodStart) return false
      if (periodEnd && createdDay > periodEnd) return false
      return true
    })
  }, [
    laudos,
    meterFilter,
    installationFilter,
    toiFilter,
    noteFilter,
    clientFilter,
    idFilter,
    userFilter,
    dateFilter,
    periodStart,
    periodEnd,
  ])

  return (
    <div className="consultar-ratm-panel">
      <p className="csds-form-hint">
        Pesquise laudos RATM gerados e abra o PDF correspondente.
      </p>

      <div className="gallery-filters consultar-ratm-filters">
        <label>
          Medidor
          <input
            type="text"
            value={meterFilter}
            onChange={(event) => setMeterFilter(event.target.value)}
            placeholder="Número do medidor"
          />
        </label>
        <label>
          Instalação
          <input
            type="text"
            value={installationFilter}
            onChange={(event) => setInstallationFilter(event.target.value)}
            placeholder="Instalação"
          />
        </label>
        <label>
          TOI
          <input
            type="text"
            value={toiFilter}
            onChange={(event) => setToiFilter(event.target.value)}
            placeholder="TOI"
          />
        </label>
        <label>
          Nota
          <input
            type="text"
            value={noteFilter}
            onChange={(event) => setNoteFilter(event.target.value)}
            placeholder="Nota"
          />
        </label>
        <label>
          Cliente
          <input
            type="text"
            value={clientFilter}
            onChange={(event) => setClientFilter(event.target.value)}
            placeholder="Cliente"
          />
        </label>
        <label>
          ID
          <input
            type="text"
            value={idFilter}
            onChange={(event) => setIdFilter(event.target.value)}
            placeholder="ID ou número do RATM"
          />
        </label>
        <label>
          Usuário
          <input
            type="text"
            value={userFilter}
            onChange={(event) => setUserFilter(event.target.value)}
            placeholder="Nome ou matrícula"
          />
        </label>
        <label>
          Data
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          />
        </label>
        <label>
          Período · início
          <input
            type="date"
            value={periodStart}
            onChange={(event) => setPeriodStart(event.target.value)}
          />
        </label>
        <label>
          Período · fim
          <input
            type="date"
            value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
            min={periodStart || undefined}
          />
        </label>
      </div>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">Carregando laudos...</p>
      ) : filtered.length === 0 ? (
        <p className="entrada-panel-empty">Nenhum laudo encontrado com esses filtros.</p>
      ) : (
        <div className="approval-list" aria-label="Laudos RATM encontrados">
          {filtered.map((laudo) => (
            <article key={laudo.id} className="approval-item">
              <div>
                <strong>Laudo RATM {laudo.ratmNumber}</strong>
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
                <span className="status-badge">{laudo.status}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {viewingLaudo
        ? createPortal(
            <div
              className="laudo-modal-overlay"
              role="presentation"
              onClick={() => setViewingLaudo(null)}
            >
              <div
                className="laudo-modal consultar-ratm-pdf-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="consultar-ratm-pdf-title"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="laudo-modal-header">
                  <div>
                    <h3 id="consultar-ratm-pdf-title">
                      PDF · Laudo RATM {viewingLaudo.ratmNumber}
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
