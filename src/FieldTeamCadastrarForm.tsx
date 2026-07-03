import { FormEvent, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError } from './api'
import { FormFieldError } from './FormFieldError'
import {
  NUMERIC_FIELD_LIMITS,
  NumericFieldKey,
  sanitizeNumericInput,
  validateNumericField,
} from './numericFieldValidation'
import { useCsdsOptions } from './useCsdsOptions'

type RequiredLabelProps = {
  children: string
}

function RequiredLabel({ children }: RequiredLabelProps) {
  return (
    <span className="required-label">
      <span className="required-mark" aria-hidden="true">
        *
      </span>
      {children}
    </span>
  )
}

type FieldTeamFieldErrors = Partial<
  Record<NumericFieldKey | 'csd' | 'clientPresent', string>
>

export function FieldTeamCadastrarForm() {
  const { options: csdOptions, loading: csdLoading } = useCsdsOptions()
  const [meter, setMeter] = useState('')
  const [installation, setInstallation] = useState('')
  const [toi, setToi] = useState('')
  const [note, setNote] = useState('')
  const [csd, setCsd] = useState('')
  const [clientPresent, setClientPresent] = useState<'sim' | 'nao' | ''>('')
  const [schedulingNotes, setSchedulingNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [slotModal, setSlotModal] = useState<{
    meter: string
    slot: string
  } | null>(null)
  const [copiedSlot, setCopiedSlot] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldTeamFieldErrors>({})
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const clearFieldError = (field: keyof FieldTeamFieldErrors) => {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFeedback(null)
    setSlotModal(null)

    const nextErrors: FieldTeamFieldErrors = {}

    for (const [value, field] of [
      [meter, 'medidor'],
      [installation, 'instalacao'],
      [toi, 'toi'],
      [note, 'nota'],
    ] as const) {
      const error = validateNumericField(value, field, true)
      if (error) nextErrors[field] = error
    }

    if (!csd) {
      nextErrors.csd = 'Selecione um CSD.'
    }

    if (!clientPresent) {
      nextErrors.clientPresent = 'Informe se o cliente está presente.'
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      return
    }

    setFieldErrors({})

    setSubmitting(true)

    try {
      const { schedule } = await api.createMeterSchedule({
        meter,
        installation,
        toi,
        note,
        csd,
        clientPresent: clientPresent as 'sim' | 'nao',
        schedulingNotes,
      })

      setSlotModal({
        meter: schedule.meter,
        slot: schedule.scheduledAtLabel,
      })
      setMeter('')
      setInstallation('')
      setToi('')
      setNote('')
      setCsd('')
      setClientPresent('')
      setSchedulingNotes('')
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível calcular a próxima data disponível.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const closeSlotModal = () => {
    setSlotModal(null)
    setCopiedSlot(false)
  }

  const copySlotDate = async () => {
    if (!slotModal) return

    try {
      await navigator.clipboard.writeText(slotModal.slot)
      setCopiedSlot(true)
      window.setTimeout(() => setCopiedSlot(false), 2000)
    } catch {
      setFeedback({
        type: 'error',
        message: 'Não foi possível copiar a data.',
      })
    }
  }

  return (
    <>
      <div className="schedule-form-header">
        <div>
          <p className="schedule-form-kicker">Agendamento</p>
          <p className="schedule-form-subtitle">Laboratório de Medição</p>
        </div>
      </div>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      <form className="form-grid schedule-form-grid" onSubmit={(event) => void handleSubmit(event)}>
        <label className={fieldErrors.medidor ? 'has-field-error' : undefined}>
          <RequiredLabel>Medidor</RequiredLabel>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={meter}
            onChange={(event) => {
              setMeter(sanitizeNumericInput(event.target.value, NUMERIC_FIELD_LIMITS.medidor))
              clearFieldError('medidor')
            }}
            maxLength={NUMERIC_FIELD_LIMITS.medidor}
            aria-invalid={Boolean(fieldErrors.medidor)}
            aria-describedby={fieldErrors.medidor ? 'field-team-medidor-error' : undefined}
            required
          />
          <FormFieldError id="field-team-medidor-error" message={fieldErrors.medidor} />
        </label>

        <label className={fieldErrors.instalacao ? 'has-field-error' : undefined}>
          <RequiredLabel>Instalação</RequiredLabel>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={installation}
            onChange={(event) => {
              setInstallation(
                sanitizeNumericInput(event.target.value, NUMERIC_FIELD_LIMITS.instalacao),
              )
              clearFieldError('instalacao')
            }}
            maxLength={NUMERIC_FIELD_LIMITS.instalacao}
            aria-invalid={Boolean(fieldErrors.instalacao)}
            aria-describedby={
              fieldErrors.instalacao ? 'field-team-instalacao-error' : undefined
            }
            required
          />
          <FormFieldError id="field-team-instalacao-error" message={fieldErrors.instalacao} />
        </label>

        <label className={fieldErrors.toi ? 'has-field-error' : undefined}>
          <RequiredLabel>TOI</RequiredLabel>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={toi}
            onChange={(event) => {
              setToi(sanitizeNumericInput(event.target.value, NUMERIC_FIELD_LIMITS.toi))
              clearFieldError('toi')
            }}
            maxLength={NUMERIC_FIELD_LIMITS.toi}
            aria-invalid={Boolean(fieldErrors.toi)}
            aria-describedby={fieldErrors.toi ? 'field-team-toi-error' : undefined}
            required
          />
          <FormFieldError id="field-team-toi-error" message={fieldErrors.toi} />
        </label>

        <label className={fieldErrors.nota ? 'has-field-error' : undefined}>
          <RequiredLabel>Nota</RequiredLabel>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={note}
            onChange={(event) => {
              setNote(sanitizeNumericInput(event.target.value, NUMERIC_FIELD_LIMITS.nota))
              clearFieldError('nota')
            }}
            maxLength={NUMERIC_FIELD_LIMITS.nota}
            aria-invalid={Boolean(fieldErrors.nota)}
            aria-describedby={fieldErrors.nota ? 'field-team-nota-error' : undefined}
            required
          />
          <FormFieldError id="field-team-nota-error" message={fieldErrors.nota} />
        </label>

        <label className={`full-width${fieldErrors.csd ? ' has-field-error' : ''}`}>
          <RequiredLabel>CSD</RequiredLabel>
          <select
            value={csd}
            onChange={(event) => {
              setCsd(event.target.value)
              clearFieldError('csd')
            }}
            aria-invalid={Boolean(fieldErrors.csd)}
            aria-describedby={fieldErrors.csd ? 'field-team-csd-error' : undefined}
            required
          >
            <option value="">{csdLoading ? 'Carregando CSDs...' : 'Localizar itens'}</option>
            {csdOptions.map((option) => (
              <option key={option.id} value={option.label}>
                {option.label}
              </option>
            ))}
          </select>
          <FormFieldError id="field-team-csd-error" message={fieldErrors.csd} />
        </label>

        <fieldset
          className={`radio-fieldset full-width${fieldErrors.clientPresent ? ' has-field-error' : ''}`}
        >
          <legend>
            <RequiredLabel>Cliente presente?</RequiredLabel>
          </legend>
          <div className="radio-group">
            <label className="radio-option">
              <input
                type="radio"
                name="client-present"
                value="sim"
                checked={clientPresent === 'sim'}
                onChange={() => {
                  setClientPresent('sim')
                  clearFieldError('clientPresent')
                }}
              />
              <span>Sim</span>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="client-present"
                value="nao"
                checked={clientPresent === 'nao'}
                onChange={() => {
                  setClientPresent('nao')
                  clearFieldError('clientPresent')
                }}
              />
              <span>Não</span>
            </label>
          </div>
          <FormFieldError
            id="field-team-client-present-error"
            message={fieldErrors.clientPresent}
          />
        </fieldset>

        <label className="full-width">
          Observações de agendamento
          <textarea
            rows={3}
            value={schedulingNotes}
            onChange={(event) => setSchedulingNotes(event.target.value)}
          />
        </label>

        <button className="reserve-button full-width" type="submit" disabled={submitting}>
          {submitting ? 'Salvando...' : 'Salvar agendamento'}
        </button>
      </form>

      {slotModal
        ? createPortal(
            <div
              className="ensaios-block-modal-overlay"
              role="presentation"
              onClick={closeSlotModal}
            >
              <div
                className="ensaios-block-modal schedule-slot-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="schedule-slot-date-label"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="icon-button schedule-slot-modal-close"
                  onClick={closeSlotModal}
                  aria-label="Fechar"
                  title="Fechar"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <p className="schedule-slot-modal-message">
                  Medidor {slotModal.meter} reservado com sucesso.
                </p>
                <div className="schedule-slot-date-row">
                  <p id="schedule-slot-date-label" className="available-slot-value">
                    {slotModal.slot}
                  </p>
                  <button
                    type="button"
                    className="icon-button schedule-slot-copy-button"
                    onClick={() => void copySlotDate()}
                    aria-label={copiedSlot ? 'Copiado' : 'Copiar data'}
                    title={copiedSlot ? 'Copiado!' : 'Copiar data'}
                  >
                    {copiedSlot ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M5 12l4 4L19 6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect
                          x="9"
                          y="9"
                          width="11"
                          height="11"
                          rx="2"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <path
                          d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
