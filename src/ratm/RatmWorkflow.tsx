import { useState } from 'react'
import { RatmFormFields } from './RatmFormFields'
import { createEmptyRatmForm, type RatmFormData } from './types'

type RatmWorkflowProps = {
  count: number
  onBack: () => void
}

export function RatmWorkflow({ count, onBack }: RatmWorkflowProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [forms, setForms] = useState<RatmFormData[]>(() =>
    Array.from({ length: count }, () => createEmptyRatmForm()),
  )
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [scanMessage, setScanMessage] = useState<string | null>(null)

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

  const handleFinish = () => {
    const invalidIndex = forms.findIndex((form) => !form.meter.trim())

    if (invalidIndex >= 0) {
      setActiveIndex(invalidIndex)
      setFeedback({
        type: 'error',
        message: `Preencha o medidor no RATM ${invalidIndex + 1} antes de finalizar.`,
      })
      return
    }

    setFeedback({
      type: 'success',
      message: `${count} RATM(s) finalizado(s) com sucesso.`,
    })
  }

  return (
    <div className="ratm-workflow">
      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      {scanMessage ? (
        <div className="login-feedback success" role="status">
          {scanMessage}
        </div>
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
        <button
          className="ratm-nav-button"
          type="button"
          onClick={handleNext}
          disabled={activeIndex >= count - 1}
          aria-label="Próximo RATM"
        >
          ›
        </button>
      </div>

      <RatmFormFields
        index={activeIndex}
        total={count}
        data={forms[activeIndex]}
        onChange={(patch) => updateForm(activeIndex, patch)}
        onScan={handleScan}
      />

      <div className="ratm-workflow-actions">
        <button className="secondary-button" type="button" onClick={onBack}>
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
    </div>
  )
}
