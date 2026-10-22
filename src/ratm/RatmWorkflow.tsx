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
  initialMeters?: string[]
  onBack: () => void
  onFinish: (
    forms: RatmFormData[],
    options?: { replacePending?: boolean; keepOpen?: boolean },
  ) => void | Promise<void>
}

function formsForMeters(meters: string[]) {
  return meters.map((meter) => {
    const form = createEmptyRatmForm()
    form.meterSearch = meter
    form.meter = meter
    return form
  })
}

export function RatmWorkflow({
  count,
  initialMeter,
  initialMeters,
  onBack,
  onFinish,
}: RatmWorkflowProps) {
  const presetMeters = (initialMeters ?? []).map((meter) => meter.trim()).filter(Boolean)
  const hasPresetMeters = presetMeters.length > 0
  const [activeIndex, setActiveIndex] = useState(() => {
    if (hasPresetMeters || initialMeter) return 0
    const draft = loadRatmDraft()
    return draft?.count === count ? draft.activeIndex : 0
  })
  const [forms, setForms] = useState<RatmFormData[]>(() => {
    if (hasPresetMeters) return formsForMeters(presetMeters)
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
    if (hasPresetMeters || initialMeter) return false
    const draft = loadRatmDraft()
    return draft?.count === count
  })
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null)
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
      count: forms.length,
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
  }, [activeIndex, forms, draftReady])

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

    if (!current.irregularityNotes.trim()) {
      setFeedback({
        type: 'error',
        message: 'Preencha as observações da irregularidade antes de seguir.',
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
    setActiveIndex((prev) => Math.min(prev + 1, forms.length - 1))
  }

  const discardRatmAndExit = () => {
    clearRatmDraft()
    setConfirmCloseOpen(false)
    onBack()
  }

  const saveAssay = async (index: number, replacePending: boolean) => {
    const form = formsRef.current[index]
    if (!form) return
    const remaining = formsRef.current.filter((_, formIndex) => formIndex !== index)
    setSaving(true)
    setFeedback(null)
    try {
      await onFinish([form], {
        replacePending: replacePending || undefined,
        keepOpen: remaining.length > 0,
      })
      if (form.meter.trim()) {
        await api.deleteRatmAssayDraft(form.meter).catch(() => undefined)
      }
      if (!remaining.length) {
        clearRatmDraft()
        return
      }
      setForms(remaining)
      setActiveIndex((current) => {
        if (index < current) return current - 1
        return Math.min(current, remaining.length - 1)
      })
      setFeedback({
        type: 'success',
        message: `RATM do medidor ${form.meter.trim()} finalizado. ${remaining.length === 1 ? 'Resta 1 RATM.' : `Restam ${remaining.length} RATMs.`}`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível salvar o laudo. Tente novamente.',
      })
    } finally {
      setSaving(false)
      setReplaceIndex(null)
    }
  }

  const handleFinish = async () => {
    const current = forms[activeIndex]
    if (!current) return

    if (!current.meter.trim()) {
      setFeedback({
        type: 'error',
        message: `Informe o medidor no RATM ${activeIndex + 1}.`,
      })
      return
    }

    if (!isMeterReadyForEnsaioFromForm(current)) {
      setFeedback({
        type: 'error',
        message: METER_NOT_RECEIVED_MESSAGE,
      })
      return
    }

    if (!current.irregularityNotes.trim()) {
      setFeedback({
        type: 'error',
        message: 'Preencha as observações da irregularidade antes de seguir.',
      })
      return
    }

    setFeedback(null)
    setSaving(true)

    try {
      const response = await api.listRatmLaudos(current.meter.trim())
      const active = response.laudos.filter((laudo) => !laudo.revokedAt)
      if (active.some((laudo) => laudo.status === 'Aprovado')) {
        setFeedback({
          type: 'error',
          message: `O medidor ${current.meter.trim()} já possui laudo aprovado e não pode ser substituído.`,
        })
        return
      }
      if (active.some((laudo) => laudo.status === 'Pendente')) {
        setReplaceIndex(activeIndex)
        return
      }
      await saveAssay(activeIndex, false)
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
          disabled={activeIndex >= forms.length - 1}
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
        total={forms.length}
        data={forms[activeIndex]}
        onChange={(patch) => updateForm(activeIndex, patch)}
        onScan={handleScan}
      />
      ) : (
        <p className="generated-password-empty">Carregando preenchimento salvo...</p>
      )}

      <div className="ratm-workflow-actions">
        {activeIndex < forms.length - 1 ? (
          <button className="secondary-button" type="button" onClick={handleNext} disabled={saving}>
            Próximo RATM
          </button>
        ) : (
          <span />
        )}
        <button className="reserve-button" type="button" onClick={() => void handleFinish()} disabled={saving}>
          {saving ? 'Salvando...' : 'Finalizar'}
        </button>
      </div>

      {replaceIndex != null ? (
        <div className="ensaios-block-modal-overlay" role="presentation">
          <div
            className="ensaios-block-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ratm-replace-title"
          >
            <h3 id="ratm-replace-title">Substituir relatório</h3>
            <p className="ensaios-unblock-message">
              O medidor {forms[replaceIndex]?.meter.trim()} já foi ensaiado, deseja substituir o
              relatório?
            </p>
            <div className="ensaios-block-modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={() => setReplaceIndex(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="reserve-button"
                disabled={saving}
                onClick={() => void saveAssay(replaceIndex, true)}
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
