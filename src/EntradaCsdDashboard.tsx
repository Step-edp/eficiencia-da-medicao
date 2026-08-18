import { useEffect, useState } from 'react'
import { LoginFeedback } from './LoginFeedback'
import {
  api,
  ApiError,
  type EntradaCsdDashboardData,
  type EntradaCsdDashboardRecord,
} from './api'

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function scoreClass(score: number) {
  if (score >= 80) return 'is-good'
  if (score >= 60) return 'is-mid'
  return 'is-bad'
}

function RankingTable({
  title,
  hint,
  rows,
  valueLabel,
  renderValue,
}: {
  title: string
  hint: string
  rows: EntradaCsdDashboardRecord[]
  valueLabel: string
  renderValue: (row: EntradaCsdDashboardRecord) => string
}) {
  return (
    <div className="users-dashboard-card users-dashboard-ranking">
      <h4>{title}</h4>
      <p className="users-dashboard-ranking-hint">{hint}</p>
      {rows.length ? (
        <div className="entrada-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>CSD</th>
                <th>{valueLabel}</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.csdId}>
                  <td className="users-dashboard-rank-cell">{index + 1}</td>
                  <td>{row.csdName}</td>
                  <td>{renderValue(row)}</td>
                  <td>
                    <span className={`entrada-csd-score ${scoreClass(row.score)}`}>
                      {row.score}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="generated-password-empty">Sem dados para exibir.</p>
      )}
    </div>
  )
}

export function EntradaCsdDashboard() {
  const [data, setData] = useState<EntradaCsdDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    api
      .getEntradaCsdDashboard()
      .then((response) => {
        if (!cancelled) setData(response)
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? err.message
            : 'Não foi possível carregar o dashboard por CSD.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <p className="entrada-panel-empty">Carregando indicadores por CSD...</p>
  }

  if (error) {
    return <LoginFeedback type="error" message={error} />
  }

  if (!data) {
    return <p className="entrada-panel-empty">Sem dados para exibir.</p>
  }

  const { summary, csds, rankings } = data
  const activeCsds = csds.filter((item) => item.rank !== null)
  const lateProportionOverall =
    summary.scheduledTotal > 0 ? summary.delayedOverall / summary.scheduledTotal : 0
  const unscheduledProportionOverall =
    summary.demmMetersTotal > 0 ? summary.unscheduledMeters / summary.demmMetersTotal : 0

  return (
    <div className="entrada-csd-dashboard">
      <div className="users-dashboard-kpis" aria-label="Resumo geral">
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Entregas fora do prazo</p>
          <p className="users-dashboard-kpi-value">
            {summary.delayedOverall}{' '}
            <span className="ponto-focal-kpi-pct">({formatPercent(lateProportionOverall)})</span>
          </p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Sem agendamento prévio</p>
          <p className="users-dashboard-kpi-value">
            {summary.unscheduledMeters}{' '}
            <span className="ponto-focal-kpi-pct">
              ({formatPercent(unscheduledProportionOverall)})
            </span>
          </p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Medidores em DEMMs</p>
          <p className="users-dashboard-kpi-value">{summary.demmMetersTotal}</p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Agendados (Entrada)</p>
          <p className="users-dashboard-kpi-value">{summary.scheduledTotal}</p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Score médio dos CSDs</p>
          <p className="users-dashboard-kpi-value">
            {summary.avgScore ?? '—'}
            {summary.avgScore !== null ? (
              <span className="ponto-focal-kpi-pct"> / 100</span>
            ) : null}
          </p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">CSDs com movimento</p>
          <p className="users-dashboard-kpi-value">{activeCsds.length}</p>
        </article>
      </div>

      <div className="users-dashboard-rankings-grid">
        <RankingTable
          title="Melhor score geral"
          hint="CSDs com melhor desempenho combinado."
          rows={rankings.byScore}
          valueLabel="Score"
          renderValue={(row) => String(row.score)}
        />
        <RankingTable
          title="Mais entregas fora do prazo"
          hint="Maior proporção de atraso (pendente ou entregue tarde)."
          rows={rankings.byLate}
          valueLabel="Fora do prazo"
          renderValue={(row) =>
            `${row.delayedOverall} (${formatPercent(row.lateProportion)})`
          }
        />
        <RankingTable
          title="Maior SLA médio"
          hint="Tempo médio em dias entre o agendamento e a entrada no laboratório (cadastro da DEMM)."
          rows={rankings.bySla}
          valueLabel="SLA médio"
          renderValue={(row) =>
            row.avgSlaDays !== null ? `${row.avgSlaDays} dias` : '—'
          }
        />
        <RankingTable
          title="Mais medidores sem agendamento"
          hint="Entregou DEMM sem agendamento prévio no sistema."
          rows={rankings.byUnscheduled}
          valueLabel="Sem agendamento"
          renderValue={(row) =>
            `${row.unscheduledMeters} (${formatPercent(row.unscheduledProportion)})`
          }
        />
      </div>

      <div className="users-dashboard-card users-dashboard-ranking">
        <h4>Detalhamento por CSD</h4>
        <p className="users-dashboard-ranking-hint">
          Visão completa com score, atrasos, SLA e medidores não agendados.
        </p>
        {activeCsds.length ? (
          <div className="entrada-table-wrap">
            <table className="data-table entrada-csd-dashboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>CSD</th>
                  <th>Responsável</th>
                  <th>Score</th>
                  <th>Fora do prazo</th>
                  <th>SLA médio</th>
                  <th>Sem agendamento</th>
                  <th>Agendados</th>
                  <th>Em DEMMs</th>
                </tr>
              </thead>
              <tbody>
                {activeCsds.map((row) => (
                  <tr key={row.csdId}>
                    <td className="users-dashboard-rank-cell">{row.rank}</td>
                    <td>{row.csdName}</td>
                    <td>{row.responsibleName ?? '—'}</td>
                    <td>
                      <span className={`entrada-csd-score ${scoreClass(row.score)}`}>
                        {row.score}
                      </span>
                    </td>
                    <td>
                      {row.delayedOverall}{' '}
                      <span className="entrada-csd-submetric">
                        ({formatPercent(row.lateProportion)})
                      </span>
                    </td>
                    <td>
                      {row.avgSlaDays !== null ? (
                        <>
                          {row.avgSlaDays} dias
                          <span className="entrada-csd-submetric">
                            {' '}
                            ({row.slaSampleCount} entrada(s) no lab)
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {row.demmMetersTotal > 0 ? (
                        <>
                          {row.unscheduledMeters}{' '}
                          <span className="entrada-csd-submetric">
                            ({formatPercent(row.unscheduledProportion)})
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{row.scheduledTotal}</td>
                    <td>{row.demmMetersTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="generated-password-empty">Nenhum CSD com movimento registrado.</p>
        )}
      </div>
    </div>
  )
}
