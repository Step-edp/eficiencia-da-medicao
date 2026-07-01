import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { RatmFormFields } from './RatmFormFields'
import { PdfInlineViewer } from './PdfInlineViewer'
import { mapRatmLaudoFromApi, type RatmLaudo } from './laudos'
import { createEmptyRatmForm, type RatmFormData } from './types'

type RatmLaudoViewerProps = {
  laudo: RatmLaudo
  onClose: () => void
  onUpdated: (laudo: RatmLaudo) => void
  onApproved: (laudo: RatmLaudo) => void
}

function laudoToFormData(laudo: RatmLaudo): RatmFormData {
  return {
    ...createEmptyRatmForm(),
    ...(laudo.formData as RatmFormData),
  }
}

export function RatmLaudoViewer({
  laudo,
  onClose,
  onUpdated,
  onApproved,
}: RatmLaudoViewerProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [currentLaudo, setCurrentLaudo] = useState(laudo)
  const [formData, setFormData] = useState<RatmFormData>(() => laudoToFormData(laudo))
  const [pdfVersion, setPdfVersion] = useState(1)
  const [actionLoading, setActionLoading] = useState(false)
  const [clientPresent, setClientPresent] = useState<'Sim' | 'Não' | ''>(() => {
    const value = laudoToFormData(laudo).clientAccompanied
    return value === 'Sim' || value === 'Não' ? value : ''
  })
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const handlePdfLoadError = (message: string) => {
    setFeedback({
      type: 'error',
      message,
    })
  }

  const refreshPdf = () => {
    setPdfVersion((previous) => previous + 1)
  }

  useEffect(() => {
    document.body.classList.add('laudo-viewer-open')

    return () => {
      document.body.classList.remove('laudo-viewer-open')
    }
  }, [])

  const handleSaveEdit = async () => {
    if (!formData.meter.trim()) {
      setFeedback({
        type: 'error',
        message: 'Informe o medidor antes de salvar as alterações.',
      })
      return
    }

    setActionLoading(true)
    setFeedback(null)

    try {
      const response = await api.updateRatmLaudo(currentLaudo.id, formData)
      const updatedLaudo = mapRatmLaudoFromApi(response.laudo)
      setCurrentLaudo(updatedLaudo)
      setFormData(laudoToFormData(updatedLaudo))
      setMode('view')
      onUpdated(updatedLaudo)
      refreshPdf()
      setFeedback({
        type: 'success',
        message: 'Laudo atualizado com sucesso.',
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar as alterações do laudo.',
      })
    } finally {
      setActionLoading(false)
    }
  }

  const handleApproveClick = () => {
    if (!clientPresent) {
      setFeedback({
        type: 'error',
        message: 'Informe se o cliente está presente antes de aprovar o laudo.',
      })
      return
    }

    setFeedback(null)
    setShowApproveConfirm(true)
  }

  const handleConfirmApprove = async () => {
    if (!clientPresent) {
      return
    }

    setActionLoading(true)
    setFeedback(null)

    try {
      const response = await api.approveRatmLaudo(currentLaudo.id, clientPresent)
      const approvedLaudo = mapRatmLaudoFromApi(response.laudo)
      setShowApproveConfirm(false)
      onApproved(approvedLaudo)
      onClose()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Não foi possível aprovar o laudo.',
      })
    } finally {
      setActionLoading(false)
    }
  }

  return createPortal(
    <div className="laudo-modal-overlay" role="presentation" onClick={onClose}>
      <section
        className="laudo-viewer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="laudo-viewer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="laudo-viewer-header">
          <div>
            <p className="section-tag">Laudo RATM</p>
            <h3 id="laudo-viewer-title">
              Medidor {currentLaudo.meter} — RATM {currentLaudo.ratmNumber}
            </h3>
          </div>
          <button className="secondary-button compact-button" type="button" onClick={onClose}>
            Fechar
          </button>
        </header>

        {feedback ? (
          <div className={`login-feedback ${feedback.type}`} role="status">
            {feedback.message}
          </div>
        ) : null}

        <div className="laudo-viewer-main">
          {mode === 'view' ? (
            <div className="laudo-viewer-body">
              <PdfInlineViewer
                laudoId={currentLaudo.id}
                version={pdfVersion}
                onLoadError={handlePdfLoadError}
              />
            </div>
          ) : (
            <div className="laudo-viewer-edit">
              <RatmFormFields
                index={0}
                total={1}
                data={formData}
                onChange={(patch) => setFormData((previous) => ({ ...previous, ...patch }))}
                onScan={() => undefined}
              />
            </div>
          )}
        </div>

        {mode === 'view' && currentLaudo.status === 'Pendente' ? (
          <fieldset className="laudo-client-present radio-fieldset">
            <legend>Cliente presente</legend>
            <div className="radio-group">
              <label className="radio-option">
                <input
                  type="radio"
                  name={`client-present-${currentLaudo.id}`}
                  value="Sim"
                  checked={clientPresent === 'Sim'}
                  disabled={actionLoading}
                  onChange={() => {
                    setClientPresent('Sim')
                    setFeedback(null)
                  }}
                />
                <span>Sim</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name={`client-present-${currentLaudo.id}`}
                  value="Não"
                  checked={clientPresent === 'Não'}
                  disabled={actionLoading}
                  onChange={() => {
                    setClientPresent('Não')
                    setFeedback(null)
                  }}
                />
                <span>Não</span>
              </label>
            </div>
          </fieldset>
        ) : null}

        <div className="laudo-viewer-actions">
          {mode === 'view' ? (
            <>
              <button
                className="secondary-button"
                type="button"
                disabled={actionLoading || currentLaudo.status !== 'Pendente'}
                onClick={() => {
                  setFormData(laudoToFormData(currentLaudo))
                  setMode('edit')
                }}
              >
                Editar
              </button>
              <button
                className="reserve-button"
                type="button"
                disabled={actionLoading || currentLaudo.status !== 'Pendente' || !clientPresent}
                onClick={handleApproveClick}
              >
                Aprovar
              </button>
            </>
          ) : (
            <>
              <button
                className="secondary-button"
                type="button"
                disabled={actionLoading}
                onClick={() => setMode('view')}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={actionLoading}
                onClick={handleSaveEdit}
              >
                Salvar alterações
              </button>
            </>
          )}
        </div>

        {showApproveConfirm ? (
          <div
            className="laudo-confirm-overlay"
            role="presentation"
            onClick={() => !actionLoading && setShowApproveConfirm(false)}
          >
            <section
              className="laudo-confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="laudo-approve-confirm-title"
              aria-describedby="laudo-approve-confirm-message"
              onClick={(event) => event.stopPropagation()}
            >
              <h4 id="laudo-approve-confirm-title">Confirmar aprovação</h4>
              <p id="laudo-approve-confirm-message">
                Deseja confirmar sua resposta? Após a aprovação, não será possível alterá-la.
              </p>
              <p className="laudo-confirm-choice">
                Cliente presente: <strong>{clientPresent}</strong>
              </p>
              <div className="laudo-confirm-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setShowApproveConfirm(false)}
                >
                  Cancelar
                </button>
                <button
                  className="reserve-button"
                  type="button"
                  disabled={actionLoading}
                  onClick={handleConfirmApprove}
                >
                  Confirmar aprovação
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  )
}
