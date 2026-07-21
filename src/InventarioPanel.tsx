import { useMemo, useState } from 'react'

type InventoryMonth = {
  key: string
  year: number
  monthIndex: number
  monthLabel: string
}

function buildLastTwelveMonths(reference = new Date()): InventoryMonth[] {
  const months: InventoryMonth[] = []

  for (let offset = 0; offset < 12; offset += 1) {
    const date = new Date(reference.getFullYear(), reference.getMonth() - offset, 1)
    const year = date.getFullYear()
    const monthIndex = date.getMonth()
    const rawMonth = date.toLocaleDateString('pt-BR', { month: 'long' })
    const monthLabel = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1)

    months.push({
      key: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
      year,
      monthIndex,
      monthLabel,
    })
  }

  return months
}

type InventarioPanelProps = {
  onMonthOpenChange?: (monthTitle: string | null) => void
}

export function InventarioPanel({ onMonthOpenChange }: InventarioPanelProps) {
  const months = useMemo(() => buildLastTwelveMonths(), [])
  const [openMonthKey, setOpenMonthKey] = useState<string | null>(null)

  const monthsByYear = useMemo(() => {
    const groups: Array<{ year: number; months: InventoryMonth[] }> = []
    for (const month of months) {
      const existing = groups.find((group) => group.year === month.year)
      if (existing) {
        existing.months.push(month)
      } else {
        groups.push({ year: month.year, months: [month] })
      }
    }
    return groups
  }, [months])

  const openMonth = months.find((month) => month.key === openMonthKey) ?? null

  const openMonthScreen = (month: InventoryMonth) => {
    setOpenMonthKey(month.key)
    onMonthOpenChange?.(`${month.monthLabel} de ${month.year}`)
  }

  const closeMonthScreen = () => {
    setOpenMonthKey(null)
    onMonthOpenChange?.(null)
  }

  if (openMonth) {
    return (
      <div className="inventario-panel inventario-month-screen">
        <div className="area-actions">
          <button type="button" className="secondary-button compact-button" onClick={closeMonthScreen}>
            Voltar aos meses
          </button>
        </div>

        <header className="inventario-month-screen-header">
          <p className="section-tag">Inventário mensal</p>
          <h3>
            {openMonth.monthLabel} de {openMonth.year}
          </h3>
          <p>Consulta e acompanhamento do inventário deste mês.</p>
        </header>

        <div className="inventario-month-content">
          <div className="entrada-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Descrição</th>
                  <th>Quantidade</th>
                  <th>Status</th>
                  <th>Atualizado em</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5}>
                    Nenhum registro de inventário cadastrado para {openMonth.monthLabel.toLowerCase()}{' '}
                    de {openMonth.year}.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="inventario-panel">
      <p className="inventario-panel-hint">Selecione um mês para abrir o inventário.</p>
      {monthsByYear.map((group) => (
        <section key={group.year} className="inventario-year-block" aria-label={`Ano ${group.year}`}>
          <header className="inventario-year-header">
            <h3>{group.year}</h3>
            <span>
              {group.months.length} {group.months.length === 1 ? 'mês' : 'meses'}
            </span>
          </header>
          <div className="inventario-months" role="list">
            {group.months.map((month) => (
              <button
                key={month.key}
                type="button"
                role="listitem"
                className="inventario-month-btn"
                onClick={() => openMonthScreen(month)}
              >
                <span className="inventario-month-name">{month.monthLabel}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
