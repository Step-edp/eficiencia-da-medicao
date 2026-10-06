import { useMemo, useState } from 'react'
import { RatmLaudoViewer } from './RatmLaudoViewer'
import { formatRatmLaudoNumber, type RatmLaudo } from './laudos'
import { openRatmLaudoPdf } from './laudoPdf'

type RatmAprovacaoPanelProps = {
  laudos: RatmLaudo[]
  onLaudoUpdated: (laudo: RatmLaudo) => void
  onLaudoApproved: (laudo: RatmLaudo) => void
  readOnly?: boolean
  approverUserId?: string
  approverIsLab?: boolean
}

export function RatmAprovacaoPanel({
  laudos,
  onLaudoUpdated,
  onLaudoApproved,
  readOnly = false,
  approverUserId,
  approverIsLab = false,
}: RatmAprovacaoPanelProps) {
  const [viewingLaudo, setViewingLaudo] = useState<RatmLaudo | null>(null)
  const [viewerMode, setViewerMode] = useState<'view' | 'edit'>('view')
  const [search, setSearch] = useState('')
  const pendingLaudos = laudos.filter((laudo) => laudo.status === 'Pendente' && !laudo.revokedAt)
  const visibleLaudos = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR')
    if (!query) return pendingLaudos
    return pendingLaudos.filter((laudo) => {
      const haystack = [
        formatRatmLaudoNumber(laudo.ratmNumber, laudo.createdAt),
        laudo.meter,
        laudo.client,
        new Date(laudo.createdAt).toLocaleString('pt-BR'),
      ]
        .join(' ')
        .toLocaleLowerCase('pt-BR')
      return haystack.includes(query)
    })
  }, [pendingLaudos, search])

  return (
    <>
      <label className="approval-search">
        Pesquisar
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Laudo, medidor ou cliente"
        />
      </label>

      <div className="approval-list" aria-label="Laudos de RATM pendentes">
        {pendingLaudos.length === 0 ? (
          <p className="generated-password-empty">
            Nenhum laudo de RATM aguardando aprovação.
          </p>
        ) : visibleLaudos.length === 0 ? (
          <p className="generated-password-empty">
            Nenhum laudo encontrado com essa pesquisa.
          </p>
        ) : (
          visibleLaudos.map((laudo) => (
            <article key={laudo.id} className="approval-item">
              <div className="approval-item-info">
                <strong>Laudo {formatRatmLaudoNumber(laudo.ratmNumber, laudo.createdAt)}</strong>
                <span>Medidor: {laudo.meter}</span>
                <span>Cliente: {laudo.client}</span>
                <span>Gerado em {new Date(laudo.createdAt).toLocaleString('pt-BR')}</span>
              </div>
              <div className="approval-item-actions">
                <button
                  className="secondary-button approval-action-button"
                  type="button"
                  onClick={() => openRatmLaudoPdf(laudo.id)}
                >
                  Visualizar PDF
                </button>
                {readOnly ? null : (
                  <button
                    className="secondary-button approval-action-button"
                    type="button"
                    onClick={() => {
                      setViewerMode('edit')
                      setViewingLaudo(laudo)
                    }}
                  >
                    Editar
                  </button>
                )}
                {readOnly ? null : (
                  <button
                    className="secondary-button approval-action-button"
                    type="button"
                    onClick={() => {
                      setViewerMode('view')
                      setViewingLaudo(laudo)
                    }}
                  >
                    Aprovar
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      {viewingLaudo ? (
        <RatmLaudoViewer
          laudo={viewingLaudo}
          initialMode={viewerMode}
          readOnly={readOnly}
          approverUserId={approverUserId}
          approverIsLab={approverIsLab}
          onClose={() => setViewingLaudo(null)}
          onUpdated={(laudo) => {
            onLaudoUpdated(laudo)
            setViewingLaudo(laudo)
          }}
          onApproved={(laudo) => {
            onLaudoApproved(laudo)
            setViewingLaudo(null)
          }}
        />
      ) : null}
    </>
  )
}
