import { useEffect, useState } from 'react'
import { LoginFeedback } from './LoginFeedback'
import {
  api,
  ApiError,
  type PontoFocalDashboardData,
  type PontoFocalLateMeter,
} from './api'

type PontoFocalDashboardProps = {
  forUserId?: string
  mode?: 'full' | 'late-meters'
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

function lateMeterMatchesQuery(item: PontoFocalLateMeter, query: string) {
  const haystack = normalizeSearch(
    [
      item.meter,
      item.installation,
      item.toi,
      item.note,
      item.csd,
      item.scheduledAtLabel,
      item.deliveryDeadlineLabel,
      `${item.daysLate} dia(s)`,
      item.delayJustification,
    ].join(' '),
  )
  if (haystack.includes(query)) return true
  const queryDigits = digitsOnly(query)
  if (queryDigits.length < 3) return false
  return (
    digitsOnly(item.meter).includes(queryDigits) ||
    digitsOnly(item.installation).includes(queryDigits)
  )
}

export function PontoFocalDashboard({
  forUserId,
  mode = 'full',
}: PontoFocalDashboardProps) {
  const [data, setData] = useState<PontoFocalDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )
  const [lateListTab, setLateListTab] = useState<'pending' | 'dismissed'>('pending')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    api
      .getPontoFocalDashboard(forUserId)
      .then((response) => {
        if (cancelled) return
        setData(response)
        const next: Record<string, string> = {}
        for (const meter of response.lateMeters ?? []) {
          next[meter.id] = meter.delayJustification
        }
        setDrafts(next)
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? err.message
            : mode === 'late-meters'
              ? 'Não foi possível carregar os medidores atrasados.'
              : 'Não foi possível carregar o dashboard.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [forUserId, mode])

  const handleSaveJustification = async (meter: PontoFocalLateMeter) => {
    const justification = (drafts[meter.id] ?? '').trim()
    setSavingId(meter.id)
    setFeedback(null)
    try {
      const { schedule } = await api.saveDelayJustification(meter.id, justification)
      setData((current) =>
        current
          ? {
              ...current,
              lateMeters: current.lateMeters.map((item) =>
                item.id === meter.id
                  ? { ...item, delayJustification: schedule.delayJustification ?? justification }
                  : item,
              ),
            }
          : current,
      )
      setDrafts((current) => ({
        ...current,
        [meter.id]: schedule.delayJustification ?? justification,
      }))
      setFeedback({
        type: 'success',
        message: `Justificativa do medidor ${meter.meter} salva.`,
      })
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof ApiError
            ? err.message
            : 'Não foi possível salvar a justificativa do atraso.',
      })
    } finally {
      setSavingId(null)
    }
  }

  const handleDismissMeter = async (meter: PontoFocalLateMeter) => {
    if (!meter.delayJustification) return
    setDeletingId(meter.id)
    setFeedback(null)
    try {
      await api.dismissDelayMeter(meter.id)
      setData((current) =>
        current
          ? {
              ...current,
              lateMeters: current.lateMeters.filter((item) => item.id !== meter.id),
              dismissedLateMeters: [
                { ...meter, dismissedAt: new Date().toISOString() },
                ...(current.dismissedLateMeters ?? []),
              ],
            }
          : current,
      )
      setFeedback({
        type: 'success',
        message: `Medidor ${meter.meter} excluído da lista. O registro foi mantido.`,
      })
      setLateListTab('dismissed')
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof ApiError
            ? err.message
            : 'Não foi possível excluir o medidor da lista de atrasos.',
      })
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <p className="generated-password-empty">
        {mode === 'late-meters'
          ? 'Carregando medidores atrasados…'
          : 'Carregando dashboard…'}
      </p>
    )
  }

  if (error) {
    return <LoginFeedback type="error" message={error} />
  }

  if (!data) {
    return <p className="generated-password-empty">Sem dados para exibir.</p>
  }

  const { current, delay, monthly, csdNames } = data
  const lateMeters = data.lateMeters ?? []
  const dismissedLateMeters = data.dismissedLateMeters ?? []
  const searchNormalized = normalizeSearch(searchQuery)
  const filteredLateMeters = searchNormalized
    ? lateMeters.filter((item) => lateMeterMatchesQuery(item, searchNormalized))
    : lateMeters
  const filteredDismissedLateMeters = searchNormalized
    ? dismissedLateMeters.filter((item) => lateMeterMatchesQuery(item, searchNormalized))
    : dismissedLateMeters
  const maxMonthTotal = Math.max(1, ...monthly.map((item) => item.total))
  const pendingJustification = filteredLateMeters.filter((item) => !item.delayJustification).length
  const hasSearch = Boolean(searchNormalized)
  const showSearch =
    lateMeters.length > 0 || dismissedLateMeters.length > 0 || hasSearch

  return (
    <div className="users-dashboard ponto-focal-dashboard">
      <p className="produtividade-intro">
        {mode === 'late-meters'
          ? 'Justifique o motivo do atraso dos medidores dos CSDs sob sua responsabilidade'
          : 'Indicadores de atraso na entrega dos medidores dos CSDs sob sua responsabilidade'}
        {csdNames.length ? (
          <>
            {' '}
            ({csdNames.join(', ')})
          </>
        ) : null}
        .
      </p>

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      {mode === 'full' ? (
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
      ) : null}

      <section className="entrada-section ponto-focal-late-section" aria-label="Medidores atrasados">
        <div className="entrada-section-heading">
          <h3 className="entrada-section-title">
            {lateListTab === 'dismissed' ? 'Medidores excluídos' : 'Medidores atrasados'}
          </h3>
          {lateListTab === 'pending' && lateMeters.length > 0 ? (
            <p className="demm-analysis-summary">
              {`${hasSearch ? `${filteredLateMeters.length} de ${lateMeters.length}` : lateMeters.length} atrasado(s)${
                pendingJustification
                  ? ` · ${pendingJustification} sem justificativa`
                  : ''
              }`}
            </p>
          ) : null}
          {lateListTab === 'dismissed' && dismissedLateMeters.length > 0 ? (
            <p className="demm-analysis-summary">
              {`${hasSearch ? `${filteredDismissedLateMeters.length} de ${dismissedLateMeters.length}` : dismissedLateMeters.length} registro(s) excluído(s)`}
            </p>
          ) : null}
        </div>

        <div
          className="panel-switch users-view-switch"
          role="tablist"
          aria-label="Lista de medidores atrasados"
        >
          <button
            type="button"
            role="tab"
            aria-selected={lateListTab === 'pending'}
            className={lateListTab === 'pending' ? 'active' : ''}
            onClick={() => setLateListTab('pending')}
          >
            Atrasados
            {lateMeters.length > 0 ? ` (${lateMeters.length})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lateListTab === 'dismissed'}
            className={lateListTab === 'dismissed' ? 'active' : ''}
            onClick={() => setLateListTab('dismissed')}
          >
            Excluídos
            {dismissedLateMeters.length > 0 ? ` (${dismissedLateMeters.length})` : ''}
          </button>
        </div>

        {showSearch ? (
          <div className="consultar-toolbar">
            <label className="consultar-search">
              <span className="sr-only">Pesquisar medidores</span>
              <span className="consultar-search-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle
                    cx="11"
                    cy="11"
                    r="7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M20 20l-3.5-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Pesquisar por medidor, instalação, CSD, motivo…"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>
        ) : null}

        {lateListTab === 'pending' ? (
          lateMeters.length === 0 ? (
            <p className="entrada-panel-empty">Não há medidores atrasados para justificar.</p>
          ) : filteredLateMeters.length === 0 ? (
            <p className="entrada-panel-empty">Nenhum resultado para a pesquisa.</p>
          ) : (
          <div className="entrada-table-wrap">
            <table className="data-table entrada-table">
              <thead>
                <tr>
                  <th>Medidor</th>
                  <th>Instalação</th>
                  <th>CSD</th>
                  <th>Data de ensaio</th>
                  <th>Prazo entrega</th>
                  <th>Dias de atraso</th>
                  <th>Motivo do atraso</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredLateMeters.map((item) => {
                  const justified = Boolean(item.delayJustification)
                  return (
                    <tr key={item.id} className="schedule-row-late">
                      <td>{item.meter}</td>
                      <td>{item.installation || '—'}</td>
                      <td>{item.csd || '—'}</td>
                      <td>{item.scheduledAtLabel}</td>
                      <td>{item.deliveryDeadlineLabel}</td>
                      <td>
                        <span className="schedule-late-badge">{item.daysLate} dia(s)</span>
                      </td>
                      <td>
                        <textarea
                          className="ponto-focal-delay-input"
                          value={drafts[item.id] ?? ''}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          placeholder="Informe o motivo do atraso"
                          rows={2}
                          disabled={savingId === item.id}
                        />
                      </td>
                      <td>
                        <div className="ponto-focal-row-actions">
                          <button
                            type="button"
                            className={`ponto-focal-save-button${justified ? ' is-justified' : ''}`}
                            disabled={
                              savingId === item.id ||
                              deletingId === item.id ||
                              (drafts[item.id] ?? '').trim().length < 5
                            }
                            onClick={() => void handleSaveJustification(item)}
                            aria-label={
                              savingId === item.id
                                ? `Salvando justificativa do medidor ${item.meter}`
                                : `Salvar justificativa do medidor ${item.meter}`
                            }
                            title={justified ? 'Justificado' : 'Salvar'}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M5 12.5l4.5 4.5L19 7.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="entrada-demm-delete-button"
                            disabled={!justified || deletingId === item.id || savingId === item.id}
                            onClick={() => void handleDismissMeter(item)}
                            aria-label={
                              justified
                                ? `Excluir medidor ${item.meter} da lista de atrasos`
                                : `Informe a justificativa antes de excluir o medidor ${item.meter}`
                            }
                            title={
                              justified
                                ? 'Excluir'
                                : 'Informe a justificativa antes de excluir'
                            }
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )
        ) : dismissedLateMeters.length === 0 ? (
          <p className="entrada-panel-empty">Nenhum medidor excluído desta lista.</p>
        ) : filteredDismissedLateMeters.length === 0 ? (
          <p className="entrada-panel-empty">Nenhum resultado para a pesquisa.</p>
        ) : (
          <div className="entrada-table-wrap">
            <table className="data-table entrada-table">
              <thead>
                <tr>
                  <th>Medidor</th>
                  <th>Instalação</th>
                  <th>CSD</th>
                  <th>Data de ensaio</th>
                  <th>Prazo entrega</th>
                  <th>Dias de atraso</th>
                  <th>Motivo do atraso</th>
                </tr>
              </thead>
              <tbody>
                {filteredDismissedLateMeters.map((item) => (
                  <tr key={item.id}>
                    <td>{item.meter}</td>
                    <td>{item.installation || '—'}</td>
                    <td>{item.csd || '—'}</td>
                    <td>{item.scheduledAtLabel}</td>
                    <td>{item.deliveryDeadlineLabel}</td>
                    <td>
                      <span className="schedule-late-badge">{item.daysLate} dia(s)</span>
                    </td>
                    <td>{item.delayJustification || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {mode === 'full' ? (
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
      ) : null}
    </div>
  )
}
