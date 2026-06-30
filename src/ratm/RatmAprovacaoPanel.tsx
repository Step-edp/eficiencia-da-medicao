import { useState } from 'react'
import { downloadRatmLaudoPdf, openRatmLaudoPdf } from './laudoPdf'
import type { RatmLaudo } from './laudos'

type RatmAprovacaoPanelProps = {
  laudos: RatmLaudo[]
}

export function RatmAprovacaoPanel({ laudos }: RatmAprovacaoPanelProps) {
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [loadingLaudoId, setLoadingLaudoId] = useState<string | null>(null)
  const pendingLaudos = laudos.filter((laudo) => laudo.status === 'Pendente')

  const handlePdfAction = async (
    laudo: RatmLaudo,
    action: 'view' | 'download',
  ) => {
    setLoadingLaudoId(laudo.id)
    setFeedback(null)

    try {
      const filename = `laudo-ratm-${laudo.ratmNumber}-${laudo.meter}.pdf`

      if (action === 'view') {
        await openRatmLaudoPdf(laudo.id)
      } else {
        await downloadRatmLaudoPdf(laudo.id, filename)
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível abrir o laudo em PDF.',
      })
    } finally {
      setLoadingLaudoId(null)
    }
  }

  return (
    <>
      <p>
        Laudos oficiais de perícia metrológica aguardando aprovação. Cada registro
        possui laudo técnico em PDF.
      </p>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

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
                  disabled={loadingLaudoId === laudo.id}
                  onClick={() => handlePdfAction(laudo, 'view')}
                >
                  Visualizar laudo PDF
                </button>
                <button
                  className="primary-button compact-button"
                  type="button"
                  disabled={loadingLaudoId === laudo.id}
                  onClick={() => handlePdfAction(laudo, 'download')}
                >
                  Baixar PDF
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
    </>
  )
}
