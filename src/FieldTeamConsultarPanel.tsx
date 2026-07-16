import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type MeterScheduleRecord } from './api'

export function FieldTeamConsultarPanel() {
  const [schedules, setSchedules] = useState<MeterScheduleRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const load = useCallback(async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const { schedules: rows } = await api.listMeterSchedules()
      setSchedules(rows)
    } catch (error) {
      setSchedules([])
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os agendamentos.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="entrada-panel">
      <div className="entrada-panel-header">
        <p>Consulta dos medidores agendados pela equipe de campo.</p>
        <div className="entrada-panel-actions">
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={() => void load()}
            disabled={loading}
          >
            Atualizar
          </button>
        </div>
      </div>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">Carregando agendamentos...</p>
      ) : schedules.length === 0 ? (
        <p className="entrada-panel-empty">Nenhum agendamento encontrado.</p>
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
                <th>Equipe TOI</th>
                <th>Data agendada</th>
                <th>Etapa</th>
                <th>Criado por</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((item) => (
                <tr key={item.id}>
                  <td>{item.meter}</td>
                  <td>{item.installation || '—'}</td>
                  <td>{item.toi || '—'}</td>
                  <td>{item.note || '—'}</td>
                  <td>{item.csd || '—'}</td>
                  <td>
                    {item.toiCollaborator1Name || item.toiCollaborator2Name
                      ? [
                          item.toiCollaborator1Name
                            ? `${item.toiCollaborator1Name} (${item.toiCollaborator1Registration || '—'})`
                            : null,
                          item.toiCollaborator2Name
                            ? `${item.toiCollaborator2Name} (${item.toiCollaborator2Registration || '—'})`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : '—'}
                  </td>
                  <td>{item.scheduledAtLabel || '—'}</td>
                  <td>{item.trailStep || '—'}</td>
                  <td>{item.createdByRegistration || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
