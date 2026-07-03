import { FormEvent, useState } from 'react'
import { api, ApiError } from './api'
import {
  findNextAvailableSlot,
  formatAvailableSlot,
} from './availableScheduleSlots'
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
  const [availableSlot, setAvailableSlot] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFeedback(null)
    setAvailableSlot(null)

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

    setSubmitting(true)

    try {
      const { blocks } = await api.listEnsaiosManualBlocks()
      const manualBlocks = new Set(blocks.map((block) => block.date))
      const nextSlot = findNextAvailableSlot(manualBlocks)

      if (!nextSlot) {
        setFeedback({
          type: 'error',
          message: 'Não há datas disponíveis no calendário nos próximos meses.',
        })
        return
      }

      const slotLabel = formatAvailableSlot(nextSlot)
      setAvailableSlot(slotLabel)
      setFeedback({
        type: 'success',
        message: `Agendamento registrado para o medidor ${meter.trim()}.`,
      })
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

      {availableSlot ? (
        <div className="available-slot-card" role="status">
          <p className="available-slot-title">Próxima data disponível</p>
          <p className="available-slot-value">{availableSlot}</p>
          <p className="available-slot-rules">
            Horários de 10 em 10 minutos, das 8:30 às 11:30 e das 14:00 às 16:30,
            respeitando dias bloqueados no calendário de ensaios.
          </p>
        </div>
      ) : null}

      <form className="form-grid schedule-form-grid" onSubmit={(event) => void handleSubmit(event)}>
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
            <option value="">{csdLoading ? 'Carregando CSDs...' : 'Localizar itens'}</option>
            {csdOptions.map((option) => (
              <option key={option.id} value={option.label}>
                {option.label}
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

        <button className="reserve-button full-width" type="submit" disabled={submitting}>
          {submitting ? 'Salvando...' : 'Salvar agendamento'}
        </button>
      </form>
    </>
  )
}
