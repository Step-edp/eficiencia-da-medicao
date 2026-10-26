import { useMemo, useState } from 'react'
import type { RatmLaudo } from './ratm/laudos'

type MinhaProdutividadePanelProps = {
  userId: string
  userName: string
  laudos: RatmLaudo[]
}

const ENSAIO_COLOR = '#3ec6e0'
const APROVACAO_COLOR = '#f08a3c'

function monthKey(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function dayKey(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dayLabel(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const short = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${day} de ${short}`
}

function monthLabel(key: string): string {
  if (!key) return 'Todos'
  const [year, month] = key.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function ProdutividadeChart({
  points,
}: {
  points: Array<{ label: string; ensaios: number; aprovacoes: number }>
}) {
  const width = 760
  const height = 200
  const pad = { left: 32, right: 12, top: 16, bottom: 36 }
  const max = Math.max(1, ...points.flatMap((point) => [point.ensaios, point.aprovacoes]))
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const slot = innerW / Math.max(points.length, 1)
  const gap = Math.min(8, slot * 0.18)
  const groupWidth = Math.max(slot - gap, 8)
  const barWidth = groupWidth / 2
  const labelStep = points.length > 12 ? Math.ceil(points.length / 8) : 1
  const showValues = points.length <= 24
  const series = [
    { key: 'ensaios' as const, color: ENSAIO_COLOR },
    { key: 'aprovacoes' as const, color: APROVACAO_COLOR },
  ]

  return (
    <svg className="lab-bi-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Atividades por dia">
      {points.map((point, index) => {
        const groupX = pad.left + index * slot + gap / 2
        return (
          <g key={`${point.label}-${index}`}>
            {series.map((item, seriesIndex) => {
              const value = point[item.key]
              if (!value) return null
              const barH = (value / max) * innerH
              const x = groupX + seriesIndex * barWidth
              const y = pad.top + innerH - barH
              return (
                <g key={item.key}>
                  <rect
                    x={x + 1}
                    y={y}
                    width={Math.max(barWidth - 2, 2)}
                    height={barH}
                    rx="1.5"
                    fill={item.color}
                  >
                    <title>{`${item.key === 'ensaios' ? 'Ensaios' : 'Aprovações'}: ${value}`}</title>
                  </rect>
                  <text
                    x={x + barWidth / 2}
                    y={Math.max(12, y - 3)}
                    className="lab-bi-point"
                    textAnchor="middle"
                    fill={item.color}
                  >
                    {showValues ? value : ''}
                  </text>
                </g>
              )
            })}
            {index % labelStep === 0 ? (
              <text x={groupX + groupWidth / 2} y={height - 10} className="lab-bi-axis" textAnchor="middle">
                {point.label}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

export function MinhaProdutividadePanel({
  userId,
  userName,
  laudos,
}: MinhaProdutividadePanelProps) {
  const myLaudos = useMemo(
    () =>
      laudos
        .filter((laudo) => !laudo.revokedAt && laudo.createdByUserId === userId)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [laudos, userId],
  )

  const monthOptions = useMemo(() => {
    const keys = new Set<string>()
    for (const laudo of laudos) {
      if (laudo.revokedAt) continue
      if (laudo.createdByUserId === userId) {
        const key = monthKey(laudo.createdAt)
        if (key) keys.add(key)
      }
      if (laudo.approvedByUserId === userId && laudo.approvedAt) {
        const key = monthKey(laudo.approvedAt)
        if (key) keys.add(key)
      }
    }
    return [...keys].sort((a, b) => b.localeCompare(a))
  }, [laudos, userId])

  const [selectedMonth, setSelectedMonth] = useState('Todos')

  const filtered = useMemo(() => {
    if (selectedMonth === 'Todos') return myLaudos
    return myLaudos.filter((laudo) => monthKey(laudo.createdAt) === selectedMonth)
  }, [myLaudos, selectedMonth])

  const dailyPoints = useMemo(() => {
    const inPeriod = (iso: string | null | undefined) => {
      if (!iso) return false
      if (selectedMonth === 'Todos') return true
      return monthKey(iso) === selectedMonth
    }
    const days = new Map<string, { ensaios: number; aprovacoes: number }>()
    const bump = (iso: string, field: 'ensaios' | 'aprovacoes') => {
      const key = dayKey(iso)
      if (!key) return
      const current = days.get(key) ?? { ensaios: 0, aprovacoes: 0 }
      current[field] += 1
      days.set(key, current)
    }
    for (const laudo of laudos) {
      if (laudo.revokedAt) continue
      if (laudo.createdByUserId === userId && inPeriod(laudo.createdAt)) {
        bump(laudo.createdAt, 'ensaios')
      }
      if (laudo.approvedByUserId === userId && laudo.approvedAt && inPeriod(laudo.approvedAt)) {
        bump(laudo.approvedAt, 'aprovacoes')
      }
    }
    return [...days.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({
        label: dayLabel(key),
        ensaios: value.ensaios,
        aprovacoes: value.aprovacoes,
      }))
  }, [laudos, selectedMonth, userId])

  const stats = useMemo(() => {
    const total = filtered.length
    const pendentes = filtered.filter((item) => item.status === 'Pendente').length
    const aprovados = filtered.filter((item) => item.status === 'Aprovado').length
    const reprovados = filtered.filter((item) => item.status === 'Reprovado').length
    return { total, pendentes, aprovados, reprovados }
  }, [filtered])

  return (
    <div className="produtividade-panel">
      <p className="produtividade-intro">
        Acompanhe os ensaios/RATMs registrados por <strong>{userName}</strong> no
        Laboratório de Medição.
      </p>

      <div className="produtividade-filters">
        <label>
          Período
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
          >
            <option value="Todos">Todos</option>
            {monthOptions.map((key) => (
              <option key={key} value={key}>
                {monthLabel(key)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="produtividade-stats" aria-label="Indicadores de produtividade">
        <article className="produtividade-stat">
          <span className="produtividade-stat-label">RATMs</span>
          <strong className="produtividade-stat-value">{stats.total}</strong>
        </article>
        <article className="produtividade-stat">
          <span className="produtividade-stat-label">Pendentes</span>
          <strong className="produtividade-stat-value">{stats.pendentes}</strong>
        </article>
        <article className="produtividade-stat">
          <span className="produtividade-stat-label">Aprovados</span>
          <strong className="produtividade-stat-value">{stats.aprovados}</strong>
        </article>
        <article className="produtividade-stat">
          <span className="produtividade-stat-label">Reprovados</span>
          <strong className="produtividade-stat-value">{stats.reprovados}</strong>
        </article>
      </div>

      <section className="lab-bi-card produtividade-chart">
        <h4>Atividades por dia</h4>
        <div className="lab-bi-legend">
          <span><i style={{ background: ENSAIO_COLOR }} /> Ensaios</span>
          <span><i style={{ background: APROVACAO_COLOR }} /> Aprovações</span>
        </div>
        {dailyPoints.length ? (
          <ProdutividadeChart points={dailyPoints} />
        ) : (
          <p className="lab-bi-empty">Nenhuma atividade no período selecionado.</p>
        )}
      </section>

      <div className="entrada-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>RATM</th>
              <th>Medidor</th>
              <th>Cliente</th>
              <th>Status</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.slice(0, 100).map((laudo) => (
                <tr key={laudo.id}>
                  <td>{laudo.ratmNumber}</td>
                  <td>{laudo.meter}</td>
                  <td>{laudo.client || '—'}</td>
                  <td>{laudo.status}</td>
                  <td>{new Date(laudo.createdAt).toLocaleString('pt-BR')}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>Nenhum RATM encontrado para o período selecionado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
