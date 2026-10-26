import { useEffect, useMemo, useState } from 'react'
import { api, ApiError, type LabVisaoDashboardData } from './api'
import { EdpLogo } from './EdpLogo'
import { LoginFeedback } from './LoginFeedback'

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const SHORT_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const TMA_COLOR = '#3ec6e0'
const PRAZO_COLOR = '#f08a3c'
const AGENDADO_COLOR = '#c5d0dc'
const ANTECIPADO_COLOR = '#ff5d5d'
const COLLAB_COLORS = [
  '#18d8f0',
  '#5bf000',
  '#34df9a',
  '#7ecbff',
  '#b6f56a',
  '#2ee6c7',
  '#9adfff',
  '#8dffc2',
]

type Point = { label: string; values: Array<number | null> }

function formatCount(value: number) {
  return value.toLocaleString('pt-BR')
}

function formatMetric(value: number | null) {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function average(sum: number, count: number) {
  if (!count) return null
  return Math.round((sum / count) * 100) / 100
}

function dayLabel(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const short = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${day} de ${short}`
}

function monthOf(iso: string) {
  return Number(iso.slice(5, 7))
}

function niceMax(value: number) {
  if (value <= 5) return 5
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = magnitude / 2
  return Math.ceil(value / step) * step
}

function TrendChart({
  points,
  series,
  ariaLabel,
  showPointLabels = true,
  height = 250,
}: {
  points: Point[]
  series: Array<{ name: string; color: string }>
  ariaLabel: string
  showPointLabels?: boolean
  height?: number
}) {
  const width = 760
  const pad = { left: 40, right: 16, top: 22, bottom: 28 }
  const values = points.flatMap((point) => point.values.filter((value): value is number => value != null))
  const yMax = niceMax(Math.max(1, ...values))
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const xAt = (index: number) =>
    pad.left + (points.length <= 1 ? innerW / 2 : (index / (points.length - 1)) * innerW)
  const yAt = (value: number) => pad.top + innerH - (value / yMax) * innerH
  const labelStep = points.length > 12 ? Math.ceil(points.length / 8) : 1

  return (
    <svg className="lab-bi-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
      {[0, 0.5, 1].map((mark) => {
        const value = yMax * mark
        const y = yAt(value)
        return (
          <g key={mark}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="lab-bi-grid" />
            <text x={pad.left - 8} y={y + 4} className="lab-bi-axis" textAnchor="end">
              {formatMetric(value)}
            </text>
          </g>
        )
      })}
      {series.map((item, seriesIndex) => {
        const coords = points.flatMap((point, index) => {
          const value = point.values[seriesIndex]
          return value == null ? [] : [{ index, value }]
        })
        const line = coords.map((coord) => `${xAt(coord.index)},${yAt(coord.value)}`).join(' ')
        return (
          <g key={item.name}>
            {coords.length > 1 ? (
              <polyline points={line} fill="none" stroke={item.color} strokeWidth="2.4" />
            ) : null}
            {coords.map((coord) => (
              <g key={`${item.name}-${coord.index}`}>
                <circle cx={xAt(coord.index)} cy={yAt(coord.value)} r="3.4" fill={item.color} />
                {showPointLabels && points.length <= 16 ? (
                  <text
                    x={xAt(coord.index)}
                    y={yAt(coord.value) - 8}
                    className="lab-bi-point"
                    textAnchor="middle"
                    fill={item.color}
                  >
                    {formatMetric(coord.value)}
                  </text>
                ) : null}
              </g>
            ))}
          </g>
        )
      })}
      {points.map((point, index) =>
        index % labelStep === 0 ? (
          <text key={point.label} x={xAt(index)} y={height - 8} className="lab-bi-axis" textAnchor="middle">
            {point.label}
          </text>
        ) : null,
      )}
    </svg>
  )
}

function BarChart({
  points,
  ariaLabel,
}: {
  points: Array<{ label: string; value: number }>
  ariaLabel: string
}) {
  const width = 360
  const height = 210
  const pad = { left: 28, right: 8, top: 18, bottom: 36 }
  const max = Math.max(1, ...points.map((point) => point.value))
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const slot = innerW / points.length
  const labelStep = points.length > 8 ? Math.ceil(points.length / 6) : 1

  return (
    <svg className="lab-bi-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
      {points.map((point, index) => {
        const barH = (point.value / max) * innerH
        const x = pad.left + index * slot + slot * 0.2
        const y = pad.top + innerH - barH
        return (
          <g key={`${point.label}-${index}`}>
            <rect x={x} y={y} width={Math.max(4, slot * 0.6)} height={barH} rx="2" fill={TMA_COLOR} />
            {point.value ? (
              <text x={x + slot * 0.3} y={y - 4} className="lab-bi-point" textAnchor="middle" fill={TMA_COLOR}>
                {formatCount(point.value)}
              </text>
            ) : null}
            {index % labelStep === 0 ? (
              <text
                x={x + slot * 0.3}
                y={height - 10}
                className="lab-bi-axis"
                textAnchor="middle"
              >
                {point.label}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

function StackedBarChart({
  points,
  series,
  ariaLabel,
}: {
  points: Array<{ label: string; values: number[] }>
  series: Array<{ name: string; color: string }>
  ariaLabel: string
}) {
  const width = 760
  const height = 220
  const pad = { left: 32, right: 12, top: 16, bottom: 36 }
  const totals = points.map((point) => point.values.reduce((sum, value) => sum + value, 0))
  const max = Math.max(1, ...totals)
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const slot = innerW / Math.max(points.length, 1)
  const gap = Math.min(8, slot * 0.28)
  const barWidth = Math.max(slot - gap, 4)
  const labelStep = points.length > 10 ? Math.ceil(points.length / 8) : 1
  const showValues = points.length <= 24

  return (
    <svg className="lab-bi-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
      {points.map((point, index) => {
        const x = pad.left + index * slot + gap / 2
        let stacked = 0
        return (
          <g key={`${point.label}-${index}`}>
            {point.values.map((value, seriesIndex) => {
              if (!value) return null
              const barH = (value / max) * innerH
              const y = pad.top + innerH - ((stacked + value) / max) * innerH
              stacked += value
              const name = series[seriesIndex]?.name ?? ''
              const color = series[seriesIndex]?.color ?? TMA_COLOR
              return (
                <g key={name || seriesIndex}>
                  <rect x={x} y={y} width={barWidth} height={barH} fill={color}>
                    <title>{`${name}: ${value}`}</title>
                  </rect>
                  {showValues && barH >= 14 ? (
                    <text
                      x={x + barWidth / 2}
                      y={y + barH / 2 + 3}
                      className="lab-bi-point lab-bi-in-stack"
                      textAnchor="middle"
                    >
                      {formatCount(value)}
                    </text>
                  ) : null}
                </g>
              )
            })}
            {index % labelStep === 0 ? (
              <text x={x + barWidth / 2} y={height - 10} className="lab-bi-axis" textAnchor="middle">
                {point.label}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

const TMA_META_DAYS = 9
const FORA_CURVA_COLOR = '#ff5d5d'

function TmaOutlierChart({
  points,
}: {
  points: Array<{ meter: string; date: string; days: number }>
}) {
  const width = 760
  const height = 200
  const pad = { left: 36, right: 16, top: 16, bottom: 32 }
  const yMax = niceMax(Math.max(TMA_META_DAYS, ...points.map((point) => point.days)))
  const times = points.map((point) => Date.parse(`${point.date}T12:00:00`))
  const min = Math.min(...times)
  const max = Math.max(...times)
  const span = Math.max(max - min, 86_400_000)
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const xAt = (time: number) => pad.left + ((time - min) / span) * innerW
  const yAt = (value: number) => pad.top + innerH - (value / yMax) * innerH
  const perDay = new Map<string, number>()
  for (const point of points) perDay.set(point.date, (perDay.get(point.date) ?? 0) + 1)
  const seen = new Map<string, number>()
  const ticks = [0, TMA_META_DAYS, yMax].filter((value, index, list) => list.indexOf(value) === index)
  const labelIndexes = [
    ...new Set(points.length <= 1 ? [0] : [0, Math.floor((points.length - 1) / 2), points.length - 1]),
  ]

  return (
    <svg className="lab-bi-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="TMA de cada ensaio e meta de 9 dias">
      {ticks.map((value) => {
        const y = yAt(value)
        const meta = value === TMA_META_DAYS
        return (
          <g key={value}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y}
              y2={y}
              className={meta ? 'lab-bi-meta' : 'lab-bi-grid'}
            />
            <text
              x={pad.left - 8}
              y={y + 4}
              className={meta ? 'lab-bi-axis lab-bi-meta-label' : 'lab-bi-axis'}
              textAnchor="end"
            >
              {formatCount(value)}
            </text>
          </g>
        )
      })}
      {points.map((point, index) => {
        const order = seen.get(point.date) ?? 0
        seen.set(point.date, order + 1)
        const total = perDay.get(point.date) ?? 1
        const jitter = total <= 1 ? 0 : ((order + 0.5) / total - 0.5) * Math.min(span * 0.06, 86_400_000 * 0.7)
        const outside = point.days > TMA_META_DAYS
        const color = outside ? FORA_CURVA_COLOR : TMA_COLOR
        const cx = xAt(times[index] + jitter)
        const cy = yAt(point.days)
        return (
          <circle key={`${point.meter}-${point.date}-${index}`} cx={cx} cy={cy} r={outside ? 4.2 : 3.4} fill={color}>
            <title>{`${point.meter} · ${dayLabel(point.date)} · ${point.days} ${point.days === 1 ? 'dia' : 'dias'}`}</title>
          </circle>
        )
      })}
      {labelIndexes.map((index) => {
        const point = points[index]
        if (!point) return null
        return (
          <text key={`${point.date}-${index}`} x={xAt(times[index])} y={height - 8} className="lab-bi-axis" textAnchor="middle">
            {dayLabel(point.date)}
          </text>
        )
      })}
    </svg>
  )
}

export function LabVisaoDashboard() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [data, setData] = useState<LabVisaoDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [months, setMonths] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api
      .getLabVisaoDashboard(year)
      .then((response) => {
        if (!cancelled) setData(response)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o dashboard.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [year])

  const selected = useMemo(() => new Set(months), [months])
  const monthly = (data?.monthly ?? []).filter((item) => selected.has(item.month))
  const totals = monthly.reduce(
    (acc, item) => ({
      agendado: acc.agendado + item.agendado,
      ensaiado: acc.ensaiado + item.ensaiado + (item.ensaiadoAntecipado ?? 0),
      tmaSum: acc.tmaSum + item.tmaSum,
      tmaCount: acc.tmaCount + item.tmaCount,
      atrasados: acc.atrasados + item.atrasados,
      aReceber: acc.aReceber + item.aReceber,
      recebidoComAtraso: acc.recebidoComAtraso + item.recebidoComAtraso,
      recebidoSemAtraso: acc.recebidoSemAtraso + item.recebidoSemAtraso,
    }),
    {
      agendado: 0,
      ensaiado: 0,
      tmaSum: 0,
      tmaCount: 0,
      atrasados: 0,
      aReceber: 0,
      recebidoComAtraso: 0,
      recebidoSemAtraso: 0,
    },
  )

  const tmaPoints: Point[] = monthly.map((item) => ({
    label: SHORT_MONTHS[item.month - 1],
    values: [average(item.tmaSum, item.tmaCount), average(item.prazoSum, item.prazoCount)],
  }))
  const volumePoints: Point[] = monthly.map((item) => ({
    label: SHORT_MONTHS[item.month - 1],
    values: [
      item.agendado,
      item.ensaiado,
      (item.ensaiadoAntecipado ?? 0) > 0 ? item.ensaiadoAntecipado : null,
    ],
  }))
  const hasEnsaioAntecipado = volumePoints.some((point) => (point.values[2] ?? 0) > 0)
  const inspectionPoints = (data?.inspecoes ?? [])
    .filter((item) => selected.has(monthOf(item.date)))
    .map((item) => ({ label: dayLabel(item.date), value: item.total }))
  const ensaioRows = (data?.ensaiosPorDia ?? []).filter((item) => selected.has(monthOf(item.date)))
  const ensaioSeries = [...new Map(ensaioRows.map((item) => [item.userId, item.name])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1], 'pt-BR'))
    .map(([userId, name], index) => ({
      userId,
      name,
      color: COLLAB_COLORS[index % COLLAB_COLORS.length],
    }))
  const ensaioDays = [...new Set(ensaioRows.map((item) => item.date))].sort()
  const ensaioTotals = new Map(ensaioRows.map((item) => [`${item.date}:${item.userId}`, item.total]))
  const ensaioPoints = ensaioDays.map((date) => ({
    label: dayLabel(date),
    values: ensaioSeries.map((series) => ensaioTotals.get(`${date}:${series.userId}`) ?? 0),
  }))
  const tmaAssays = (data?.tmaEnsaios ?? [])
    .filter((item) => selected.has(monthOf(item.date)))
    .sort((left, right) => left.date.localeCompare(right.date) || left.meter.localeCompare(right.meter))
  const tmaFora = tmaAssays.filter((item) => item.days > TMA_META_DAYS).length

  function toggleMonth(month: number) {
    setMonths((current) =>
      current.includes(month) ? current.filter((item) => item !== month) : [...current, month].sort((a, b) => a - b),
    )
  }

  function toggleAllMonths() {
    setMonths((current) => (current.length === 12 ? [] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))
  }

  return (
    <div className="lab-bi">
      <header className="lab-bi-header">
        <div className="lab-bi-title">
          <EdpLogo compact />
          <h3>Laboratório de Medição EDP SP</h3>
        </div>
        <label className="lab-bi-year">
          Filtrar ano
          <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {(data?.years.length ? data.years : [year]).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <div className="lab-bi-next">
          <span>Próximos 30 dias</span>
          <strong>{formatCount(data?.next30.scheduled ?? 0)}</strong>
          <small>agendados</small>
          <span className="lab-bi-next-split">|</span>
          <strong>
            {data?.next30.availabilityPercent == null ? '—' : `${data.next30.availabilityPercent}%`}
          </strong>
          <small>disponibilidade</small>
        </div>
      </header>

      {error ? <LoginFeedback type="error" message={error} /> : null}
      {loading && !data ? <p>Carregando dashboard...</p> : null}

      {data ? (
        <div className="lab-bi-layout">
          <div className="lab-bi-main">
            <div className="lab-bi-kpis">
              <article>
                <p>Total ensaiado</p>
                <strong>{formatCount(totals.ensaiado)}</strong>
              </article>
              <article>
                <p>Total agendado</p>
                <strong>{formatCount(totals.agendado)}</strong>
              </article>
              <article>
                <p>TMA</p>
                <strong>
                  {formatMetric(average(totals.tmaSum, totals.tmaCount))} <small>dias</small>
                </strong>
              </article>
              <article>
                <p>Prazo de atendimento</p>
                <strong>
                  {data.prazoAtendimento.days == null ? '—' : formatCount(data.prazoAtendimento.days)}{' '}
                  <small>dias</small>
                </strong>
                {data.prazoAtendimento.label ? <span>{data.prazoAtendimento.label}</span> : null}
              </article>
              <article className="lab-bi-recebimento">
                <p>Recebimento</p>
                <div>
                  <strong>{formatCount(totals.atrasados)}</strong>
                  <span>Atrasados</span>
                  <strong>{formatCount(totals.recebidoComAtraso)}</strong>
                  <span>Recebido com atraso</span>
                  <strong>{formatCount(totals.aReceber)}</strong>
                  <span>A receber</span>
                  <strong>{formatCount(totals.recebidoSemAtraso)}</strong>
                  <span>Recebido sem atraso</span>
                </div>
              </article>
            </div>

            <section className="lab-bi-card lab-bi-card-tma">
              <h4>TMA mensal</h4>
              <div className="lab-bi-legend">
                <span><i style={{ background: TMA_COLOR }} /> TMA</span>
                <span><i style={{ background: PRAZO_COLOR }} /> Prazo de agendamento</span>
              </div>
              {tmaPoints.some((point) => point.values.some((value) => value != null)) ? (
                <TrendChart
                  points={tmaPoints}
                  series={[
                    { name: 'TMA', color: TMA_COLOR },
                    { name: 'Prazo de agendamento', color: PRAZO_COLOR },
                  ]}
                  ariaLabel="TMA e prazo de agendamento por mês"
                  height={150}
                />
              ) : (
                <p className="lab-bi-empty">Sem medições de prazo neste período.</p>
              )}
            </section>

            <div className="lab-bi-bottom">
              <section className="lab-bi-card">
                <h4>Fila de espera</h4>
                {data.filaEspera.length ? (
                  <ol className="lab-bi-fila">
                    {data.filaEspera.map((item) => (
                      <li key={item.meter}>
                        <span>{item.meter}</span>
                        <strong>
                          {item.days.toLocaleString('pt-BR')} {item.days === 1 ? 'dia' : 'dias'}
                        </strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="lab-bi-empty">Nenhum medidor aguardando ensaio.</p>
                )}
              </section>
              <section className="lab-bi-card">
                <h4>Inspeções</h4>
                {inspectionPoints.length ? (
                  <BarChart points={inspectionPoints} ariaLabel="Documentos de inspeção por dia" />
                ) : (
                  <p className="lab-bi-empty">Nenhuma inspeção importada neste período.</p>
                )}
              </section>
              <section className="lab-bi-card">
                <h4>Agendado x ensaiado por mês</h4>
                <div className="lab-bi-legend">
                  <span><i style={{ background: AGENDADO_COLOR }} /> Agendado</span>
                  <span><i style={{ background: TMA_COLOR }} /> Ensaiado</span>
                  {hasEnsaioAntecipado ? (
                    <span><i style={{ background: ANTECIPADO_COLOR }} /> Ensaiado antes da data</span>
                  ) : null}
                </div>
                {volumePoints.some((point) => point.values.some((value) => (value ?? 0) > 0)) ? (
                  <TrendChart
                    points={volumePoints}
                    series={[
                      { name: 'Agendado', color: AGENDADO_COLOR },
                      { name: 'Ensaiado', color: TMA_COLOR },
                      { name: 'Ensaiado antes da data', color: ANTECIPADO_COLOR },
                    ]}
                    ariaLabel="Agendados e ensaiados por mês"
                  />
                ) : (
                  <p className="lab-bi-empty">Sem agendamentos neste período.</p>
                )}
              </section>
            </div>

            <section className="lab-bi-card lab-bi-card-outliers">
              <h4>Pontos fora da curva</h4>
              <div className="lab-bi-legend">
                <span><i style={{ background: TMA_COLOR }} /> Até 9 dias</span>
                <span><i style={{ background: FORA_CURVA_COLOR }} /> Acima da meta</span>
                <span>
                  {tmaAssays.length
                    ? `${formatCount(tmaFora)} de ${formatCount(tmaAssays.length)} ensaios acima de 9 dias`
                    : 'Meta de 9 dias a partir da data do ensaio'}
                </span>
              </div>
              {tmaAssays.length ? (
                <TmaOutlierChart points={tmaAssays} />
              ) : (
                <p className="lab-bi-empty">Nenhum ensaio com recebimento neste período.</p>
              )}
            </section>

            <section className="lab-bi-card lab-bi-card-ensaios">
              <h4>Ensaios por dia</h4>
              <p className="lab-bi-note">Ensaios de medidores, empilhados por colaborador.</p>
              {ensaioPoints.length ? (
                <>
                  <div className="lab-bi-legend">
                    {ensaioSeries.map((series) => (
                      <span key={series.userId || series.name}>
                        <i style={{ background: series.color }} /> {series.name}
                      </span>
                    ))}
                  </div>
                  <StackedBarChart
                    points={ensaioPoints}
                    series={ensaioSeries}
                    ariaLabel="Ensaios por dia e por colaborador"
                  />
                </>
              ) : (
                <p className="lab-bi-empty">Nenhum ensaio neste período.</p>
              )}
            </section>
          </div>

          <aside className="lab-bi-months">
            <p>Filtrar mês</p>
            <label>
              <input
                type="checkbox"
                checked={months.length === 12}
                onChange={toggleAllMonths}
              />
              Selecionar tudo
            </label>
            {MONTHS.map((name, index) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={selected.has(index + 1)}
                  onChange={() => toggleMonth(index + 1)}
                />
                {name}
              </label>
            ))}
          </aside>
        </div>
      ) : null}
    </div>
  )
}
