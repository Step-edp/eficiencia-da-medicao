import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../api'
import { LoginFeedback } from '../LoginFeedback'
import { RatmFormFields } from './RatmFormFields'
import {
  isMeterReadyForEnsaioFromForm,
  METER_NOT_RECEIVED_MESSAGE,
} from './meterEnsaioEligibility'
import { clearRatmDraft, loadRatmDraft, saveRatmDraft } from './ratmDraft'
import { createEmptyRatmForm, normalizeRatmForm, type RatmFormData } from './types'

type RatmWorkflowProps = {
  count: number
  initialMeter?: string
  onBack: () => void
  onFinish: (forms: RatmFormData[], options?: { replacePending?: boolean }) => void | Promise<void>
}

export function RatmWorkflow({ count, initialMeter, onBack, onFinish }: RatmWorkflowProps) {
  const [activeIndex, setActiveIndex] = useState(() => {
    if (initialMeter) return 0
    const draft = loadRatmDraft()
    return draft?.count === count ? draft.activeIndex : 0
  })
  const [forms, setForms] = useState<RatmFormData[]>(() => {
    if (initialMeter) {
      const form = createEmptyRatmForm()
      form.meterSearch = initialMeter
      form.meter = initialMeter
      return Array.from({ length: count }, (_, index) =>
        index === 0 ? form : createEmptyRatmForm(),
      )
    }
    const draft = loadRatmDraft()
    if (draft?.count === count) {
      return draft.forms.map((form) => normalizeRatmForm(form))
    }

    return Array.from({ length: count }, () => createEmptyRatmForm())
  })
  const [showRestoredDraft, setShowRestoredDraft] = useState(() => {
    if (initialMeter) return false
    const draft = loadRatmDraft()
    return draft?.count === count
  })
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const [serverDraftNotice, setServerDraftNotice] = useState(false)
  const formsRef = useRef(forms)
  formsRef.current = forms

  useEffect(() => {
    let cancelled = false

    const loadSharedDrafts = async () => {
      const current = formsRef.current
      const next = [...current]
      let restored = false

      for (let index = 0; index < next.length; index += 1) {
        const meter = next[index]?.meter.trim()
        if (!meter) continue
        try {
          const response = await api.getRatmAssayDraft(meter)
          if (!response.draft?.formData) continue
          next[index] = normalizeRatmForm(response.draft.formData as Partial<RatmFormData>)
          restored = true
        } catch {
          // O preenchimento local continua disponível se a consulta falhar.
        }
      }

      if (cancelled) return
      if (restored) {
        setForms(next)
        setServerDraftNotice(true)
        setShowRestoredDraft(false)
      }
      setDraftReady(true)
    }

    void loadSharedDrafts()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!draftReady) return

    saveRatmDraft({
      count,
      activeIndex,
      forms,
      updatedAt: new Date().toISOString(),
    })

    const timer = window.setTimeout(() => {
      for (const form of formsRef.current) {
        if (!form.meter.trim()) continue
        void api.saveRatmAssayDraft(form.meter, form).catch(() => undefined)
      }
    }, 700)

    return () => window.clearTimeout(timer)
  }, [count, activeIndex, forms, draftReady])

  useEffect(() => {
    if (!draftReady) return
    return () => {
      for (const form of formsRef.current) {
        if (!form.meter.trim()) continue
        void api.saveRatmAssayDraft(form.meter, form).catch(() => undefined)
      }
    }
  }, [draftReady])

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

    if (!isMeterReadyForEnsaioFromForm(current)) {
      setFeedback({
        type: 'error',
        message: METER_NOT_RECEIVED_MESSAGE,
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

  const saveAssay = async (replacePending: boolean) => {
    setSaving(true)
    setFeedback(null)
    try {
      await onFinish(forms, replacePending ? { replacePending: true } : undefined)
      await Promise.all(
        forms.map((form) =>
          form.meter.trim() ? api.deleteRatmAssayDraft(form.meter).catch(() => undefined) : undefined,
        ),
      )
      clearRatmDraft()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível salvar os laudos. Tente novamente.',
      })
    } finally {
      setSaving(false)
      setReplaceConfirmOpen(false)
    }
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

    const notReceivedIndex = forms.findIndex((form) => !isMeterReadyForEnsaioFromForm(form))

    if (notReceivedIndex >= 0) {
      setActiveIndex(notReceivedIndex)
      setFeedback({
        type: 'error',
        message: METER_NOT_RECEIVED_MESSAGE,
      })
      return
    }

    setFeedback(null)
    setSaving(true)

    try {
      const approvedMeters: string[] = []
      const pendingMeters: string[] = []

      for (const form of forms) {
        const response = await api.listRatmLaudos(form.meter.trim())
        const active = response.laudos.filter((laudo) => !laudo.revokedAt)
        if (active.some((laudo) => laudo.status === 'Aprovado')) {
          approvedMeters.push(form.meter.trim())
        } else if (active.some((laudo) => laudo.status === 'Pendente')) {
          pendingMeters.push(form.meter.trim())
        }
      }

      if (approvedMeters.length) {
        setFeedback({
          type: 'error',
          message: `O medidor ${approvedMeters.join(', ')} já possui laudo aprovado e não pode ser substituído.`,
        })
        return
      }

      if (pendingMeters.length) {
        setReplaceConfirmOpen(true)
        return
      }

      await saveAssay(false)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível verificar os laudos deste medidor.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ratm-workflow">
      {serverDraftNotice ? (
        <LoginFeedback
          type="success"
          message="Informações já preenchidas deste medidor foram restauradas."
          onClose={() => setServerDraftNotice(false)}
        />
      ) : null}

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

      {draftReady ? (
      <RatmFormFields
        index={activeIndex}
        total={count}
        data={forms[activeIndex]}
        onChange={(patch) => updateForm(activeIndex, patch)}
        onScan={handleScan}
      />
      ) : (
        <p className="generated-password-empty">Carregando preenchimento salvo...</p>
      )}

      <div className="ratm-workflow-actions">
        {activeIndex < count - 1 ? (
          <button className="primary-button" type="button" onClick={handleNext}>
            Próximo RATM
          </button>
        ) : (
          <button className="reserve-button" type="button" onClick={handleFinish} disabled={saving}>
            {saving ? 'Salvando...' : 'Finalizar'}
          </button>
        )}
      </div>

      {replaceConfirmOpen ? (
        <div className="ensaios-block-modal-overlay" role="presentation">
          <div
            className="ensaios-block-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ratm-replace-title"
          >
            <h3 id="ratm-replace-title">Substituir relatório</h3>
            <p className="ensaios-unblock-message">
              Esse medidor já foi ensaiado, deseja substituir o relatório?
            </p>
            <div className="ensaios-block-modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={() => setReplaceConfirmOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="reserve-button"
                disabled={saving}
                onClick={() => void saveAssay(true)}
              >
                Substituir
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
