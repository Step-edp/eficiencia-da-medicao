import { useEffect, useMemo, useState } from 'react'
import { LoginFeedback } from './LoginFeedback'
import { api, ApiError, type AgendamentoDashboardData } from './api'

const MONTH_KEYS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] as const

type ChartMode = 'month' | 'year'

function formatDays(value: number | null | undefined) {
  if (value == null) return '—'
  const label = value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  })
  return `${label} ${value === 1 ? 'dia' : 'dias'}`
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  const label = date.toLocaleDateString('pt-BR', { month: 'short' })
  return label.replace('.', '').replace(/^./, (letter) => letter.toUpperCase())
}

function currentYear() {
  return new Date().getFullYear()
}

export function AgendamentoDashPanel() {
  const [data, setData] = useState<AgendamentoDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chartMode, setChartMode] = useState<ChartMode>('month')
  const [selectedYear, setSelectedYear] = useState(currentYear())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    api
      .getAgendamentoDashboard()
      .then((response) => {
        if (cancelled) return
        setData(response)
        const years = response.years.length ? response.years : [currentYear()]
        setSelectedYear(years.includes(currentYear()) ? currentYear() : years[0])
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? err.message
            : 'Não foi possível carregar o dashboard de agendamento.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const yearOptions = data?.years.length ? data.years : [selectedYear]
  const monthlyBars = useMemo(() => {
    const byKey = new Map((data?.monthly ?? []).map((item) => [item.monthKey, item]))
    return MONTH_KEYS.map((month) => {
      const monthKey = `${selectedYear}-${month}`
      const item = byKey.get(monthKey)
      return {
        key: monthKey,
        label: monthLabel(monthKey),
        total: item?.total ?? 0,
        avgDays: item?.avgDays ?? null,
      }
    })
  }, [data, selectedYear])

  const yearlyBars = data?.yearly ?? []
  const selectedYearStats = yearlyBars.find((item) => item.year === selectedYear)
  const chartItems =
    chartMode === 'month'
      ? monthlyBars
      : yearlyBars.map((item) => ({
          key: String(item.year),
          label: String(item.year),
          total: item.total,
          avgDays: item.avgDays,
        }))
  const maxTotal = Math.max(1, ...chartItems.map((item) => item.total))

  if (loading) {
    return <p className="entrada-panel-empty">Carregando indicadores de agendamento...</p>
  }

  if (error) {
    return <LoginFeedback type="error" message={error} />
  }

  if (!data) {
    return <p className="entrada-panel-empty">Sem dados para exibir.</p>
  }

  return (
    <div className="users-dashboard agendamento-dash" aria-label="Dash de agendamento">
      <p className="produtividade-intro">
        Volume de agendamentos por mês e por ano, com o tempo médio entre a data do
        agendamento e a data de ensaio.
      </p>

      <div className="users-dashboard-kpis agendamento-dash-kpis" aria-label="Indicadores">
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Agendamentos</p>
          <p className="users-dashboard-kpi-value">{data.total.toLocaleString('pt-BR')}</p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Tempo médio até o ensaio</p>
          <p className="users-dashboard-kpi-value">{formatDays(data.averageDays)}</p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Média em {selectedYear}</p>
          <p className="users-dashboard-kpi-value">
            {formatDays(selectedYearStats?.avgDays ?? null)}
          </p>
        </article>
      </div>

      <div className="users-dashboard-card ponto-focal-monthly-card agendamento-dash-chart-card">
        <div className="agendamento-dash-toolbar">
          <div>
            <h4>Agendamentos {chartMode === 'month' ? 'por mês' : 'por ano'}</h4>
            <p className="users-dashboard-ranking-hint">
              {chartMode === 'month'
                ? 'Quantidade registrada em cada mês do ano selecionado.'
                : 'Quantidade total registrada em cada ano.'}
            </p>
          </div>
          <div className="agendamento-dash-controls">
            <div
              className="panel-switch users-view-switch agendamento-dash-mode"
              role="tablist"
              aria-label="Visualização do gráfico"
            >
              <button
                type="button"
                role="tab"
                className={chartMode === 'month' ? 'active' : ''}
                aria-selected={chartMode === 'month'}
                onClick={() => setChartMode('month')}
              >
                Por mês
              </button>
              <button
                type="button"
                role="tab"
                className={chartMode === 'year' ? 'active' : ''}
                aria-selected={chartMode === 'year'}
                onClick={() => setChartMode('year')}
              >
                Por ano
              </button>
            </div>
            {chartMode === 'month' ? (
              <label className="agendamento-dash-year">
                Ano
                <select
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>

        {chartItems.some((item) => item.total > 0) ? (
          <div
            className="ponto-focal-month-chart"
            role="img"
            aria-label={
              chartMode === 'month'
                ? `Agendamentos por mês em ${selectedYear}`
                : 'Agendamentos por ano'
            }
          >
            {chartItems.map((item) => {
              const height = Math.round((item.total / maxTotal) * 100)
              return (
                <div key={item.key} className="ponto-focal-month-col">
                  <span className="ponto-focal-month-counts">{item.total}</span>
                  <div className="ponto-focal-month-bars" aria-hidden="true">
                    <div
                      className="ponto-focal-month-bar agendamento-dash-bar"
                      style={{ height: `${Math.max(height, item.total > 0 ? 4 : 0)}%` }}
                      title={`${item.label}: ${item.total} agendamento(s)`}
                    />
                  </div>
                  <span className="ponto-focal-month-label">{item.label}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="generated-password-empty">Sem agendamentos neste período.</p>
        )}
      </div>
    </div>
  )
}
