import { FormEvent, useState } from 'react'

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

export function ScheduleAgendarForm() {
  const [csmDate, setCsmDate] = useState('')
  const [csmHour, setCsmHour] = useState('00')
  const [csmMinute, setCsmMinute] = useState('00')
  const [meter, setMeter] = useState('')
  const [installation, setInstallation] = useState('')
  const [toi, setToi] = useState('')
  const [note, setNote] = useState('')
  const [csd, setCsd] = useState('')
  const [csmSigned, setCsmSigned] = useState<'sim' | 'nao' | ''>('')
  const [schedulingNotes, setSchedulingNotes] = useState('Medidor não agendado em Campo')
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!csmDate) {
      setFeedback({
        type: 'error',
        message: 'Informe a data escrita no CSM.',
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

    if (!csmSigned) {
      setFeedback({
        type: 'error',
        message: 'Selecione se o CSM está assinado.',
      })
      return
    }

    setFeedback({
      type: 'success',
      message: `Data reservada para o medidor ${meter.trim()} em ${csmDate} às ${csmHour}:${csmMinute}.`,
    })
  }

  return (
    <>
      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      <form className="form-grid schedule-form-grid" onSubmit={handleSubmit}>
        <label className="full-width">
          Data escrita no CSM
          <div className="datetime-row">
            <input
              type="date"
              value={csmDate}
              onChange={(event) => setCsmDate(event.target.value)}
            />
            <select
              value={csmHour}
              onChange={(event) => setCsmHour(event.target.value)}
              aria-label="Hora"
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
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            Medidor
          </span>
          <input
            type="text"
            value={meter}
            onChange={(event) => setMeter(event.target.value)}
            required
          />
        </label>

        <label>
          Instalação
          <input
            type="text"
            value={installation}
            onChange={(event) => setInstallation(event.target.value)}
          />
        </label>

        <label>
          TOI
          <input type="text" value={toi} onChange={(event) => setToi(event.target.value)} />
        </label>

        <label>
          Nota
          <input type="text" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>

        <label className="full-width">
          CSD
          <select value={csd} onChange={(event) => setCsd(event.target.value)}>
            <option value="">Localizar itens</option>
            {csdOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="radio-fieldset full-width">
          <legend>CSM Assinado?</legend>
          <div className="radio-group">
            <label className="radio-option">
              <input
                type="radio"
                name="csm-signed"
                value="sim"
                checked={csmSigned === 'sim'}
                onChange={() => setCsmSigned('sim')}
              />
              <span>Sim</span>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="csm-signed"
                value="nao"
                checked={csmSigned === 'nao'}
                onChange={() => setCsmSigned('nao')}
              />
              <span>Não</span>
            </label>
          </div>
        </fieldset>

        <label className="full-width">
          Observações de agendamento
          <input
            type="text"
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
