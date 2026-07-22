import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
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

type SerializedItem = {
  id: string
  serial: string
  material: string
  description: string
  matched: boolean
  registeredAt: string
}

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

function normalizeSerial(value: string) {
  return value.trim().replace(/\s+/g, '')
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
  const [scanValue, setScanValue] = useState('')
  const [lastScannedSerial, setLastScannedSerial] = useState<string | null>(null)
  const [serializedItems, setSerializedItems] = useState<SerializedItem[]>([])
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const scanInputRef = useRef<HTMLInputElement | null>(null)

  const openMonth =
    months.find((month) => monthTitle(month) === openMonthTitle) ?? null

  const iq09BySerial = useMemo(() => {
    const map = new Map<string, Iq09Row>()
    for (const row of iq09Rows) {
      const serial = normalizeSerial(row['Nº de série'] || '')
      if (serial && !map.has(serial)) {
        map.set(serial, row)
      }
    }
    return map
  }, [iq09Rows])

  // Ao trocar de mês, reinicia a trilha e carrega export salvo.
  useEffect(() => {
    setActiveTrailStep('IQ09')
    setCompletedStepKeys([])
    setFeedback(null)
    setRunningIq09(false)
    setIq09Columns([...IQ09_COLUMNS])
    setIq09Rows([])
    setScanValue('')
    setLastScannedSerial(null)
    setSerializedItems([])

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

  useEffect(() => {
    if (activeTrailStep !== 'Serializar' || readOnly) return
    const timer = window.setTimeout(() => {
      scanInputRef.current?.focus()
    }, 50)
    return () => window.clearTimeout(timer)
  }, [activeTrailStep, readOnly, openMonthTitle])

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

    // IQ09 só conclui ao rodar o script; Serializar ao registrar séries.
    if (stepKey === 'IQ09' || stepKey === 'Serializar') {
      setFeedback(null)
      return
    }

    const isAdvancing = stepIndex === unlockedIndex
    if (isAdvancing) {
      completeStep(stepKey as InventarioTrailStepKey)
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

  const registerSerial = (rawValue: string) => {
    const serial = normalizeSerial(rawValue)
    if (!serial) {
      setFeedback({
        type: 'error',
        message: 'Informe ou escaneie um número de série.',
      })
      return false
    }

    const alreadyRegistered = serializedItems.some(
      (item) => item.serial.toLowerCase() === serial.toLowerCase(),
    )
    if (alreadyRegistered) {
      setLastScannedSerial(serial)
      setFeedback({
        type: 'error',
        message: `Série ${serial} já foi registrada.`,
      })
      return false
    }

    const match = iq09BySerial.get(serial) ?? iq09BySerial.get(serial.toUpperCase())
    const matchedRow =
      match ??
      [...iq09BySerial.entries()].find(
        ([key]) => key.toLowerCase() === serial.toLowerCase(),
      )?.[1]

    const item: SerializedItem = {
      id: `${serial}-${Date.now()}`,
      serial,
      material: matchedRow?.Material || '',
      description: matchedRow?.['Texto breve material'] || '',
      matched: Boolean(matchedRow),
      registeredAt: new Date().toLocaleString('pt-BR'),
    }

    setSerializedItems((current) => [item, ...current])
    setLastScannedSerial(serial)
    completeStep('Serializar')
    setFeedback({
      type: 'success',
      message: matchedRow
        ? `Série ${serial} registrada.`
        : `Série ${serial} registrada (não encontrada no IQ09).`,
    })
    return true
  }

  const handleScanSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (readOnly) return
    const registered = registerSerial(scanValue)
    if (registered) {
      setScanValue('')
      scanInputRef.current?.focus()
    }
  }

  const handleRemoveSerialized = (id: string) => {
    if (readOnly) return
    setSerializedItems((current) => {
      const next = current.filter((item) => item.id !== id)
      if (next.length === 0) {
        setCompletedStepKeys((keys) => keys.filter((key) => key !== 'Serializar'))
        setLastScannedSerial(null)
      }
      return next
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
          ) : activeTrailStep === 'Serializar' ? (
            <div className="inventario-serializar-panel">
              <form className="inventario-serializar-scan" onSubmit={handleScanSubmit}>
                <label htmlFor="inventario-serial-scan">
                  Número de série (scanner ou digitação)
                </label>
                <div className="inventario-serializar-scan-row">
                  <input
                    ref={scanInputRef}
                    id="inventario-serial-scan"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Escaneie ou digite o nº de série e pressione Enter"
                    value={scanValue}
                    disabled={readOnly}
                    onChange={(event) => setScanValue(event.target.value)}
                  />
                  <button
                    type="submit"
                    className="primary-button inventario-serializar-register"
                    disabled={readOnly || !scanValue.trim()}
                  >
                    Registrar
                  </button>
                </div>
                <p className="inventario-serializar-hint">
                  O leitor de código de barras funciona como teclado: ao bipar, o número
                  entra no campo e o Enter registra automaticamente.
                </p>
              </form>

              {lastScannedSerial ? (
                <div className="inventario-serializar-last" aria-live="polite">
                  <span>Último número</span>
                  <strong>{lastScannedSerial}</strong>
                </div>
              ) : null}

              <div className="inventario-serializar-summary">
                <span>
                  {serializedItems.length}{' '}
                  {serializedItems.length === 1 ? 'série registrada' : 'séries registradas'}
                </span>
                {iq09Rows.length > 0 ? (
                  <span>
                    {serializedItems.filter((item) => item.matched).length} de{' '}
                    {iq09Rows.length} encontrados no IQ09
                  </span>
                ) : null}
              </div>

              <div className="entrada-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nº de série</th>
                      <th>Material</th>
                      <th>Descrição</th>
                      <th>Status</th>
                      <th>Registrado em</th>
                      {readOnly ? null : <th>Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {serializedItems.length === 0 ? (
                      <tr>
                        <td colSpan={readOnly ? 5 : 6}>
                          Nenhuma série registrada ainda. Escaneie ou digite um número
                          acima.
                        </td>
                      </tr>
                    ) : (
                      serializedItems.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.serial}</strong>
                          </td>
                          <td>{item.material || '—'}</td>
                          <td>{item.description || '—'}</td>
                          <td>
                            <span
                              className={`inventario-serial-status ${item.matched ? 'is-matched' : 'is-unmatched'}`}
                            >
                              {item.matched ? 'No IQ09' : 'Fora do IQ09'}
                            </span>
                          </td>
                          <td>{item.registeredAt}</td>
                          {readOnly ? null : (
                            <td>
                              <button
                                type="button"
                                className="secondary-button inventario-serial-remove"
                                onClick={() => handleRemoveSerialized(item.id)}
                              >
                                Remover
                              </button>
                            </td>
                          )}
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
