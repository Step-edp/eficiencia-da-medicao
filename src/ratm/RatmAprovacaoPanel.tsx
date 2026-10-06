import { useState } from 'react'
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
  const [pdfError, setPdfError] = useState('')
  const pendingLaudos = laudos.filter((laudo) => laudo.status === 'Pendente' && !laudo.revokedAt)

  const handleOpenPdf = (laudoId: string) => {
    try {
      setPdfError('')
      openRatmLaudoPdf(laudoId)
    } catch (error) {
      setPdfError(
        error instanceof Error ? error.message : 'Não foi possível abrir o PDF no navegador.',
      )
    }
  }

  return (
    <>
      <p>
        {readOnly
          ? 'Laudos de RATM pendentes de aprovação (somente visualização).'
          : 'Laudos oficiais de perícia metrológica aguardando aprovação. Visualize o PDF, edite se necessário e aprove o laudo dentro do aplicativo.'}
      </p>

      {pdfError ? (
        <p className="generated-password-empty" role="alert">
          {pdfError}
        </p>
      ) : null}

      <div className="approval-list" aria-label="Laudos de RATM pendentes">
        {pendingLaudos.length ? (
          pendingLaudos.map((laudo) => (
            <article key={laudo.id} className="approval-item">
              <div>
                <strong>Laudo {formatRatmLaudoNumber(laudo.ratmNumber, laudo.createdAt)}</strong>
                <span>Medidor: {laudo.meter}</span>
                <span>Cliente: {laudo.client}</span>
                <span>
                  Gerado em {new Date(laudo.createdAt).toLocaleString('pt-BR')}
                </span>
              </div>
              <div className="approval-item-actions">
                <button
                  className="secondary-button approval-action-button"
                  type="button"
                  onClick={() => handleOpenPdf(laudo.id)}
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
        ) : (
          <p className="generated-password-empty">
            Nenhum laudo de RATM aguardando aprovação.
          </p>
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
