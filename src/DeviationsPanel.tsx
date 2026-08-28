import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type ScheduleExclusionRecord } from './api'
import { LoginFeedback } from './LoginFeedback'
import { MeterDetailModal } from './MeterDetailModal'
import { ScheduleDateAdjustmentsPanel } from './ScheduleDateAdjustmentsPanel'

function formatPerson(name: string | null | undefined, registration: string | null | undefined) {
  const normalizedName = name?.trim()
  const normalizedRegistration = registration?.trim()
  if (normalizedName && normalizedRegistration) {
    return `${normalizedName} (${normalizedRegistration})`
  }
  return normalizedName || normalizedRegistration || '—'
}

function formatWhen(isoDate: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(isoDate))
}

export function DeviationsPanel({
  readOnly = false,
  onPendingCountChange,
}: {
  readOnly?: boolean
  onPendingCountChange?: (count: number) => void
}) {
  const [tab, setTab] = useState<'deviations' | 'exclusions'>('deviations')
  const [exclusions, setExclusions] = useState<ScheduleExclusionRecord[]>([])
  const [exclusionsLoading, setExclusionsLoading] = useState(false)
  const [exclusionsError, setExclusionsError] = useState('')
  const [meterDetail, setMeterDetail] = useState<string | null>(null)

  const loadExclusions = useCallback(async () => {
    setExclusionsLoading(true)
    setExclusionsError('')
    try {
      const response = await api.listScheduleExclusions()
      setExclusions(response.exclusions)
    } catch (err) {
      setExclusions([])
      setExclusionsError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar os registros de exclusão.',
      )
    } finally {
      setExclusionsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'exclusions') {
      void loadExclusions()
    }
  }, [loadExclusions, tab])

  return (
    <section className="entrada-section" aria-label="Desvios">
      <div className="entrada-section-heading">
        <h3 className="entrada-section-title">Desvios</h3>
      </div>
      <p className="entrada-panel-intro">
        Consulte os apontamentos de desvio gerados para os colaboradores do TOI e os registros de
        exclusão de agendamentos ou da lista de medidores atrasados.
      </p>

      <div
        className="panel-switch users-view-switch"
        role="tablist"
        aria-label="Tipos de desvio"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'deviations'}
          className={tab === 'deviations' ? 'active' : ''}
          onClick={() => setTab('deviations')}
        >
          Apontamentos de desvio
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'exclusions'}
          className={tab === 'exclusions' ? 'active' : ''}
          onClick={() => setTab('exclusions')}
        >
          Exclusões
          {exclusions.length > 0 ? ` (${exclusions.length})` : ''}
        </button>
      </div>

      {tab === 'deviations' ? (
        <ScheduleDateAdjustmentsPanel
          embedded
          scope="all"
          title="Apontamentos de desvio"
          intro="Desvios de preenchimento (instalação, TOI, nota ou CSD corrigidos), medidor agendado errado, data/horário de agendamento diferente do documento, medidor não agendado em campo, ausência de registro fotográfico e registro fotográfico com baixa qualidade."
          includeFillingDeviations
          readOnly={readOnly}
          onPendingCountChange={onPendingCountChange}
        />
      ) : (
        <>
          {exclusionsError ? <LoginFeedback type="error" message={exclusionsError} /> : null}
          {exclusionsLoading && exclusions.length === 0 ? (
            <p className="entrada-panel-empty">Carregando exclusões...</p>
          ) : exclusions.length === 0 ? (
            <p className="entrada-panel-empty">Nenhum registro de exclusão encontrado.</p>
          ) : (
            <div className="entrada-table-wrap">
              <p className="demm-analysis-summary">{exclusions.length} registro(s) de exclusão</p>
              <table className="data-table entrada-table">
                <thead>
                  <tr>
                    <th>Medidor</th>
                    <th>Instalação</th>
                    <th>CSD</th>
                    <th>Tipo</th>
                    <th>Justificativa</th>
                    <th>Excluído por</th>
                    <th>Excluído em</th>
                  </tr>
                </thead>
                <tbody>
                  {exclusions.map((item) => (
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
                      <td>{item.installation || '—'}</td>
                      <td>{item.csd || '—'}</td>
                      <td>{item.kindLabel}</td>
                      <td>{item.justification || '—'}</td>
                      <td>{formatPerson(item.excludedByName, item.excludedByRegistration)}</td>
                      <td>{formatWhen(item.excludedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {meterDetail ? (
        <MeterDetailModal meter={meterDetail} onClose={() => setMeterDetail(null)} />
      ) : null}
    </section>
  )
}
