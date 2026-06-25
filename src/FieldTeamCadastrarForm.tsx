import { FormEvent, useMemo, useState } from 'react'

const csdOptions = [
  'CSD-001 - Região Norte',
  'CSD-002 - Região Sul',
  'CSD-003 - Região Leste',
  'CSD-004 - Região Oeste',
  'CSD-005 - Região Centro',
]

const hourOptions = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, '0'),
)
const minuteOptions = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, '0'),
)

function formatDisplayDate(dateValue: string) {
  if (!dateValue) {
    return ''
  }

  const [year, month, day] = dateValue.split('-')
  return `${day}/${month}/${year}`
}

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

export function FieldTeamCadastrarForm() {
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleHour, setScheduleHour] = useState('15')
  const [scheduleMinute, setScheduleMinute] = useState('10')
  const [meter, setMeter] = useState('')
  const [installation, setInstallation] = useState('')
  const [toi, setToi] = useState('')
  const [note, setNote] = useState('')
  const [csd, setCsd] = useState('')
  const [clientPresent, setClientPresent] = useState<'sim' | 'nao' | ''>('')
  const [schedulingNotes, setSchedulingNotes] = useState('')
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const schedulePreview = useMemo(() => {
    if (!scheduleDate) {
      return ''
    }

    return `${formatDisplayDate(scheduleDate)} ${scheduleHour}:${scheduleMinute}`
  }, [scheduleDate, scheduleHour, scheduleMinute])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!scheduleDate) {
      setFeedback({
        type: 'error',
        message: 'Informe a próxima data disponível.',
      })
      return
    }

    if (!meter.trim()) {
      setFeedback({
        type: 'error',
        message: 'O campo Medidor é obrigatório.',
      })
      return
    }

    if (!installation.trim()) {
      setFeedback({
        type: 'error',
        message: 'O campo Instalação é obrigatório.',
      })
      return
    }

    if (!toi.trim()) {
      setFeedback({
        type: 'error',
        message: 'O campo TOI é obrigatório.',
      })
      return
    }

    if (!note.trim()) {
      setFeedback({
        type: 'error',
        message: 'O campo Nota é obrigatório.',
      })
      return
    }

    if (!csd) {
      setFeedback({
        type: 'error',
        message: 'Selecione um CSD.',
      })
      return
    }

    if (!clientPresent) {
      setFeedback({
        type: 'error',
        message: 'Informe se o cliente está presente.',
      })
      return
    }

    setFeedback({
      type: 'success',
      message: `Agendamento registrado para o medidor ${meter.trim()} em ${schedulePreview}.`,
    })
  }

  return (
    <>
      <div className="schedule-form-header">
        <div>
          <p className="schedule-form-kicker">Agendamento</p>
          <p className="schedule-form-subtitle">Laboratório de Medição</p>
          {schedulePreview ? (
            <p className="schedule-form-datetime">{schedulePreview}</p>
          ) : null}
        </div>
      </div>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      <form className="form-grid schedule-form-grid" onSubmit={handleSubmit}>
        <label className="full-width">
          Próxima data disponível
          <div className="datetime-row">
            <input
              type="date"
              value={scheduleDate}
              onChange={(event) => setScheduleDate(event.target.value)}
              required
            />
            <select
              value={scheduleHour}
              onChange={(event) => setScheduleHour(event.target.value)}
              aria-label="Hora"
            >
              {hourOptions.map((hour) => (
                <option key={hour} value={hour}>
                  {hour}
                </option>
              ))}
            </select>
            <select
              value={scheduleMinute}
              onChange={(event) => setScheduleMinute(event.target.value)}
              aria-label="Minuto"
            >
              {minuteOptions.map((minute) => (
                <option key={minute} value={minute}>
                  {minute}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label>
          <RequiredLabel>Medidor</RequiredLabel>
          <input
            type="text"
            value={meter}
            onChange={(event) => setMeter(event.target.value)}
            required
          />
        </label>

        <label>
          <RequiredLabel>Instalação</RequiredLabel>
          <input
            type="text"
            value={installation}
            onChange={(event) => setInstallation(event.target.value)}
            required
          />
        </label>

        <label>
          <RequiredLabel>TOI</RequiredLabel>
          <input type="text" value={toi} onChange={(event) => setToi(event.target.value)} required />
        </label>

        <label>
          <RequiredLabel>Nota</RequiredLabel>
          <input type="text" value={note} onChange={(event) => setNote(event.target.value)} required />
        </label>

        <label className="full-width">
          <RequiredLabel>CSD</RequiredLabel>
          <select value={csd} onChange={(event) => setCsd(event.target.value)} required>
            <option value="">Localizar itens</option>
            {csdOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="radio-fieldset full-width">
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
                onChange={() => setClientPresent('sim')}
              />
              <span>Sim</span>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="client-present"
                value="nao"
                checked={clientPresent === 'nao'}
                onChange={() => setClientPresent('nao')}
              />
              <span>Não</span>
            </label>
          </div>
        </fieldset>

        <label className="full-width">
          Observações de agendamento
          <textarea
            rows={3}
            value={schedulingNotes}
            onChange={(event) => setSchedulingNotes(event.target.value)}
          />
        </label>

        <button className="reserve-button full-width" type="submit">
          Reservar Data
        </button>
      </form>
    </>
  )
}
