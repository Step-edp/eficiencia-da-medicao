import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { RatmFormFields } from './RatmFormFields'
import { formatRatmLaudoNumber, mapRatmLaudoFromApi, type RatmLaudo } from './laudos'
import { openRatmLaudoPdf } from './laudoPdf'
import { RatmApprovalWizard } from './RatmApprovalWizard'
import { normalizeRatmForm, type RatmFormData } from './types'

type RatmLaudoViewerProps = {
  laudo: RatmLaudo
  onClose: () => void
  onUpdated: (laudo: RatmLaudo) => void
  onApproved: (laudo: RatmLaudo) => void
  readOnly?: boolean
  approverUserId?: string
  approverIsLab?: boolean
  initialMode?: 'view' | 'edit'
}

function laudoToFormData(laudo: RatmLaudo): RatmFormData {
  return normalizeRatmForm(laudo.formData as Partial<RatmFormData>)
}

export function RatmLaudoViewer({
  laudo,
  onClose,
  onUpdated,
  onApproved,
  readOnly = false,
  approverUserId,
  approverIsLab = false,
  initialMode = 'view',
}: RatmLaudoViewerProps) {
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode)
  const [currentLaudo, setCurrentLaudo] = useState(laudo)
  const [formData, setFormData] = useState<RatmFormData>(() => laudoToFormData(laudo))
  const [actionLoading, setActionLoading] = useState(false)
  const [approvalOpen, setApprovalOpen] = useState(() => {
    const ownAssay = Boolean(
      approverUserId && laudo.createdByUserId && laudo.createdByUserId === approverUserId,
    )
    return (
      initialMode === 'view' &&
      laudo.status === 'Pendente' &&
      !laudo.revokedAt &&
      approverIsLab &&
      !ownAssay
    )
  })
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

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

  const approveAbsent = async () => {
    setActionLoading(true)
    setFeedback(null)
    try {
      const response = await api.approveRatmLaudo(currentLaudo.id, { clientPresent: 'Não' })
      const approvedLaudo = mapRatmLaudoFromApi(response.laudo)
      onApproved(approvedLaudo)
      onClose()
    } finally {
      setActionLoading(false)
    }
  }

  const approvePresent = async (payload: {
    clientDocumentPhoto: string
    clientCpf: string
    clientSignature: string
    satisfactionWhatsapp: string
  }) => {
    setActionLoading(true)
    setFeedback(null)
    try {
      const response = await api.approveRatmLaudo(currentLaudo.id, {
        clientPresent: 'Sim',
        ...payload,
      })
      const approvedLaudo = mapRatmLaudoFromApi(response.laudo)
      setCurrentLaudo(approvedLaudo)
      onApproved(approvedLaudo)
    } finally {
      setActionLoading(false)
    }
  }

  const isOwnAssay = Boolean(
    approverUserId && currentLaudo.createdByUserId && currentLaudo.createdByUserId === approverUserId,
  )
  const approvalBlockMessage = !approverIsLab
    ? 'Somente um usuário do Laboratório de Medição pode aprovar o laudo.'
    : isOwnAssay
      ? 'Quem realizou o ensaio não pode aprovar o próprio laudo.'
      : ''

  return createPortal(
    <div className={`laudo-modal-overlay${mode === 'view' ? ' is-compact' : ''}`} role="presentation">
      <section
        className={`laudo-viewer-modal${mode === 'view' ? ' is-compact' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="laudo-viewer-title"
      >
        <header className="laudo-viewer-header">
          <div>
            <p className="section-tag">Laudo RATM</p>
            <h3 id="laudo-viewer-title">
              Medidor {currentLaudo.meter} — {formatRatmLaudoNumber(currentLaudo.ratmNumber, currentLaudo.createdAt)}
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

        {mode === 'edit' ? (
          <div className="laudo-viewer-main">
            <div className="laudo-viewer-edit">
              <RatmFormFields
                index={0}
                total={1}
                data={formData}
                onChange={(patch) => setFormData((previous) => ({ ...previous, ...patch }))}
                onScan={() => undefined}
              />
            </div>
          </div>
        ) : null}

        <div className="laudo-viewer-actions">
          {readOnly ? null : mode === 'view' ? (
            <>
              <button
                className="secondary-button"
                type="button"
                disabled={actionLoading}
                onClick={() => openRatmLaudoPdf(currentLaudo.id)}
              >
                Visualizar PDF
              </button>
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
                disabled={
                  actionLoading ||
                  currentLaudo.status !== 'Pendente' ||
                  Boolean(approvalBlockMessage)
                }
                onClick={() => setApprovalOpen(true)}
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

        {approvalBlockMessage && mode === 'view' && !readOnly && currentLaudo.status === 'Pendente' ? (
          <p className="generated-password-empty" role="status">
            {approvalBlockMessage}
          </p>
        ) : null}

        {approvalOpen && mode === 'view' ? (
          <RatmApprovalWizard
            laudoId={currentLaudo.id}
            loading={actionLoading}
            onClose={() => {
              setApprovalOpen(false)
              if (currentLaudo.status === 'Aprovado') onClose()
            }}
            onApproveAbsent={approveAbsent}
            onApprovePresent={approvePresent}
          />
        ) : null}
      </section>
    </div>,
    document.body,
  )
}
