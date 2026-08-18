import { FormEvent, useState } from 'react'
import { FormFieldError } from './FormFieldError'
import { api, ApiError } from './api'
import {
  NUMERIC_FIELD_LIMITS,
  NumericFieldKey,
  sanitizeNumericInput,
  validateNumericField,
  validateNumericFieldOptional,
} from './numericFieldValidation'
import { useCsdsOptions } from './useCsdsOptions'

const hourOptions = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, '0'),
)
const minuteOptions = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, '0'),
)

type ScheduleFieldErrors = Partial<Record<NumericFieldKey | 'csmDate', string>>

type ScheduleAgendarFormProps = {
  showPassiveFields?: boolean
}

export function ScheduleAgendarForm({ showPassiveFields = false }: ScheduleAgendarFormProps) {
  const { options: csdOptions, loading: csdLoading, error: csdError } = useCsdsOptions()
  const [csmDate, setCsmDate] = useState('')
  const [csmHour, setCsmHour] = useState('00')
  const [csmMinute, setCsmMinute] = useState('00')
  const [scheduledByName, setScheduledByName] = useState('')
  const [schedulingDate, setSchedulingDate] = useState('')
  const [meter, setMeter] = useState('')
  const [installation, setInstallation] = useState('')
  const [toi, setToi] = useState('')
  const [note, setNote] = useState('')
  const [csd, setCsd] = useState('')
  const [schedulingNotes, setSchedulingNotes] = useState('Medidor não agendado em Campo')
  const [fieldErrors, setFieldErrors] = useState<ScheduleFieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const clearFieldError = (field: keyof ScheduleFieldErrors) => {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const resetForm = () => {
    setCsmDate('')
    setCsmHour('00')
    setCsmMinute('00')
    setScheduledByName('')
    setSchedulingDate('')
    setMeter('')
    setInstallation('')
    setToi('')
    setNote('')
    setCsd('')
    setSchedulingNotes('Medidor não agendado em Campo')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFeedback(null)

    const nextErrors: ScheduleFieldErrors = {}

    if (!csmDate) {
      nextErrors.csmDate = 'Informe a data escrita no CSM.'
    }

    for (const [value, field, optional] of [
      [meter, 'medidor', false],
      [installation, 'instalacao', true],
      [toi, 'toi', true],
      [note, 'nota', true],
    ] as const) {
      const error = optional
        ? validateNumericFieldOptional(value, field, true)
        : validateNumericField(value, field, true)
      if (error) nextErrors[field] = error
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      return
    }

    if (!csd) {
      setFeedback({ type: 'error', message: 'Selecione um CSD.' })
      return
    }

    setFieldErrors({})
    setSubmitting(true)

    try {
      const scheduledAt = new Date(`${csmDate}T${csmHour}:${csmMinute}:00`).toISOString()

      const { schedule } = await api.createPassiveMeterSchedule({
        meter,
        installation,
        toi,
        note,
        csd,
        schedulingNotes,
        ...(showPassiveFields
          ? {
              scheduledByName,
              schedulingDate: schedulingDate || undefined,
            }
          : {}),
        scheduledAt,
      })

      resetForm()
      setFeedback({
        type: 'success',
        message: `Data reservada para o medidor ${schedule.meter} em ${schedule.scheduledAtLabel}.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof ApiError ? error.message : 'Não foi possível reservar a data.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {feedback ? (
        <div
          className={`login-feedback ${feedback.type}`}
          role={feedback.type === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </div>
      ) : null}

      <form className="form-grid schedule-form-grid" onSubmit={(event) => void handleSubmit(event)}>
        <label className={`full-width${fieldErrors.csmDate ? ' has-field-error' : ''}`}>
          Data escrita no CSM
          <div className="datetime-row">
            <input
              type="date"
              value={csmDate}
              onChange={(event) => {
                setCsmDate(event.target.value)
                clearFieldError('csmDate')
              }}
              aria-invalid={Boolean(fieldErrors.csmDate)}
              aria-describedby={fieldErrors.csmDate ? 'schedule-csm-date-error' : undefined}
              disabled={submitting}
            />
            <select
              value={csmHour}
              onChange={(event) => setCsmHour(event.target.value)}
              aria-label="Hora"
              disabled={submitting}
            >
              {hourOptions.map((hour) => (
                <option key={hour} value={hour}>
                  {hour}
                </option>
              ))}
            </select>
            <select
              value={csmMinute}
              onChange={(event) => setCsmMinute(event.target.value)}
              aria-label="Minuto"
              disabled={submitting}
            >
              {minuteOptions.map((minute) => (
                <option key={minute} value={minute}>
                  {minute}
                </option>
              ))}
            </select>
          </div>
          <FormFieldError id="schedule-csm-date-error" message={fieldErrors.csmDate} />
        </label>

        {showPassiveFields ? (
          <>
            <label>
              Agendamento feito por
              <input
                type="text"
                autoComplete="off"
                value={scheduledByName}
                onChange={(event) => setScheduledByName(event.target.value)}
                disabled={submitting}
              />
            </label>

            <label>
              Data do agendamento
              <input
                type="date"
                value={schedulingDate}
                onChange={(event) => setSchedulingDate(event.target.value)}
                disabled={submitting}
              />
            </label>
          </>
        ) : null}

        <label className={fieldErrors.medidor ? 'has-field-error' : undefined}>
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            Medidor
          </span>
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
            aria-describedby={fieldErrors.medidor ? 'schedule-medidor-error' : undefined}
            required
            disabled={submitting}
          />
          <FormFieldError id="schedule-medidor-error" message={fieldErrors.medidor} />
        </label>

        <label className={fieldErrors.instalacao ? 'has-field-error' : undefined}>
          Instalação
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
              fieldErrors.instalacao ? 'schedule-instalacao-error' : undefined
            }
            disabled={submitting}
          />
          <FormFieldError id="schedule-instalacao-error" message={fieldErrors.instalacao} />
        </label>

        <label className={fieldErrors.toi ? 'has-field-error' : undefined}>
          TOI
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
            aria-describedby={fieldErrors.toi ? 'schedule-toi-error' : undefined}
            disabled={submitting}
          />
          <FormFieldError id="schedule-toi-error" message={fieldErrors.toi} />
        </label>

        <label className={fieldErrors.nota ? 'has-field-error' : undefined}>
          Nota
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
            aria-describedby={fieldErrors.nota ? 'schedule-nota-error' : undefined}
            disabled={submitting}
          />
          <FormFieldError id="schedule-nota-error" message={fieldErrors.nota} />
        </label>

        <label className="full-width">
          CSD
          <select value={csd} onChange={(event) => setCsd(event.target.value)} disabled={submitting}>
            <option value="">{csdLoading ? 'Carregando CSDs...' : 'Localizar itens'}</option>
            {csdOptions.map((option) => (
              <option key={option.id} value={option.label}>
                {option.label}
              </option>
            ))}
          </select>
          <FormFieldError message={csdError ?? undefined} />
        </label>

        <label className="full-width">
          Observações
          <input
            type="text"
            value={schedulingNotes}
            onChange={(event) => setSchedulingNotes(event.target.value)}
            disabled={submitting}
          />
        </label>

        <p className="field-hint full-width">
          {showPassiveFields
            ? 'Use este formulário para medidores que não foram agendados pela equipe de campo (agendamento passivo no laboratório).'
            : 'Preencha os dados para reservar a data de agendamento.'}
        </p>

        <button className="reserve-button full-width" type="submit" disabled={submitting}>
          {submitting ? 'Reservando…' : 'Reservar Data'}
        </button>
      </form>
    </>
  )
}
