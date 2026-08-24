import { useCallback, useEffect, useState } from 'react'
import {
  api,
  ApiError,
  type ScheduleDateAdjustmentRecord,
} from './api'
import { LoginFeedback } from './LoginFeedback'
import { MeterDetailModal } from './MeterDetailModal'

function formatCollaborator(name: string, registration: string) {
  const trimmedName = name.trim()
  const trimmedRegistration = registration.trim()
  if (trimmedName && trimmedRegistration) return `${trimmedName} (${trimmedRegistration})`
  return trimmedName || trimmedRegistration || '—'
}

function formatAdjustedBy(item: ScheduleDateAdjustmentRecord) {
  return formatCollaborator(item.createdByName ?? '', item.createdByRegistration ?? '')
}

function formatWhen(isoDate: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(isoDate))
}

export function ScheduleDateAdjustmentsPanel({
  scope,
  title,
  intro,
}: {
  scope: 'all' | 'mine'
  title: string
  intro: string
}) {
  const [items, setItems] = useState<ScheduleDateAdjustmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [meterDetail, setMeterDetail] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.listScheduleDateAdjustments(scope)
      setItems(response.adjustments)
    } catch (err) {
      setItems([])
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar as alterações de data.',
      )
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="entrada-section" aria-label={title}>
      <div className="entrada-section-heading">
        <h3 className="entrada-section-title">{title}</h3>
        <p className="demm-analysis-summary">
          {loading
            ? 'Carregando...'
            : `${items.length} medidor(es) com data de agendamento alterada`}
        </p>
      </div>
      <p className="entrada-panel-intro">{intro}</p>

      {error ? <LoginFeedback type="error" message={error} /> : null}

      {loading && items.length === 0 ? (
        <p className="entrada-panel-empty">Carregando alterações...</p>
      ) : items.length === 0 ? (
        <p className="entrada-panel-empty">Nenhuma alteração de data registrada.</p>
      ) : (
        <div className="entrada-table-wrap">
          <table className="data-table entrada-table">
            <thead>
              <tr>
                <th>Medidor</th>
                <th>Agendado no sistema</th>
                <th>No documento</th>
                <th>Colaborador 1</th>
                <th>Colaborador 2</th>
                <th>Ajustado por</th>
                <th>Em</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button
                      type="button"
                      className="schedule-meter-link"
                      onClick={() => setMeterDetail(item.meter)}
                    >
                      {item.meter}
                    </button>
                  </td>
                  <td>{item.scheduledLabel}</td>
                  <td>{item.documentLabel}</td>
                  <td>
                    {formatCollaborator(item.collaborator1Name, item.collaborator1Registration)}
                  </td>
                  <td>
                    {formatCollaborator(item.collaborator2Name, item.collaborator2Registration)}
                  </td>
                  <td>{formatAdjustedBy(item)}</td>
                  <td>{formatWhen(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meterDetail ? (
        <MeterDetailModal meter={meterDetail} onClose={() => setMeterDetail(null)} />
      ) : null}
    </section>
  )
}
