import { useEffect, useState } from 'react'
import { LoginFeedback } from '../LoginFeedback'
import { RatmFormFields } from './RatmFormFields'
import { clearRatmDraft, loadRatmDraft, saveRatmDraft } from './ratmDraft'
import { createEmptyRatmForm, normalizeRatmForm, type RatmFormData } from './types'

type RatmWorkflowProps = {
  count: number
  onBack: () => void
  onFinish: (forms: RatmFormData[]) => void | Promise<void>
}

export function RatmWorkflow({ count, onBack, onFinish }: RatmWorkflowProps) {
  const [activeIndex, setActiveIndex] = useState(() => {
    const draft = loadRatmDraft()
    return draft?.count === count ? draft.activeIndex : 0
  })
  const [forms, setForms] = useState<RatmFormData[]>(() => {
    const draft = loadRatmDraft()
    if (draft?.count === count) {
      return draft.forms.map((form) => normalizeRatmForm(form))
    }

    return Array.from({ length: count }, () => createEmptyRatmForm())
  })
  const [showRestoredDraft, setShowRestoredDraft] = useState(() => {
    const draft = loadRatmDraft()
    return draft?.count === count
  })
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)

  useEffect(() => {
    saveRatmDraft({
      count,
      activeIndex,
      forms,
      updatedAt: new Date().toISOString(),
    })
  }, [count, activeIndex, forms])

  const updateForm = (index: number, patch: Partial<RatmFormData>) => {
    setForms((prev) =>
      prev.map((form, formIndex) => (formIndex === index ? { ...form, ...patch } : form)),
    )
  }

  const handleScan = (field: string) => {
    setScanMessage(`Digitalização simulada para ${field} no RATM ${activeIndex + 1}.`)
  }

  const validateCurrentForm = () => {
    const current = forms[activeIndex]

    if (!current.meter.trim()) {
      setFeedback({
        type: 'error',
        message: `Informe o medidor no RATM ${activeIndex + 1}.`,
      })
      return false
    }

    return true
  }

  const handlePrevious = () => {
    setFeedback(null)
    setActiveIndex((prev) => Math.max(prev - 1, 0))
  }

  const handleNext = () => {
    if (!validateCurrentForm()) {
      return
    }

    setFeedback(null)
    setActiveIndex((prev) => Math.min(prev + 1, count - 1))
  }

  const discardRatmAndExit = () => {
    clearRatmDraft()
    setConfirmCloseOpen(false)
    onBack()
  }

  const handleFinish = async () => {
    const invalidIndex = forms.findIndex((form) => !form.meter.trim())

    if (invalidIndex >= 0) {
      setActiveIndex(invalidIndex)
      setFeedback({
        type: 'error',
        message: `Preencha o medidor no RATM ${invalidIndex + 1} antes de finalizar.`,
      })
      return
    }

    setFeedback(null)

    try {
      await onFinish(forms)
      clearRatmDraft()
    } catch {
      setFeedback({
        type: 'error',
        message: 'Não foi possível salvar os laudos. Tente novamente.',
      })
    }
  }

  return (
    <div className="ratm-workflow">
      {showRestoredDraft ? (
        <LoginFeedback
          type="success"
          message="Rascunho do RATM restaurado automaticamente."
          onClose={() => setShowRestoredDraft(false)}
        />
      ) : null}

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={
            feedback.type === 'success' ? () => setFeedback(null) : undefined
          }
        />
      ) : null}

      {scanMessage ? (
        <LoginFeedback
          type="success"
          message={scanMessage}
          onClose={() => setScanMessage(null)}
        />
      ) : null}

      <div className="ratm-nav-bar">
        <button
          className="ratm-nav-button"
          type="button"
          onClick={handlePrevious}
          disabled={activeIndex === 0}
          aria-label="RATM anterior"
        >
          ‹
        </button>
        <strong className="ratm-nav-title">RATM {activeIndex + 1}</strong>
        <div className="ratm-nav-trailing">
          <button
            className="ratm-nav-button"
            type="button"
            onClick={handleNext}
            disabled={activeIndex >= count - 1}
            aria-label="Próximo RATM"
          >
            ›
          </button>
          <button
            className="ratm-nav-close"
            type="button"
            onClick={() => setConfirmCloseOpen(true)}
            aria-label="Fechar RATM e descartar preenchimento"
            title="Fechar RATM (descarta tudo)"
          >
            ×
          </button>
        </div>
      </div>

      <RatmFormFields
        index={activeIndex}
        total={count}
        data={forms[activeIndex]}
        onChange={(patch) => updateForm(activeIndex, patch)}
        onScan={handleScan}
      />

      <div className="ratm-workflow-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={() => setConfirmCloseOpen(true)}
        >
          Alterar quantidade
        </button>
        {activeIndex < count - 1 ? (
          <button className="primary-button" type="button" onClick={handleNext}>
            Próximo RATM
          </button>
        ) : (
          <button className="reserve-button" type="button" onClick={handleFinish}>
            Finalizar
          </button>
        )}
      </div>

      {confirmCloseOpen ? (
        <div
          className="ensaios-block-modal-overlay"
          role="presentation"
          onClick={() => setConfirmCloseOpen(false)}
        >
          <div
            className="ensaios-block-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ratm-close-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="ratm-close-title">Fechar RATM?</h3>
            <p className="ensaios-unblock-message">
              Fechar o RATM descarta todo o preenchimento e o rascunho. Deseja
              continuar?
            </p>
            <div className="ensaios-block-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setConfirmCloseOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={discardRatmAndExit}
              >
                Fechar e descartar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
