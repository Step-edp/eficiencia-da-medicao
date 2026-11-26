import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './api'
import { LoginFeedback } from './LoginFeedback'

type SplitRow = { label: string; pending: number; adjusted: number }
type TotalRow = { label: string; total: number }

type Analysis = {
  pending: number
  adjusted: number
  exclusions: number
  byType: SplitRow[]
  byPerson: SplitRow[]
  byExclusionJustification: TotalRow[]
}

const PENDING_COLOR = '#18d8f0'
const ADJUSTED_COLOR = '#5bf000'
const EXCLUSION_COLOR = '#7ecbff'

function truncateLabel(value: string, max: number) {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
}

function SplitBarChart({
  title,
  rows,
  emptyLabel,
}: {
  title: string
  rows: SplitRow[]
  emptyLabel: string
}) {
  if (rows.length === 0) {
    return (
      <article className="lab-bi-card">
        <h4>{title}</h4>
        <p className="lab-bi-note">{emptyLabel}</p>
      </article>
    )
  }

  const width = 640
  const pad = { left: 210, right: 36, top: 8, bottom: 8 }
  const rowHeight = 26
  const height = pad.top + pad.bottom + rows.length * rowHeight
  const barHeight = 12
  const max = Math.max(1, ...rows.map((row) => row.pending + row.adjusted))
  const innerWidth = width - pad.left - pad.right

  return (
    <article className="lab-bi-card">
      <h4>{title}</h4>
      <svg
        className="lab-bi-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
      >
        {rows.map((row, index) => {
          const y = pad.top + index * rowHeight
          const total = row.pending + row.adjusted
          const pendingWidth = (row.pending / max) * innerWidth
          const adjustedWidth = (row.adjusted / max) * innerWidth
          const textY = y + rowHeight * 0.72
          return (
            <g key={row.label}>
              <title>
                {row.label}: {row.pending} pendente(s), {row.adjusted} ajustado(s)
              </title>
              <text className="lab-bi-axis" x={pad.left - 8} y={textY} textAnchor="end">
                {truncateLabel(row.label, 28)}
              </text>
              <rect
                x={pad.left}
                y={y + (rowHeight - barHeight) / 2}
                width={Math.max(pendingWidth, row.pending > 0 ? 2 : 0)}
                height={barHeight}
                rx={4}
                fill={PENDING_COLOR}
              />
              <rect
                x={pad.left + pendingWidth}
                y={y + (rowHeight - barHeight) / 2}
                width={Math.max(adjustedWidth, row.adjusted > 0 ? 2 : 0)}
                height={barHeight}
                rx={4}
                fill={ADJUSTED_COLOR}
              />
              <text className="lab-bi-point" x={pad.left + pendingWidth + adjustedWidth + 6} y={textY}>
                {total}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="lab-bi-legend">
        <span>
          <i style={{ background: PENDING_COLOR }} /> Pendente
        </span>
        <span>
          <i style={{ background: ADJUSTED_COLOR }} /> Ajustado
        </span>
      </div>
    </article>
  )
}

function TotalBarChart({
  title,
  rows,
  emptyLabel,
}: {
  title: string
  rows: TotalRow[]
  emptyLabel: string
}) {
  if (rows.length === 0) {
    return (
      <article className="lab-bi-card">
        <h4>{title}</h4>
        <p className="lab-bi-note">{emptyLabel}</p>
      </article>
    )
  }

  const width = 640
  const pad = { left: 210, right: 36, top: 8, bottom: 8 }
  const rowHeight = 26
  const height = pad.top + pad.bottom + rows.length * rowHeight
  const barHeight = 12
  const max = Math.max(1, ...rows.map((row) => row.total))
  const innerWidth = width - pad.left - pad.right

  return (
    <article className="lab-bi-card deviation-analysis-wide">
      <h4>{title}</h4>
      <svg
        className="lab-bi-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
      >
        {rows.map((row, index) => {
          const y = pad.top + index * rowHeight
          const barWidth = Math.max((row.total / max) * innerWidth, 6)
          const textY = y + rowHeight * 0.72
          return (
            <g key={row.label}>
              <title>
                {row.label}: {row.total}
              </title>
              <text className="lab-bi-axis" x={pad.left - 8} y={textY} textAnchor="end">
                {truncateLabel(row.label, 28)}
              </text>
              <rect
                x={pad.left}
                y={y + (rowHeight - barHeight) / 2}
                width={barWidth}
                height={barHeight}
                rx={4}
                fill={EXCLUSION_COLOR}
              />
              <text className="lab-bi-point" x={pad.left + barWidth + 6} y={textY}>
                {row.total}
              </text>
            </g>
          )
        })}
      </svg>
    </article>
  )
}

export function DeviationAnalysisPanel() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setAnalysis(await api.getDeviationAnalysis())
    } catch (err) {
      setAnalysis(null)
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar a análise de desvios.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="deviation-analysis" aria-label="Análise de desvios">
      <p className="entrada-panel-intro">
        Pendentes ainda aguardam correção. Ajustados já foram marcados como corrigidos.
        Cada colaborador da dupla entra na contagem do apontamento.
      </p>
      {error ? <LoginFeedback type="error" message={error} /> : null}
      {loading && !analysis ? (
        <p className="entrada-panel-empty">Carregando análise...</p>
      ) : analysis ? (
        <>
          <div className="lab-bi-kpis deviation-analysis-kpis">
            <article>
              <p>Pendentes</p>
              <strong>{analysis.pending}</strong>
            </article>
            <article>
              <p>Ajustados</p>
              <strong>{analysis.adjusted}</strong>
            </article>
            <article>
              <p>Total de apontamentos</p>
              <strong>{analysis.pending + analysis.adjusted}</strong>
            </article>
            <article>
              <p>Exclusões</p>
              <strong>{analysis.exclusions}</strong>
            </article>
          </div>
          <div className="deviation-analysis-charts">
            <SplitBarChart
              title="Por tipo"
              rows={analysis.byType}
              emptyLabel="Nenhum apontamento de desvio."
            />
            <SplitBarChart
              title="Por colaborador"
              rows={analysis.byPerson}
              emptyLabel="Nenhum colaborador vinculado."
            />
            <TotalBarChart
              title="Exclusões por justificativa"
              rows={analysis.byExclusionJustification}
              emptyLabel="Nenhuma exclusão registrada."
            />
          </div>
        </>
      ) : null}
    </section>
  )
}
