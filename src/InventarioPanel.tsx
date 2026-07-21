import { useMemo, useState } from 'react'

type InventoryMonth = {
  key: string
  year: number
  monthIndex: number
  label: string
}

function buildLastTwelveMonths(reference = new Date()): InventoryMonth[] {
  const months: InventoryMonth[] = []

  for (let offset = 0; offset < 12; offset += 1) {
    const date = new Date(reference.getFullYear(), reference.getMonth() - offset, 1)
    const year = date.getFullYear()
    const monthIndex = date.getMonth()
    const rawLabel = date.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    })
    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1)

    months.push({
      key: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
      year,
      monthIndex,
      label,
    })
  }

  return months
}

export function InventarioPanel() {
  const months = useMemo(() => buildLastTwelveMonths(), [])
  const [selectedMonthKey, setSelectedMonthKey] = useState(months[0]?.key ?? '')

  return (
    <div className="inventario-panel">
      <div className="measurement-sections inventario-months" aria-label="Meses do inventário">
        {months.map((month) => (
          <button
            key={month.key}
            type="button"
            className={`measurement-item${
              selectedMonthKey === month.key ? ' measurement-item-highlighted' : ''
            }`}
            aria-pressed={selectedMonthKey === month.key}
            onClick={() => setSelectedMonthKey(month.key)}
          >
            <span className="item-with-icon">
              <span>{month.label}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
