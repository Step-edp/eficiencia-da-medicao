import { useMemo, useState } from 'react'
import { LoginFeedback } from './LoginFeedback'
import { LabMeasurementTrail } from './LabMeasurementTrail'
import type { LabTrailStep } from './labTrailSteps'

const INVENTARIO_TRAIL_STEPS: LabTrailStep[] = [
  { key: 'IQ09', label: 'IQ09' },
  { key: 'Serializar', label: 'Serializar' },
  { key: 'Resultado', label: 'Resultado' },
]

type InventoryMonth = {
  key: string
  year: number
  monthIndex: number
  monthLabel: string
}

type InventarioTrailStepKey = (typeof INVENTARIO_TRAIL_STEPS)[number]['key']

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

function monthTitle(month: InventoryMonth) {
  return `${month.monthLabel} de ${month.year}`
}

function InventarioTrailIcon({ step }: { step: string }) {
  const symbol =
    step === 'IQ09' ? '1' : step === 'Serializar' ? '2' : step === 'Resultado' ? '3' : '•'

  return (
    <span className="item-icon" aria-hidden="true">
      {symbol}
    </span>
  )
}

type InventarioPanelProps = {
  openMonthTitle?: string | null
  onMonthOpenChange?: (monthTitle: string | null) => void
  readOnly?: boolean
}

export function InventarioPanel({
  openMonthTitle = null,
  onMonthOpenChange,
  readOnly = false,
}: InventarioPanelProps) {
  const months = useMemo(() => buildLastTwelveMonths(), [])
  const [activeTrailStep, setActiveTrailStep] = useState<InventarioTrailStepKey>('IQ09')
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

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

  const openMonth =
    months.find((month) => monthTitle(month) === openMonthTitle) ?? null

  const handleTrailSelect = (stepKey: string) => {
    if (readOnly) return
    setActiveTrailStep(stepKey as InventarioTrailStepKey)
    if (!openMonth) return

    if (stepKey === 'IQ09') {
      setFeedback({
        type: 'success',
        message: `Pedido IQ09 registrado para ${monthTitle(openMonth)}.`,
      })
      return
    }

    if (stepKey === 'Serializar') {
      setFeedback({
        type: 'success',
        message: `Serialização solicitada para ${monthTitle(openMonth)}.`,
      })
      return
    }

    setFeedback({
      type: 'success',
      message: `Consulta de resultado aberta para ${monthTitle(openMonth)}.`,
    })
  }

  if (openMonth) {
    return (
      <div className="inventario-panel inventario-month-screen">
        <LabMeasurementTrail
          activeStep={activeTrailStep}
          onSelect={handleTrailSelect}
          renderIcon={(step) => <InventarioTrailIcon step={step} />}
          steps={INVENTARIO_TRAIL_STEPS}
          ariaLabel="Trilha do inventário mensal"
        />

        {feedback ? (
          <LoginFeedback
            type={feedback.type}
            message={feedback.message}
            onClose={() => setFeedback(null)}
          />
        ) : null}

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
                    Nenhum registro de inventário cadastrado para{' '}
                    {openMonth.monthLabel.toLowerCase()} de {openMonth.year}.
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
                onClick={() => onMonthOpenChange?.(monthTitle(month))}
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
