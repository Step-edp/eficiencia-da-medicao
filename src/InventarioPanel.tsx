import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from './api'
import { LoginFeedback } from './LoginFeedback'
import { LabMeasurementTrail } from './LabMeasurementTrail'
import type { LabTrailStep } from './labTrailSteps'

const INVENTARIO_TRAIL_STEPS: LabTrailStep[] = [
  { key: 'IQ09', label: 'IQ09' },
  { key: 'Serializar', label: 'Serializar' },
  { key: 'Resultado', label: 'Resultado' },
]

const IQ09_COLUMNS = [
  'Nº de série',
  'Material',
  'Texto breve material',
  'Status do sistema',
  'Status usuário',
  'Centro',
  'Depósito',
  'CenTrabalho princ.',
  'Tipo estoque (reg.principal)',
  'Modificado em',
  'Modificado por',
  'Número de série do fabricante',
  'Fabricante do imobilizado',
  'Ano de construção',
  'Local de instalação',
] as const

type InventoryMonth = {
  key: string
  year: number
  monthIndex: number
  monthLabel: string
}

type InventarioTrailStepKey = (typeof INVENTARIO_TRAIL_STEPS)[number]['key']
type Iq09Row = Record<string, string>

function buildYearMonths(year: number): InventoryMonth[] {
  const months: InventoryMonth[] = []

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const date = new Date(year, monthIndex, 1)
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

/** Ano atual e anterior, cada um com Janeiro → Dezembro. */
function buildInventoryYears(reference = new Date(), yearCount = 2) {
  const currentYear = reference.getFullYear()
  const groups: Array<{ year: number; months: InventoryMonth[] }> = []

  for (let offset = 0; offset < yearCount; offset += 1) {
    const year = currentYear - offset
    groups.push({ year, months: buildYearMonths(year) })
  }

  return groups
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

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5.5v13l11-6.5L8 5.5z" fill="currentColor" />
    </svg>
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
  const monthsByYear = useMemo(() => buildInventoryYears(), [])
  const months = useMemo(
    () => monthsByYear.flatMap((group) => group.months),
    [monthsByYear],
  )
  const [activeTrailStep, setActiveTrailStep] = useState<InventarioTrailStepKey>('IQ09')
  const [completedStepKeys, setCompletedStepKeys] = useState<InventarioTrailStepKey[]>([])
  const [runningIq09, setRunningIq09] = useState(false)
  const [loadingExport, setLoadingExport] = useState(false)
  const [iq09Columns, setIq09Columns] = useState<string[]>([...IQ09_COLUMNS])
  const [iq09Rows, setIq09Rows] = useState<Iq09Row[]>([])
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const openMonth =
    months.find((month) => monthTitle(month) === openMonthTitle) ?? null

  // Ao trocar de mês, reinicia a trilha e carrega export salvo.
  useEffect(() => {
    setActiveTrailStep('IQ09')
    setCompletedStepKeys([])
    setFeedback(null)
    setRunningIq09(false)
    setIq09Columns([...IQ09_COLUMNS])
    setIq09Rows([])

    if (!openMonthTitle) return
    const month = months.find((item) => monthTitle(item) === openMonthTitle)
    if (!month) return

    let cancelled = false
    setLoadingExport(true)

    void api
      .getIq09Export(month.key)
      .then((result) => {
        if (cancelled) return
        const rows = result.rows ?? []
        const columns =
          result.columns?.length > 0 ? result.columns : [...IQ09_COLUMNS]
        setIq09Columns(columns)
        setIq09Rows(rows)
        if (rows.length > 0) {
          setCompletedStepKeys(['IQ09'])
        }
      })
      .catch(() => {
        if (cancelled) return
        setIq09Rows([])
      })
      .finally(() => {
        if (!cancelled) setLoadingExport(false)
      })

    return () => {
      cancelled = true
    }
  }, [openMonthTitle, months])

  // Próxima etapa liberada = quantidade de etapas já concluídas (em ordem).
  const unlockedIndex = completedStepKeys.length
  const iq09Completed = completedStepKeys.includes('IQ09')

  const isStepEnabled = (_stepKey: string, index: number) => {
    if (readOnly) return false
    return index <= unlockedIndex
  }

  const completeStep = (stepKey: InventarioTrailStepKey) => {
    setCompletedStepKeys((current) =>
      current.includes(stepKey) ? current : [...current, stepKey],
    )
  }

  const handleTrailSelect = (stepKey: string) => {
    if (readOnly || !openMonth) return

    const stepIndex = INVENTARIO_TRAIL_STEPS.findIndex((step) => step.key === stepKey)
    if (stepIndex < 0 || stepIndex > unlockedIndex) {
      setFeedback({
        type: 'error',
        message: 'Conclua a etapa anterior antes de avançar.',
      })
      return
    }

    setActiveTrailStep(stepKey as InventarioTrailStepKey)

    // IQ09 só conclui ao rodar o script (botão play).
    if (stepKey === 'IQ09') {
      setFeedback(null)
      return
    }

    const isAdvancing = stepIndex === unlockedIndex
    if (isAdvancing) {
      completeStep(stepKey as InventarioTrailStepKey)
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

  const handleRunIq09 = async () => {
    if (readOnly || !openMonth || runningIq09) return

    setRunningIq09(true)
    setFeedback(null)

    try {
      const result = await api.runIq09Script({ monthKey: openMonth.key })
      const columns = result.columns?.length > 0 ? result.columns : [...IQ09_COLUMNS]
      const rows = result.rows ?? []
      setIq09Columns(columns)
      setIq09Rows(rows)
      completeStep('IQ09')
      setFeedback({
        type: 'success',
        message:
          result.message ||
          `IQ09 carregou ${rows.length} registro(s) para ${monthTitle(openMonth)}.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível executar o script IQ09.',
      })
    } finally {
      setRunningIq09(false)
    }
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
          completedStepKeys={completedStepKeys}
          isStepEnabled={isStepEnabled}
        />

        {feedback ? (
          <LoginFeedback
            type={feedback.type}
            message={feedback.message}
            onClose={() => setFeedback(null)}
          />
        ) : null}

        <div className="inventario-month-content">
          {activeTrailStep === 'IQ09' ? (
            <div className="inventario-iq09-panel">
              <div className="inventario-iq09-run">
                <p className="inventario-iq09-run-hint">
                  {iq09Completed
                    ? `IQ09 com ${iq09Rows.length} registro(s) para ${monthTitle(openMonth)}. Você pode avançar para Serializar.`
                    : `Execute o script IQ09 para ${monthTitle(openMonth)} e carregar a planilha na tela.`}
                </p>
                <button
                  type="button"
                  className="inventario-iq09-play"
                  onClick={() => void handleRunIq09()}
                  disabled={readOnly || runningIq09}
                  aria-label={
                    runningIq09 ? 'Executando script IQ09' : 'Executar script IQ09'
                  }
                  title="Executar script IQ09"
                >
                  <span className="inventario-iq09-play-icon" aria-hidden="true">
                    {runningIq09 ? (
                      <span className="inventario-iq09-spinner" />
                    ) : (
                      <PlayIcon />
                    )}
                  </span>
                  <span className="inventario-iq09-play-label">
                    {runningIq09
                      ? 'Executando…'
                      : iq09Completed
                        ? 'Executar novamente'
                        : 'Executar IQ09'}
                  </span>
                </button>
              </div>

              <div className="entrada-table-wrap inventario-iq09-table-wrap">
                <table className="data-table inventario-iq09-table">
                  <thead>
                    <tr>
                      {iq09Columns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingExport ? (
                      <tr>
                        <td colSpan={iq09Columns.length}>Carregando planilha IQ09…</td>
                      </tr>
                    ) : iq09Rows.length === 0 ? (
                      <tr>
                        <td colSpan={iq09Columns.length}>
                          Nenhum registro IQ09 carregado. Clique em Executar IQ09 para
                          importar a planilha.
                        </td>
                      </tr>
                    ) : (
                      iq09Rows.map((row, index) => (
                        <tr key={`${row['Nº de série'] || 'row'}-${index}`}>
                          {iq09Columns.map((column) => (
                            <td key={column}>{row[column] || '—'}</td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
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
          )}
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
