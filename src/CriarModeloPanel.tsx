import { FormEvent, useCallback, useEffect, useMemo, useState, type WheelEvent } from 'react'
import {
  api,
  ApiError,
  type MeterModelRecord,
  type UnregisteredMeterModelRecord,
} from './api'
import { formatAuditDate } from './auditLabels'
import { LoginFeedback } from './LoginFeedback'

const METER_TYPE_OPTIONS = ['Eletrônico', 'Eletromecânico']
const VOLTAGE_OPTIONS = [
  '240V',
  '120V',
  '230V',
  '120V \u2022 220V',
  '120V \u2022 240V',
]
const CURRENT_OPTIONS = [
  'Min. 15A • Máx. 100A',
  'Min. 15A • Máx. 120A',
  'Min. 15A • Máx. 60A',
  'Min. 2,5A • Máx. 10A',
  'Min. 30A • Máx. 200A',
  'Min. 2,5A • Máx. 20A',
  'Min. 10A',
  'Min. 15A',
]
const WIRES_ELEMENTS_OPTIONS = [
  '2 FIOS 1 ELEMENTO',
  '3 FIOS 1 ELEMENTO',
  '3 FIOS 2 ELEMENTOS',
  '4 FIOS 3 ELEMENTOS',
  '4 FIOS 2 ELEMENTOS',
  '3 FIOS 3 ELEMENTOS',
]
const CLASS_OPTIONS = [
  'CLASSE 1',
  'CLASSE 2',
  'CLASSE A',
  'CLASSE B',
  'CLASSE C',
  'CLASSE D',
]
const CONSTANT_OPTIONS = [
  '0,3',
  '0,3125',
  '0,6',
  '1',
  '1,25',
  '1,8',
  '2',
  '2,4',
  '3',
  '3,6',
  '4,0',
  '4,8',
  '6',
  '6,25',
  '7,2',
  '10',
  '10,8',
  '14,4',
  '21,6',
]
const MANUFACTURER_OPTIONS = [
  'NANSEN',
  'ELETRA',
  'ELO',
  'LANDIS GYR',
  'LANDIS GYR \u2022 SIEMENS',
  'SCHLUMBERGER',
  'CBM',
  'GE',
  'ELSTER',
  'ELSTER \u2022 ABB',
  'ABB',
  'ABB \u2022 WESTINGHOUSE',
  'ITRON',
  'DOWERTECH',
  'SIEMENS',
  'INEPAR',
  'INEPAR \u2022 GE',
  'WESTINGHOUSE',
  'ECIL',
  'FAE',
  'ACTARIS',
  'APREL',
]

type FormMode = 'create' | 'edit' | 'passivo' | null
type PanelView = 'lista' | 'nao-registrados'

type PassiveModelInput = {
  name: string
  manufacturer?: string
  meterType?: string
  voltage?: string
  current?: string
  wiresElements?: string
  accuracyClass?: string
  constant?: string
}

type PassiveRowResult = {
  name: string
  manufacturer: string
  meterType: string
  voltage: string
  current: string
  wiresElements: string
  accuracyClass: string
  constant: string
  status: 'created' | 'duplicate' | 'invalid'
  error?: string
}

const HEADER_ALIASES: Record<string, keyof PassiveModelInput | 'skip'> = {
  modelo: 'name',
  name: 'name',
  model: 'name',
  fabricante: 'manufacturer',
  manufacturer: 'manufacturer',
  tipo: 'meterType',
  'tipo do medidor': 'meterType',
  'tipo medidor': 'meterType',
  metertype: 'meterType',
  meter_type: 'meterType',
  tensao: 'voltage',
  tensão: 'voltage',
  voltage: 'voltage',
  corrente: 'current',
  current: 'current',
  'fios elementos': 'wiresElements',
  'fios • elementos': 'wiresElements',
  'fios-elementos': 'wiresElements',
  fios: 'wiresElements',
  elementos: 'wiresElements',
  wireselements: 'wiresElements',
  wires_elements: 'wiresElements',
  classe: 'accuracyClass',
  'classe de exatidao': 'accuracyClass',
  'classe de exatidão': 'accuracyClass',
  accuracyclass: 'accuracyClass',
  accuracy_class: 'accuracyClass',
  constante: 'constant',
  constant: 'constant',
  meter_constant: 'constant',
}

function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t')
  if (line.includes(';')) return line.split(';')
  if (line.includes(',')) return line.split(',')
  return [line]
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function parseMeterTypeLabel(value: string): string {
  const raw = normalizeOptionValue(value)
  if (!raw) return ''
  if (raw.includes('eletromecan') || raw === 'mecanico' || raw === 'em') {
    return 'Eletromecânico'
  }
  if (raw.includes('eletron') || raw === 'el') {
    return 'Eletrônico'
  }
  return value.trim()
}

function normalizeOptionValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[•·⋅]/g, ' ')
    .replace(/[–—-]/g, ' ')
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function matchOption(value: string, options: readonly string[]): string | null {
  const normalized = normalizeOptionValue(value)
  if (!normalized) return null
  for (const option of options) {
    if (normalizeOptionValue(option) === normalized) return option
  }
  return null
}

function matchVoltageOption(value: string): string | null {
  const matched = matchOption(value, VOLTAGE_OPTIONS)
  if (matched) return matched

  const normalized = normalizeOptionValue(value)
  const legacy240 = [
    '240V • 120V',
    '240V 120V',
    '240V-120V',
    '240V bolinha 120V',
    '120V 240V',
    'Min. 120V • Máx. 240V',
    'Min. 120V (Bolinha) Máx. 240V',
    'Min. 120V Bolinha Máx. 240V',
    'Min. 120V (•) Máx. 240V',
  ]
  if (legacy240.some((label) => normalizeOptionValue(label) === normalized)) {
    return '120V \u2022 240V'
  }
  const legacy220 = [
    '220V • 120V',
    '220V 120V',
    '220V-120V',
    '220V bolinha 120V',
    '120V 220V',
    'Min. 120V • Máx. 220V',
    'Min. 120V (Bolinha) Máx. 220V',
    'Min. 120V Bolinha Máx. 220V',
    'Min. 120V (•) Máx. 220V',
  ]
  if (legacy220.some((label) => normalizeOptionValue(label) === normalized)) {
    return '120V \u2022 220V'
  }
  if (normalized.includes('bolinha') && normalized.includes('120') && normalized.includes('240')) {
    return '120V \u2022 240V'
  }
  if (normalized.includes('bolinha') && normalized.includes('120') && normalized.includes('220')) {
    return '120V \u2022 220V'
  }
  if (
    normalized.includes('120') &&
    normalized.includes('240') &&
    (normalized.includes('min') || normalized.includes('max'))
  ) {
    return '120V \u2022 240V'
  }
  if (
    normalized.includes('120') &&
    normalized.includes('220') &&
    (normalized.includes('min') || normalized.includes('max'))
  ) {
    return '120V \u2022 220V'
  }
  return null
}

function matchCurrentOption(value: string): string | null {
  const matched = matchOption(value, CURRENT_OPTIONS)
  if (matched) return matched

  const normalized = normalizeOptionValue(value)
  if (
    normalized === '15a' ||
    normalized === 'min 15a' ||
    normalized === 'min.15a'
  ) {
    return 'Min. 15A'
  }
  if (normalized === '10a' || normalized === 'min 10a' || normalized === 'min.10a') {
    return 'Min. 10A'
  }
  return null
}

function modelCharacteristicsKey(fields: {
  name: string
  manufacturer: string
  meterType: string
  voltage: string
  current: string
  wiresElements: string
  accuracyClass: string
  constant: string
}): string {
  return [
    fields.name,
    fields.manufacturer,
    fields.meterType,
    fields.voltage,
    fields.current,
    fields.wiresElements,
    fields.accuracyClass,
    fields.constant,
  ]
    .map((value) => normalizeOptionValue(value === '—' ? '' : value))
    .join('|')
}

function validatePassiveModelRow(
  row: PassiveModelInput,
  defaults: { manufacturer: string; meterType: string },
): {
  valid: boolean
  duplicate: boolean
  error?: string
  display: Required<PassiveModelInput>
  key: string
} {
  const name = row.name.trim()
  const manufacturerRaw = (row.manufacturer || defaults.manufacturer).trim()
  const meterTypeRaw = parseMeterTypeLabel(row.meterType || defaults.meterType)
  const voltageRaw = (row.voltage || '').trim()
  const currentRaw = (row.current || '').trim()
  const wiresRaw = (row.wiresElements || '').trim()
  const classRaw = (row.accuracyClass || '').trim()
  const constantRaw = (row.constant || '').trim()

  const display: Required<PassiveModelInput> = {
    name: name || '—',
    manufacturer: manufacturerRaw || '—',
    meterType: meterTypeRaw || '—',
    voltage: voltageRaw || '—',
    current: currentRaw || '—',
    wiresElements: wiresRaw || '—',
    accuracyClass: classRaw || '—',
    constant: constantRaw || '—',
  }

  const emptyKey = modelCharacteristicsKey({
    name,
    manufacturer: manufacturerRaw,
    meterType: meterTypeRaw,
    voltage: voltageRaw,
    current: currentRaw,
    wiresElements: wiresRaw,
    accuracyClass: classRaw,
    constant: constantRaw,
  })

  if (!name) {
    return {
      valid: false,
      duplicate: false,
      error: 'Modelo é obrigatório.',
      display,
      key: emptyKey,
    }
  }

  const manufacturer = matchOption(manufacturerRaw, MANUFACTURER_OPTIONS)
  if (!manufacturer) {
    return {
      valid: false,
      duplicate: false,
      error: manufacturerRaw
        ? `Fabricante inválido: ${manufacturerRaw}`
        : 'Fabricante é obrigatório.',
      display,
      key: emptyKey,
    }
  }

  const meterType = matchOption(meterTypeRaw, METER_TYPE_OPTIONS)
  if (!meterType) {
    return {
      valid: false,
      duplicate: false,
      error: meterTypeRaw
        ? `Tipo inválido: ${meterTypeRaw}`
        : 'Tipo é obrigatório.',
      display,
      key: emptyKey,
    }
  }

  if (voltageRaw && !matchVoltageOption(voltageRaw)) {
    return {
      valid: false,
      duplicate: false,
      error: `Tensão inválida: ${voltageRaw}`,
      display,
      key: emptyKey,
    }
  }
  if (currentRaw && !matchCurrentOption(currentRaw)) {
    return {
      valid: false,
      duplicate: false,
      error: `Corrente inválida: ${currentRaw}`,
      display,
      key: emptyKey,
    }
  }
  if (wiresRaw && !matchOption(wiresRaw, WIRES_ELEMENTS_OPTIONS)) {
    return {
      valid: false,
      duplicate: false,
      error: `Fios • Elementos inválido: ${wiresRaw}`,
      display,
      key: emptyKey,
    }
  }
  if (classRaw && !matchOption(classRaw, CLASS_OPTIONS)) {
    return {
      valid: false,
      duplicate: false,
      error: `Classe inválida: ${classRaw}`,
      display,
      key: emptyKey,
    }
  }
  if (constantRaw && !matchOption(constantRaw, CONSTANT_OPTIONS)) {
    return {
      valid: false,
      duplicate: false,
      error: `Constante inválida: ${constantRaw}`,
      display,
      key: emptyKey,
    }
  }

  const resolved = {
    name,
    manufacturer,
    meterType,
    voltage: voltageRaw ? matchVoltageOption(voltageRaw) || voltageRaw : '',
    current: currentRaw ? matchCurrentOption(currentRaw) || currentRaw : '',
    wiresElements: wiresRaw
      ? matchOption(wiresRaw, WIRES_ELEMENTS_OPTIONS) || wiresRaw
      : '',
    accuracyClass: classRaw ? matchOption(classRaw, CLASS_OPTIONS) || classRaw : '',
    constant: constantRaw
      ? matchOption(constantRaw, CONSTANT_OPTIONS) || constantRaw
      : '',
  }

  return {
    valid: true,
    duplicate: false,
    display: {
      name: resolved.name,
      manufacturer: resolved.manufacturer,
      meterType: resolved.meterType,
      voltage: resolved.voltage || '—',
      current: resolved.current || '—',
      wiresElements: resolved.wiresElements || '—',
      accuracyClass: resolved.accuracyClass || '—',
      constant: resolved.constant || '—',
    },
    key: modelCharacteristicsKey(resolved),
  }
}

function parsePassiveModelPaste(text: string): PassiveModelInput[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) return []

  const firstCells = splitLine(lines[0]).map((cell) =>
    cell.replace(/\u00a0/g, ' ').trim(),
  )
  const mappedHeaders = firstCells.map(
    (cell) => HEADER_ALIASES[normalizeHeader(cell)] ?? null,
  )
  const hasHeader = mappedHeaders.some((key) => key === 'name' || key === 'manufacturer')

  const rows: PassiveModelInput[] = []
  const dataLines = hasHeader ? lines.slice(1) : lines
  const columnKeys = hasHeader
    ? mappedHeaders
    : ([
        'name',
        'meterType',
        'manufacturer',
        'voltage',
        'current',
        'wiresElements',
        'accuracyClass',
        'constant',
      ] as Array<keyof PassiveModelInput | null>)

  for (const line of dataLines) {
    const cells = splitLine(line).map((cell) =>
      cell.replace(/\u00a0/g, ' ').trim(),
    )
    if (!cells.some(Boolean)) continue

    const first = normalizeHeader(cells[0] ?? '')
    if (first === 'modelo' || first === 'name' || first === 'model') {
      continue
    }

    const row: PassiveModelInput = { name: '' }

    columnKeys.forEach((key, index) => {
      if (!key || key === 'skip') return
      const value = cells[index] ?? ''
      if (!value) return
      if (key === 'meterType') {
        row.meterType = parseMeterTypeLabel(value)
        return
      }
      row[key] = value
    })

    if (!hasHeader && cells.length >= 1 && !row.name) {
      row.name = cells[0] ?? ''
      row.meterType = parseMeterTypeLabel(cells[1] ?? '')
      row.manufacturer = cells[2] ?? ''
      row.voltage = cells[3] ?? ''
      row.current = cells[4] ?? ''
      row.wiresElements = cells[5] ?? ''
      row.accuracyClass = cells[6] ?? ''
      row.constant = cells[7] ?? ''
    }

    if (!row.name.trim()) continue
    rows.push(row)
  }

  return rows
}

export function CriarModeloPanel({
  readOnly = false,
  isAdmin = false,
}: {
  readOnly?: boolean
  isAdmin?: boolean
}) {
  const [models, setModels] = useState<MeterModelRecord[]>([])
  const [unregistered, setUnregistered] = useState<UnregisteredMeterModelRecord[]>(
    [],
  )
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [panelView, setPanelView] = useState<PanelView>('lista')
  const [pasteText, setPasteText] = useState('')
  const [editableRows, setEditableRows] = useState<PassiveModelInput[]>([])
  const [results, setResults] = useState<PassiveRowResult[]>([])
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const [name, setName] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [meterType, setMeterType] = useState(METER_TYPE_OPTIONS[0])
  const [voltage, setVoltage] = useState('')
  const [current, setCurrent] = useState('')
  const [wiresElements, setWiresElements] = useState('')
  const [accuracyClass, setAccuracyClass] = useState('')
  const [constant, setConstant] = useState('')

  const previewRows = useMemo(() => {
    const existingKeys = new Set(
      models.map((model) =>
        modelCharacteristicsKey({
          name: model.name,
          manufacturer: model.manufacturer,
          meterType: model.meterType,
          voltage: model.voltage || '',
          current: model.current || '',
          wiresElements: model.wiresElements || '',
          accuracyClass: model.accuracyClass || '',
          constant: model.constant || '',
        }),
      ),
    )
    const seenKeys = new Set<string>()

    return editableRows.map((row) => {
      const validated = validatePassiveModelRow(row, {
        manufacturer: '',
        meterType: '',
      })

      if (!validated.valid) {
        return validated
      }

      const alreadyExists = existingKeys.has(validated.key)
      const repeatedInPaste = seenKeys.has(validated.key)
      seenKeys.add(validated.key)

      if (alreadyExists || repeatedInPaste) {
        return {
          ...validated,
          duplicate: true,
          error: alreadyExists
            ? 'Repetido: já existe modelo com exatamente as mesmas características.'
            : 'Repetido: linha duplicada na colagem (mesmas características).',
        }
      }

      return validated
    })
  }, [editableRows, models])

  const invalidPreviewCount = useMemo(
    () => previewRows.filter((row) => !row.valid).length,
    [previewRows],
  )

  const duplicatePreviewCount = useMemo(
    () => previewRows.filter((row) => row.duplicate).length,
    [previewRows],
  )

  const updateEditableRow = (
    index: number,
    field: keyof PassiveModelInput,
    value: string,
  ) => {
    setEditableRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    )
  }

  const removeEditableRow = (index: number) => {
    setEditableRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
  }

  const handlePreviewTableWheel = (event: WheelEvent<HTMLDivElement>) => {
    const container = event.currentTarget
    if (container.scrollWidth <= container.clientWidth) return

    const mostlyHorizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    if (event.shiftKey || mostlyHorizontal) {
      const delta = mostlyHorizontal ? event.deltaX : event.deltaY
      if (!delta) return
      event.preventDefault()
      container.scrollLeft += delta
    }
  }

  const handlePasteChange = (text: string) => {
    setPasteText(text)
    setEditableRows(parsePassiveModelPaste(text))
    setResults([])
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ models: rows }, { records }] = await Promise.all([
        api.listMeterModels(),
        api.listUnregisteredMeterModels(),
      ])
      setModels(rows)
      setUnregistered(records)
    } catch (error) {
      setModels([])
      setUnregistered([])
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os modelos de medidores.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const resetForm = () => {
    setName('')
    setManufacturer('')
    setMeterType(METER_TYPE_OPTIONS[0])
    setVoltage('')
    setCurrent('')
    setWiresElements('')
    setAccuracyClass('')
    setConstant('')
    setPasteText('')
    setEditableRows([])
    setResults([])
    setEditingId(null)
  }

  const openForm = (mode: FormMode) => {
    setPanelView('lista')
    setFormMode((current) => (current === mode ? null : mode))
    resetForm()
    setFeedback(null)
  }

  const openEdit = (model: MeterModelRecord) => {
    setPanelView('lista')
    setFormMode('edit')
    setEditingId(model.id)
    setName(model.name)
    setManufacturer(model.manufacturer)
    setMeterType(model.meterType || METER_TYPE_OPTIONS[0])
    setVoltage(model.voltage || '')
    setCurrent(model.current || '')
    setWiresElements(model.wiresElements || '')
    setAccuracyClass(model.accuracyClass || '')
    setConstant(model.constant || '')
    setPasteText('')
    setEditableRows([])
    setResults([])
    setFeedback(null)
  }

  const openUnregisteredHistory = () => {
    setFormMode(null)
    resetForm()
    setFeedback(null)
    setPanelView('nao-registrados')
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()

    if (formMode === 'passivo') {
      if (!editableRows.length) {
        setFeedback({
          type: 'error',
          message:
            'Cole ou edite ao menos uma linha com modelo, tipo e fabricante.',
        })
        return
      }

      setCreating(true)
      setFeedback(null)
      try {
        const response = await api.createPassiveMeterModels({
          records: editableRows,
        })
        setResults(response.results)
        if (response.models.length) {
          setModels((currentRows) => [...response.models, ...currentRows])
        }

        const { records } = await api.listUnregisteredMeterModels()
        setUnregistered(records)

        setEditableRows([])
        setPasteText('')

        const ignored = response.unregisteredCount
        setFeedback({
          type: response.createdCount || ignored ? 'success' : 'error',
          message: `${response.createdCount} modelo(s) OK cadastrado(s)${
            ignored
              ? ` · ${ignored} enviado(s) ao Histórico de não registrados`
              : ''
          }.`,
        })
      } catch (error) {
        setFeedback({
          type: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'Não foi possível cadastrar os modelos passivos.',
        })
      } finally {
        setCreating(false)
      }
      return
    }

    if (!name.trim() || !manufacturer.trim() || !meterType.trim()) {
      setFeedback({
        type: 'error',
        message: 'Informe modelo, fabricante e tipo do medidor.',
      })
      return
    }

    setCreating(true)
    setFeedback(null)
    try {
      const payload = {
        name: name.trim(),
        manufacturer: manufacturer.trim(),
        meterType: meterType.trim(),
        voltage: voltage.trim(),
        current: current.trim(),
        wiresElements: wiresElements.trim(),
        accuracyClass: accuracyClass.trim(),
        constant: constant.trim(),
      }

      if (formMode === 'edit' && editingId != null) {
        const { model } = await api.updateMeterModel(editingId, payload)
        try {
          const { models: rows } = await api.listMeterModels()
          setModels(rows)
        } catch {
          setModels((currentRows) =>
            currentRows.map((row) => (row.id === model.id ? model : row)),
          )
        }
        resetForm()
        setFormMode(null)
        setFeedback({
          type: 'success',
          message: `Modelo "${model.name}" atualizado com sucesso.`,
        })
      } else {
        const { model } = await api.createMeterModel(payload)
        setModels((currentRows) => [model, ...currentRows])
        resetForm()
        setFormMode(null)
        setFeedback({
          type: 'success',
          message: `Modelo "${model.name}" cadastrado com sucesso.`,
        })
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : formMode === 'edit'
              ? 'Não foi possível atualizar o modelo.'
              : 'Não foi possível cadastrar o modelo.',
      })
    } finally {
      setCreating(false)
    }
  }

  const formOpen = formMode !== null

  const modelFields = (
    <>
      <label>
        Modelo
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nome do modelo"
          required
          disabled={creating}
        />
      </label>
      <fieldset className="radio-fieldset criar-modelo-voltage full-width">
        <legend>Tipo</legend>
        <div className="ratm-choice-group" role="radiogroup" aria-label="Tipo">
          {METER_TYPE_OPTIONS.map((option) => {
            const selected = meterType === option
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`ratm-choice-btn tone-neutral${selected ? ' is-selected' : ''}`}
                disabled={creating}
                onClick={() => setMeterType(option)}
              >
                <span>{option}</span>
              </button>
            )
          })}
        </div>
      </fieldset>
      <label>
        Fabricante
        <select
          value={manufacturer}
          onChange={(event) => setManufacturer(event.target.value)}
          required
          disabled={creating}
        >
          <option value="">Selecione o fabricante</option>
          {MANUFACTURER_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="radio-fieldset criar-modelo-voltage full-width">
        <legend>Tensão</legend>
        <div className="ratm-choice-group" role="radiogroup" aria-label="Tensão">
          {VOLTAGE_OPTIONS.map((option) => {
            const selected = voltage === option
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`ratm-choice-btn tone-neutral${selected ? ' is-selected' : ''}`}
                disabled={creating}
                onClick={() => setVoltage(option)}
              >
                <span>{option}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <label>
        Corrente
        <select
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          disabled={creating}
        >
          <option value="">Localizar itens</option>
          {CURRENT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label>
        Fios • Elementos
        <select
          value={wiresElements}
          onChange={(event) => setWiresElements(event.target.value)}
          disabled={creating}
        >
          <option value="">Localizar itens</option>
          {WIRES_ELEMENTS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label>
        Classe
        <select
          value={accuracyClass}
          onChange={(event) => setAccuracyClass(event.target.value)}
          disabled={creating}
        >
          <option value="">Localizar itens</option>
          {CLASS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label>
        Constante
        <select
          value={constant}
          onChange={(event) => setConstant(event.target.value)}
          disabled={creating}
        >
          <option value="">Localizar itens</option>
          {CONSTANT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    </>
  )

  return (
    <div className="criar-modelo-panel">
      {panelView === 'nao-registrados' ? (
        <section
          className="agenda-dedicated-screen"
          aria-label="Histórico de não registrados"
        >
          <p className="entrada-panel-intro">
            Modelos enviados no passivo que não entraram no cadastro (inválidos
            ou repetidos).
          </p>
          <div className="area-actions right-aligned-actions criar-modelo-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setPanelView('lista')}
            >
              Voltar
            </button>
          </div>
          {loading ? (
            <p className="entrada-panel-empty">Carregando histórico...</p>
          ) : unregistered.length ? (
            <div className="entrada-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th>Tipo</th>
                    <th>Fabricante</th>
                    <th>Tensão</th>
                    <th>Corrente</th>
                    <th>Fios • Elementos</th>
                    <th>Classe</th>
                    <th>Constante</th>
                    <th>Motivo</th>
                    <th>Enviado por</th>
                    <th>Em</th>
                  </tr>
                </thead>
                <tbody>
                  {unregistered.map((row) => (
                    <tr
                      key={row.id}
                      className={
                        row.status === 'invalid'
                          ? 'modelo-passivo-row-invalid'
                          : 'modelo-passivo-row-duplicate'
                      }
                    >
                      <td>{row.name}</td>
                      <td>{row.meterType}</td>
                      <td>{row.manufacturer}</td>
                      <td>{row.voltage}</td>
                      <td>{row.current}</td>
                      <td>{row.wiresElements}</td>
                      <td>{row.accuracyClass}</td>
                      <td>{row.constant}</td>
                      <td>
                        {row.status === 'duplicate'
                          ? row.reason || 'Repetido'
                          : row.reason || 'Inválido'}
                      </td>
                      <td>
                        {row.createdByName ||
                          row.createdByRegistration ||
                          '—'}
                      </td>
                      <td>{formatAuditDate(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="entrada-panel-empty">
              Nenhum modelo no histórico de não registrados.
            </p>
          )}
        </section>
      ) : (
        <>
      <div className="area-actions right-aligned-actions criar-modelo-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={openUnregisteredHistory}
        >
          Histórico de não registrados
          {unregistered.length ? ` (${unregistered.length})` : ''}
        </button>
        {isAdmin ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => openForm('passivo')}
          >
            {formMode === 'passivo' ? 'Fechar passivo' : 'Adicionar passivo'}
          </button>
        ) : null}
        {readOnly ? null : (
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              if (formMode === 'create' || formMode === 'edit') {
                setFormMode(null)
                resetForm()
                setFeedback(null)
                return
              }
              openForm('create')
            }}
          >
            {formMode === 'create' || formMode === 'edit'
              ? 'Fechar formulário'
              : 'Criar modelo'}
          </button>
        )}
      </div>

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={
            feedback.type === 'success' ? () => setFeedback(null) : undefined
          }
        />
      ) : null}

      {formOpen && (formMode === 'passivo' ? isAdmin : !readOnly) ? (
        <form
          className={`material-form-grid criar-modelo-form${
            formMode === 'passivo' ? ' passivo-panel' : ''
          }`}
          onSubmit={(event) => void handleCreate(event)}
        >
          {formMode === 'create' || formMode === 'edit' ? (
            modelFields
          ) : (
              <>
                <label className="passivo-paste-label full-width">
                  <textarea
                    rows={8}
                    value={pasteText}
                    onChange={(event) => handlePasteChange(event.target.value)}
                    placeholder={
                      'Modelo\tTipo\tFabricante\tTensão\tCorrente\tFios • Elementos\tClasse\tConstante\nA1052\tEletrônico\tNANSEN\t240V\tMin. 15A • Máx. 100A\t2 FIOS 1 ELEMENTO\tCLASSE 1\t1,8'
                    }
                    spellCheck={false}
                    disabled={creating}
                    aria-label="Colar registros em massa"
                  />
                </label>
                {editableRows.length ? (
                  <div className="full-width modelo-passivo-table-wrap">
                    <p className="field-hint">
                      Exibindo {editableRows.length} registro(s) para cadastro
                      {invalidPreviewCount
                        ? ` · ${invalidPreviewCount} inválido(s)`
                        : ''}
                      {duplicatePreviewCount
                        ? ` · ${duplicatePreviewCount} repetido(s)`
                        : ''}
                      . Clique nas células para editar.
                    </p>
                    {invalidPreviewCount || duplicatePreviewCount ? (
                      <p className="field-hint modelo-passivo-invalid-hint">
                        Vermelho = valor fora das opções. Amarelo = repetido (já
                        cadastrado ou duplicado na colagem). Ao cadastrar, só as
                        linhas OK entram; inválidas e repetidas vão para o
                        Histórico de não registrados.
                      </p>
                    ) : null}
                    <div
                      className="modelo-passivo-table-scroll"
                      onWheel={handlePreviewTableWheel}
                    >
                    <table className="data-table modelo-passivo-edit-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Modelo</th>
                          <th>Tipo</th>
                          <th>Fabricante</th>
                          <th>Tensão</th>
                          <th>Corrente</th>
                          <th>Fios • Elementos</th>
                          <th>Classe</th>
                          <th>Constante</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editableRows.map((row, index) => {
                          const preview = previewRows[index]
                          const rowClass = !preview?.valid
                            ? 'modelo-passivo-row-invalid'
                            : preview?.duplicate
                              ? 'modelo-passivo-row-duplicate'
                              : undefined
                          return (
                            <tr
                              key={`editable-${index}`}
                              className={rowClass}
                              title={preview?.error}
                            >
                              <td>{index + 1}</td>
                              <td>
                                <input
                                  type="text"
                                  value={row.name}
                                  disabled={creating}
                                  onChange={(event) =>
                                    updateEditableRow(index, 'name', event.target.value)
                                  }
                                  aria-label={`Modelo linha ${index + 1}`}
                                />
                              </td>
                              <td>
                                <select
                                  value={row.meterType || ''}
                                  disabled={creating}
                                  onChange={(event) =>
                                    updateEditableRow(
                                      index,
                                      'meterType',
                                      event.target.value,
                                    )
                                  }
                                  aria-label={`Tipo linha ${index + 1}`}
                                >
                                  <option value="">Selecione</option>
                                  {row.meterType &&
                                  !METER_TYPE_OPTIONS.includes(row.meterType) ? (
                                    <option value={row.meterType}>{row.meterType}</option>
                                  ) : null}
                                  {METER_TYPE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={row.manufacturer || ''}
                                  disabled={creating}
                                  onChange={(event) =>
                                    updateEditableRow(
                                      index,
                                      'manufacturer',
                                      event.target.value,
                                    )
                                  }
                                  aria-label={`Fabricante linha ${index + 1}`}
                                >
                                  <option value="">Selecione</option>
                                  {row.manufacturer &&
                                  !MANUFACTURER_OPTIONS.includes(row.manufacturer) ? (
                                    <option value={row.manufacturer}>
                                      {row.manufacturer}
                                    </option>
                                  ) : null}
                                  {MANUFACTURER_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={row.voltage || ''}
                                  disabled={creating}
                                  onChange={(event) =>
                                    updateEditableRow(index, 'voltage', event.target.value)
                                  }
                                  aria-label={`Tensão linha ${index + 1}`}
                                >
                                  <option value="">—</option>
                                  {row.voltage &&
                                  !VOLTAGE_OPTIONS.includes(row.voltage) ? (
                                    <option value={row.voltage}>{row.voltage}</option>
                                  ) : null}
                                  {VOLTAGE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={row.current || ''}
                                  disabled={creating}
                                  onChange={(event) =>
                                    updateEditableRow(index, 'current', event.target.value)
                                  }
                                  aria-label={`Corrente linha ${index + 1}`}
                                >
                                  <option value="">—</option>
                                  {row.current &&
                                  !CURRENT_OPTIONS.includes(row.current) ? (
                                    <option value={row.current}>{row.current}</option>
                                  ) : null}
                                  {CURRENT_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={row.wiresElements || ''}
                                  disabled={creating}
                                  onChange={(event) =>
                                    updateEditableRow(
                                      index,
                                      'wiresElements',
                                      event.target.value,
                                    )
                                  }
                                  aria-label={`Fios elementos linha ${index + 1}`}
                                >
                                  <option value="">—</option>
                                  {row.wiresElements &&
                                  !WIRES_ELEMENTS_OPTIONS.includes(row.wiresElements) ? (
                                    <option value={row.wiresElements}>
                                      {row.wiresElements}
                                    </option>
                                  ) : null}
                                  {WIRES_ELEMENTS_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={row.accuracyClass || ''}
                                  disabled={creating}
                                  onChange={(event) =>
                                    updateEditableRow(
                                      index,
                                      'accuracyClass',
                                      event.target.value,
                                    )
                                  }
                                  aria-label={`Classe linha ${index + 1}`}
                                >
                                  <option value="">—</option>
                                  {row.accuracyClass &&
                                  !CLASS_OPTIONS.includes(row.accuracyClass) ? (
                                    <option value={row.accuracyClass}>
                                      {row.accuracyClass}
                                    </option>
                                  ) : null}
                                  {CLASS_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={row.constant || ''}
                                  disabled={creating}
                                  onChange={(event) =>
                                    updateEditableRow(
                                      index,
                                      'constant',
                                      event.target.value,
                                    )
                                  }
                                  aria-label={`Constante linha ${index + 1}`}
                                >
                                  <option value="">—</option>
                                  {row.constant &&
                                  !CONSTANT_OPTIONS.includes(row.constant) ? (
                                    <option value={row.constant}>{row.constant}</option>
                                  ) : null}
                                  {CONSTANT_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                {!preview?.valid
                                  ? preview?.error || 'Inválido'
                                  : preview?.duplicate
                                    ? 'Repetido'
                                    : 'OK'}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="secondary-button modelo-passivo-remove"
                                  disabled={creating}
                                  onClick={() => removeEditableRow(index)}
                                  aria-label={`Remover linha ${index + 1}`}
                                >
                                  Remover
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                ) : null}
              </>
            )}

          <div className="agenda-form-actions full-width">
            <button
              type="button"
              className="secondary-button"
              disabled={creating}
              onClick={() => {
                resetForm()
                setFormMode(null)
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={
                creating ||
                (formMode === 'passivo'
                  ? !editableRows.length
                  : !name.trim() || !manufacturer.trim())
              }
            >
              {creating
                ? 'Salvando…'
                : formMode === 'passivo'
                  ? 'Cadastrar passivo'
                  : formMode === 'edit'
                    ? 'Salvar alteração'
                    : 'Salvar modelo'}
            </button>
          </div>

          {formMode === 'passivo' && results.length ? (
            <div className="full-width modelo-passivo-table-wrap">
              <p className="field-hint">
                Resultado do cadastro · {results.length} registro(s)
              </p>
              <div
                className="modelo-passivo-table-scroll"
                onWheel={handlePreviewTableWheel}
              >
              <table className="data-table modelo-passivo-edit-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Modelo</th>
                    <th>Tipo</th>
                    <th>Fabricante</th>
                    <th>Tensão</th>
                    <th>Corrente</th>
                    <th>Fios • Elementos</th>
                    <th>Classe</th>
                    <th>Constante</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, index) => (
                    <tr
                      key={`${row.name}-${index}`}
                      className={
                        row.status === 'invalid'
                          ? 'modelo-passivo-row-invalid'
                          : row.status === 'duplicate'
                            ? 'modelo-passivo-row-duplicate'
                            : undefined
                      }
                    >
                      <td>{index + 1}</td>
                      <td>{row.name}</td>
                      <td>{row.meterType || '—'}</td>
                      <td>{row.manufacturer}</td>
                      <td>{row.voltage || '—'}</td>
                      <td>{row.current || '—'}</td>
                      <td>{row.wiresElements || '—'}</td>
                      <td>{row.accuracyClass || '—'}</td>
                      <td>{row.constant || '—'}</td>
                      <td>
                        {row.status === 'created'
                          ? 'Cadastrado'
                          : row.status === 'duplicate'
                            ? row.error || 'Repetido'
                            : row.error || 'Inválido'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ) : null}
        </form>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">Carregando modelos...</p>
      ) : (
        <div className="entrada-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Tipo</th>
                <th>Fabricante</th>
                <th>Tensão</th>
                <th>Corrente</th>
                <th>Fios • Elementos</th>
                <th>Classe</th>
                <th>Constante</th>
                <th>Criado por</th>
                <th>Criado em</th>
                <th>Alterado por</th>
                <th>Alterado em</th>
                {readOnly ? null : <th></th>}
              </tr>
            </thead>
            <tbody>
              {models.length ? (
                models.map((model) => (
                  <tr key={model.id}>
                    <td>
                      {model.name}
                      {model.source === 'passivo' ? (
                        <>
                          {' '}
                          <span className="consult-passivo-badge">Passivo</span>
                        </>
                      ) : null}
                    </td>
                    <td>{model.meterType}</td>
                    <td>{model.manufacturer}</td>
                    <td>{model.voltage || '—'}</td>
                    <td>{model.current || '—'}</td>
                    <td>{model.wiresElements || '—'}</td>
                    <td>{model.accuracyClass || '—'}</td>
                    <td>{model.constant || '—'}</td>
                    <td>
                      {model.createdByName || model.createdByRegistration
                        ? `${model.createdByName || '—'}${
                            model.createdByRegistration
                              ? ` (${model.createdByRegistration})`
                              : ''
                          }`
                        : '—'}
                    </td>
                    <td>{new Date(model.createdAt).toLocaleString('pt-BR')}</td>
                    <td>
                      {model.updatedAt &&
                      (model.updatedByName || model.updatedByRegistration)
                        ? `${model.updatedByName || '—'}${
                            model.updatedByRegistration
                              ? ` (${model.updatedByRegistration})`
                              : ''
                          }`
                        : '—'}
                    </td>
                    <td>
                      {model.updatedAt
                        ? new Date(model.updatedAt).toLocaleString('pt-BR')
                        : '—'}
                    </td>
                    {readOnly ? null : (
                      <td>
                        <button
                          type="button"
                          className="secondary-button compact-button"
                          disabled={creating}
                          onClick={() => openEdit(model)}
                        >
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={readOnly ? 12 : 13}>
                    Nenhum modelo de medidor cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
    </div>
  )
}
