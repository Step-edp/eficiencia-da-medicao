import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './api'
import { ENTRADA_TRAIL_STEP } from './labTrailSteps'

function formatDateTime(isoDate: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(isoDate))
}

type EntradaPanelProps = {
  onCountChange?: (count: number) => void
}

export function EntradaPanel({ onCountChange }: EntradaPanelProps) {
  const [schedules, setSchedules] = useState<Awaited<ReturnType<typeof api.listMeterSchedules>>['schedules']>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const loadSchedules = useCallback(async () => {
    setLoading(true)
    setFeedback(null)

    try {
      const response = await api.listMeterSchedules(ENTRADA_TRAIL_STEP)
      setSchedules(response.schedules)
      onCountChange?.(response.total)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os medidores agendados.',
      })
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  useEffect(() => {
    void loadSchedules()
  }, [loadSchedules])

  return (
    <div className="entrada-panel">
      <div className="entrada-panel-header">
        <p className="entrada-panel-intro">
          Medidores agendados pela equipe de campo aguardando entrada no laboratório.
        </p>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void loadSchedules()}
          disabled={loading}
        >
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      {loading && schedules.length === 0 ? (
        <p className="entrada-panel-empty">Carregando medidores...</p>
      ) : schedules.length === 0 ? (
        <p className="entrada-panel-empty">Nenhum medidor agendado aguardando entrada.</p>
      ) : (
        <div className="entrada-table-wrap">
          <table className="data-table entrada-table">
            <thead>
              <tr>
                <th>Medidor</th>
                <th>Instalação</th>
                <th>TOI</th>
                <th>Nota</th>
                <th>CSD</th>
                <th>Cliente presente</th>
                <th>Data agendada</th>
                <th>Agendado por</th>
                <th>Registrado em</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={schedule.id}>
                  <td>{schedule.meter}</td>
                  <td>{schedule.installation}</td>
                  <td>{schedule.toi}</td>
                  <td>{schedule.note}</td>
                  <td>{schedule.csd}</td>
                  <td>{schedule.clientPresent === 'sim' ? 'Sim' : 'Não'}</td>
                  <td>{schedule.scheduledAtLabel}</td>
                  <td>{schedule.createdByRegistration ?? '—'}</td>
                  <td>{formatDateTime(schedule.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
