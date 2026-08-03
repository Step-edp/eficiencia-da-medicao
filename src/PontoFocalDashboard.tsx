import { useEffect, useState } from 'react'
import { LoginFeedback } from './LoginFeedback'
import { api, ApiError, type PontoFocalDashboardData } from './api'

type PontoFocalDashboardProps = {
  forUserId?: string
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

export function PontoFocalDashboard({ forUserId }: PontoFocalDashboardProps) {
  const [data, setData] = useState<PontoFocalDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    api
      .getPontoFocalDashboard(forUserId)
      .then((response) => {
        if (!cancelled) setData(response)
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? err.message
            : 'Não foi possível carregar o dashboard.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [forUserId])

  if (loading) {
    return <p className="generated-password-empty">Carregando dashboard…</p>
  }

  if (error) {
    return <LoginFeedback message={error} tone="error" />
  }

  if (!data) {
    return <p className="generated-password-empty">Sem dados para exibir.</p>
  }

  const { current, delay, monthly, csdNames } = data
  const maxMonthTotal = Math.max(1, ...monthly.map((item) => item.total))

  return (
    <div className="users-dashboard ponto-focal-dashboard">
      <p className="produtividade-intro">
        Indicadores de atraso na entrega dos medidores dos CSDs sob sua
        responsabilidade
        {csdNames.length ? (
          <>
            {' '}
            ({csdNames.join(', ')})
          </>
        ) : null}
        . A entrega deve ocorrer até a última sexta antes da data de ensaio.
      </p>

      <div className="users-dashboard-kpis" aria-label="Indicadores atuais">
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Medidores no CSD</p>
          <p className="users-dashboard-kpi-value">{current.total}</p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Atrasados agora</p>
          <p className="users-dashboard-kpi-value">
            {current.late}{' '}
            <span className="ponto-focal-kpi-pct">
              ({formatPercent(current.lateProportion)})
            </span>
          </p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Entregues no prazo</p>
          <p className="users-dashboard-kpi-value">
            {current.deliveredOnTime}{' '}
            <span className="ponto-focal-kpi-pct">
              ({formatPercent(current.onTimeProportion)})
            </span>
          </p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Maior atraso</p>
          <p className="users-dashboard-kpi-value">
            {delay.maxDays}{' '}
            <span className="ponto-focal-kpi-pct">dias</span>
          </p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Média de atraso</p>
          <p className="users-dashboard-kpi-value">
            {delay.averageDays}{' '}
            <span className="ponto-focal-kpi-pct">dias</span>
          </p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Atraso geral</p>
          <p className="users-dashboard-kpi-value">
            {current.delayedOverall}{' '}
            <span className="ponto-focal-kpi-pct">
              ({formatPercent(current.delayedOverallProportion)})
            </span>
          </p>
        </article>
      </div>

      <div className="users-dashboard-grid">
        <div className="users-dashboard-card">
          <h4>Situação atual</h4>
          <ul className="users-dashboard-bars" aria-label="Proporção atual">
            {[
              {
                label: 'Atrasados',
                count: current.late,
                percent: Math.round(current.lateProportion * 100),
                tone: 'late' as const,
              },
              {
                label: 'No prazo (pendentes)',
                count: current.onTimePending,
                percent:
                  current.total > 0
                    ? Math.round((current.onTimePending / current.total) * 100)
                    : 0,
                tone: 'ok' as const,
              },
              {
                label: 'Entregues no prazo',
                count: current.deliveredOnTime,
                percent: Math.round(current.onTimeProportion * 100),
                tone: 'ok' as const,
              },
              {
                label: 'Entregues com atraso',
                count: current.deliveredLate,
                percent:
                  current.total > 0
                    ? Math.round((current.deliveredLate / current.total) * 100)
                    : 0,
                tone: 'late' as const,
              },
            ].map((item) => (
              <li key={item.label}>
                <div className="users-dashboard-bar-meta">
                  <span>{item.label}</span>
                  <strong>
                    {item.count} <span>({item.percent}%)</span>
                  </strong>
                </div>
                <div className="users-dashboard-bar-track" aria-hidden="true">
                  <div
                    className={`users-dashboard-bar-fill ponto-focal-bar-${item.tone}`}
                    style={{
                      width: `${Math.max(item.percent, item.count > 0 ? 2 : 0)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="users-dashboard-card ponto-focal-monthly-card">
          <h4>Histórico mensal</h4>
          <p className="users-dashboard-ranking-hint">
            Atrasados vs. no prazo por mês do prazo de entrega (últimos 12 meses).
          </p>
          {monthly.length ? (
            <div className="ponto-focal-month-chart" role="img" aria-label="Gráfico mensal de atrasos">
              {monthly.map((item) => {
                const lateHeight =
                  maxMonthTotal > 0
                    ? Math.round((item.late / maxMonthTotal) * 100)
                    : 0
                const onTimeHeight =
                  maxMonthTotal > 0
                    ? Math.round((item.onTime / maxMonthTotal) * 100)
                    : 0
                return (
                  <div key={item.monthKey} className="ponto-focal-month-col">
                    <div className="ponto-focal-month-bars" aria-hidden="true">
                      <div
                        className="ponto-focal-month-bar ponto-focal-bar-late"
                        style={{ height: `${Math.max(lateHeight, item.late > 0 ? 4 : 0)}%` }}
                        title={`Atrasados: ${item.late}`}
                      />
                      <div
                        className="ponto-focal-month-bar ponto-focal-bar-ok"
                        style={{ height: `${Math.max(onTimeHeight, item.onTime > 0 ? 4 : 0)}%` }}
                        title={`No prazo: ${item.onTime}`}
                      />
                    </div>
                    <span className="ponto-focal-month-label">{item.label}</span>
                    <span className="ponto-focal-month-counts">
                      {item.late}/{item.onTime}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="generated-password-empty">Sem histórico mensal.</p>
          )}
          <div className="ponto-focal-legend" aria-hidden="true">
            <span>
              <i className="ponto-focal-legend-swatch ponto-focal-bar-late" /> Atrasados
            </span>
            <span>
              <i className="ponto-focal-legend-swatch ponto-focal-bar-ok" /> No prazo
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
