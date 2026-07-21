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

export function InventarioPanel() {
  const months = useMemo(() => buildLastTwelveMonths(), [])
  const [selectedMonthKey, setSelectedMonthKey] = useState(months[0]?.key ?? '')

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

  return (
    <div className="inventario-panel">
      {monthsByYear.map((group) => (
        <section key={group.year} className="inventario-year-block" aria-label={`Ano ${group.year}`}>
          <header className="inventario-year-header">
            <h3>{group.year}</h3>
            <span>
              {group.months.length} {group.months.length === 1 ? 'mês' : 'meses'}
            </span>
          </header>
          <div className="inventario-months" role="list">
            {group.months.map((month) => {
              const isSelected = selectedMonthKey === month.key
              return (
                <button
                  key={month.key}
                  type="button"
                  role="listitem"
                  className={`inventario-month-btn${isSelected ? ' is-selected' : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedMonthKey(month.key)}
                >
                  <span className="inventario-month-name">{month.monthLabel}</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
