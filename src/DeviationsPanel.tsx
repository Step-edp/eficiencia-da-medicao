import { useCallback, useEffect, useMemo, useState } from 'react'
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

const JUSTIFICATION_COLORS = [
  '#18d8f0',
  '#5bf000',
  '#34df9a',
  '#7ecbff',
  '#b6f56a',
  '#2ee6c7',
  '#9adfff',
  '#8dffc2',
]

function truncateLabel(value: string, max: number) {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
}

function ExclusionJustificationChart({ exclusions }: { exclusions: ScheduleExclusionRecord[] }) {
  const groups = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>()
    for (const item of exclusions) {
      const label = item.justification.trim() || 'Sem justificativa'
      const key = label.toLocaleLowerCase('pt-BR')
      const current = counts.get(key)
      if (current) current.count += 1
      else counts.set(key, { label, count: 1 })
    }
    return [...counts.values()].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'),
    )
  }, [exclusions])

  const width = 760
  const maxChartHeight = 200
  const pad = { left: 236, right: 40, top: 4, bottom: 4 }
  const rowHeight = Math.min(22, (maxChartHeight - pad.top - pad.bottom) / groups.length)
  const height = pad.top + pad.bottom + groups.length * rowHeight
  const barHeight = Math.min(10, rowHeight * 0.62)
  const fontSize = Math.min(11, rowHeight * 0.7)
  const max = Math.max(1, ...groups.map((group) => group.count))
  const innerWidth = width - pad.left - pad.right

  return (
    <article className="lab-bi-card exclusion-justification-chart">
      <h4>Justificativas de exclusão</h4>
      <svg
        className="lab-bi-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Quantidade de exclusões por justificativa"
      >
        {groups.map((group, index) => {
          const y = pad.top + index * rowHeight
          const barWidth = Math.max((group.count / max) * innerWidth, 6)
          const textY = y + rowHeight * 0.74
          return (
            <g key={group.label}>
              <title>
                {group.label}: {group.count}
              </title>
              <text
                className="lab-bi-axis"
                x={pad.left - 8}
                y={textY}
                textAnchor="end"
                style={{ fontSize }}
              >
                {truncateLabel(group.label, 34)}
              </text>
              <rect
                x={pad.left}
                y={y + (rowHeight - barHeight) / 2}
                width={barWidth}
                height={barHeight}
                rx={Math.min(6, barHeight / 2)}
                fill={JUSTIFICATION_COLORS[index % JUSTIFICATION_COLORS.length]}
              />
              <text
                className="lab-bi-point"
                x={pad.left + barWidth + 6}
                y={textY}
                style={{ fontSize }}
              >
                {group.count}
              </text>
            </g>
          )
        })}
      </svg>
    </article>
  )
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
            <>
            <ExclusionJustificationChart exclusions={exclusions} />
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
            </>
          )}
        </>
      )}

      {meterDetail ? (
        <MeterDetailModal meter={meterDetail} onClose={() => setMeterDetail(null)} />
      ) : null}
    </section>
  )
}
