import { useMemo, useState } from 'react'
import type { RatmLaudo } from './ratm/laudos'

type MinhaProdutividadePanelProps = {
  userId: string
  userName: string
  laudos: RatmLaudo[]
}

function monthKey(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function monthLabel(key: string): string {
  if (!key) return 'Todos'
  const [year, month] = key.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function MinhaProdutividadePanel({
  userId,
  userName,
  laudos,
}: MinhaProdutividadePanelProps) {
  const myLaudos = useMemo(
    () =>
      laudos
        .filter((laudo) => laudo.createdByUserId === userId)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [laudos, userId],
  )

  const monthOptions = useMemo(() => {
    const keys = Array.from(
      new Set(myLaudos.map((laudo) => monthKey(laudo.createdAt)).filter(Boolean)),
    ).sort((a, b) => b.localeCompare(a))
    return keys
  }, [myLaudos])

  const [selectedMonth, setSelectedMonth] = useState('Todos')

  const filtered = useMemo(() => {
    if (selectedMonth === 'Todos') return myLaudos
    return myLaudos.filter((laudo) => monthKey(laudo.createdAt) === selectedMonth)
  }, [myLaudos, selectedMonth])

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
