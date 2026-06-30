import { useState } from 'react'
import { RatmLaudoDetail } from './RatmLaudoDetail'
import type { RatmLaudo } from './laudos'

type RatmAprovacaoPanelProps = {
  laudos: RatmLaudo[]
}

export function RatmAprovacaoPanel({ laudos }: RatmAprovacaoPanelProps) {
  const [viewingLaudo, setViewingLaudo] = useState<RatmLaudo | null>(null)
  const pendingLaudos = laudos.filter((laudo) => laudo.status === 'Pendente')

  return (
    <>
      <p>Laudos de RATM aguardando aprovação após o ensaio.</p>

      <div className="approval-list" aria-label="Laudos de RATM pendentes">
        {pendingLaudos.length ? (
          pendingLaudos.map((laudo) => (
            <article key={laudo.id} className="approval-item">
              <div>
                <strong>Laudo RATM {laudo.ratmNumber}</strong>
                <span>Medidor: {laudo.meter}</span>
                <span>Cliente: {laudo.client}</span>
                <span>
                  Gerado em {new Date(laudo.createdAt).toLocaleString('pt-BR')}
                </span>
              </div>
              <div className="approval-item-actions">
                <button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={() => setViewingLaudo(laudo)}
                >
                  Visualizar laudo
                </button>
                <span className="status-badge">{laudo.status}</span>
              </div>
            </article>
          ))
        ) : (
          <p className="generated-password-empty">
            Nenhum laudo de RATM aguardando aprovação.
          </p>
        )}
      </div>

      {viewingLaudo ? (
        <RatmLaudoDetail laudo={viewingLaudo} onClose={() => setViewingLaudo(null)} />
      ) : null}
    </>
  )
}
