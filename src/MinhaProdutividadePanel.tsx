import { useEffect, useMemo, useState } from 'react'
import { api, type EnsaioSessaoRecord } from './api'
import { mapRatmLaudoFromApi, type RatmLaudo } from './ratm/laudos'

type MinhaProdutividadePanelProps = {
  userId: string
  userName: string
  laudos: RatmLaudo[]
}

const MEDIDOR_COLOR = '#3ec6e0'
const ANALISADOR_COLOR = '#7dff3a'
const APROVACAO_COLOR = '#f08a3c'

const ACTIVITY_SERIES = [
  { key: 'medidores' as const, label: 'Medidores', color: MEDIDOR_COLOR },
  { key: 'analisadores' as const, label: 'Analisadores', color: ANALISADOR_COLOR },
  { key: 'aprovacoes' as const, label: 'Aprovações', color: APROVACAO_COLOR },
]

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

function samePerson(userId: string, userName: string, id?: string | null, name?: string | null) {
  if (id && id === userId) return true
  const expected = userName.trim().toLocaleLowerCase('pt-BR')
  const actual = (name ?? '').trim().toLocaleLowerCase('pt-BR')
  return Boolean(expected && actual && expected === actual)
}

function ProdutividadeChart({
  points,
}: {
  points: Array<{ label: string; medidores: number; analisadores: number; aprovacoes: number }>
}) {
  const width = 760
  const height = 200
  const pad = { left: 32, right: 12, top: 16, bottom: 36 }
  const max = Math.max(
    1,
    ...points.flatMap((point) => [point.medidores, point.analisadores, point.aprovacoes]),
  )
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const slot = innerW / Math.max(points.length, 1)
  const gap = Math.min(8, slot * 0.18)
  const groupWidth = Math.max(slot - gap, 8)
  const barWidth = groupWidth / ACTIVITY_SERIES.length
  const labelStep = points.length > 12 ? Math.ceil(points.length / 8) : 1
  const showValues = points.length <= 16

  return (
    <svg className="lab-bi-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Atividades por dia">
      {points.map((point, index) => {
        const groupX = pad.left + index * slot + gap / 2
        return (
          <g key={`${point.label}-${index}`}>
            {ACTIVITY_SERIES.map((item, seriesIndex) => {
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
                    <title>{`${item.label}: ${value}`}</title>
                  </rect>
                  {showValues ? (
                    <text
                      x={x + barWidth / 2}
                      y={Math.max(12, y - 3)}
                      className="lab-bi-point"
                      textAnchor="middle"
                      fill={item.color}
                    >
                      {value}
                    </text>
                  ) : null}
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
  const [ensaios, setEnsaios] = useState<EnsaioSessaoRecord[]>([])
  const [loadedLaudos, setLoadedLaudos] = useState<RatmLaudo[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.allSettled([api.listEnsaiosRealizados(), api.listRatmLaudos()]).then(
      ([ensaiosResult, laudosResult]) => {
        if (cancelled) return
        setEnsaios(ensaiosResult.status === 'fulfilled' ? ensaiosResult.value.ensaios : [])
        setLoadedLaudos(
          laudosResult.status === 'fulfilled'
            ? laudosResult.value.laudos.map(mapRatmLaudoFromApi)
            : [],
        )
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId])

  const sourceLaudos = loadedLaudos ?? laudos
  const mine = (id?: string | null, name?: string | null) => samePerson(userId, userName, id, name)

  const myLaudos = useMemo(
    () =>
      sourceLaudos
        .filter((laudo) => !laudo.revokedAt && mine(laudo.createdByUserId, laudo.createdByName))
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [sourceLaudos, userId, userName],
  )

  const myEnsaios = useMemo(
    () => ensaios.filter((ensaio) => mine(ensaio.createdByUserId, ensaio.createdByName)),
    [ensaios, userId, userName],
  )

  const monthOptions = useMemo(() => {
    const keys = new Set<string>()
    for (const laudo of sourceLaudos) {
      if (laudo.revokedAt) continue
      if (mine(laudo.createdByUserId, laudo.createdByName)) {
        const key = monthKey(laudo.createdAt)
        if (key) keys.add(key)
      }
      if (mine(laudo.approvedByUserId, null) && laudo.approvedAt) {
        const key = monthKey(laudo.approvedAt)
        if (key) keys.add(key)
      }
    }
    for (const ensaio of myEnsaios) {
      const key = monthKey(ensaio.createdAt)
      if (key) keys.add(key)
    }
    return [...keys].sort((a, b) => b.localeCompare(a))
  }, [sourceLaudos, myEnsaios, userId, userName])

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
    const days = new Map<string, { medidores: number; analisadores: number; aprovacoes: number }>()
    const bump = (iso: string, field: 'medidores' | 'analisadores' | 'aprovacoes') => {
      const key = dayKey(iso)
      if (!key) return
      const current = days.get(key) ?? { medidores: 0, analisadores: 0, aprovacoes: 0 }
      current[field] += 1
      days.set(key, current)
    }
    for (const laudo of sourceLaudos) {
      if (laudo.revokedAt) continue
      if (mine(laudo.createdByUserId, laudo.createdByName) && inPeriod(laudo.createdAt)) {
        bump(laudo.createdAt, 'medidores')
      }
      if (mine(laudo.approvedByUserId, null) && laudo.approvedAt && inPeriod(laudo.approvedAt)) {
        bump(laudo.approvedAt, 'aprovacoes')
      }
    }
    for (const ensaio of myEnsaios) {
      if (inPeriod(ensaio.createdAt)) bump(ensaio.createdAt, 'analisadores')
    }
    return [...days.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({
        label: dayLabel(key),
        medidores: value.medidores,
        analisadores: value.analisadores,
        aprovacoes: value.aprovacoes,
      }))
  }, [sourceLaudos, myEnsaios, selectedMonth, userId, userName])

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
          <strong className="produtividade-stat-value">{loading ? '…' : stats.total}</strong>
        </article>
        <article className="produtividade-stat">
          <span className="produtividade-stat-label">Pendentes</span>
          <strong className="produtividade-stat-value">{loading ? '…' : stats.pendentes}</strong>
        </article>
        <article className="produtividade-stat">
          <span className="produtividade-stat-label">Aprovados</span>
          <strong className="produtividade-stat-value">{loading ? '…' : stats.aprovados}</strong>
        </article>
        <article className="produtividade-stat">
          <span className="produtividade-stat-label">Reprovados</span>
          <strong className="produtividade-stat-value">{loading ? '…' : stats.reprovados}</strong>
        </article>
      </div>

      <section className="lab-bi-card produtividade-chart">
        <h4>Atividades por dia</h4>
        <div className="lab-bi-legend">
          {ACTIVITY_SERIES.map((item) => (
            <span key={item.key}>
              <i style={{ background: item.color }} /> {item.label}
            </span>
          ))}
        </div>
        {loading ? (
          <p className="lab-bi-empty">Carregando...</p>
        ) : dailyPoints.length ? (
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
            {loading ? (
              <tr>
                <td colSpan={5}>Carregando...</td>
              </tr>
            ) : filtered.length ? (
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
