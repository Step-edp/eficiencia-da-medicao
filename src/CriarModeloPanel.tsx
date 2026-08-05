import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError, type MeterModelRecord } from './api'
import { LoginFeedback } from './LoginFeedback'

const METER_TYPE_OPTIONS = ['Eletrônico', 'Eletromecânico']
const VOLTAGE_OPTIONS = ['240V', '120V', '240V • 120V', '230V']
const CURRENT_OPTIONS = [
  'Min. 15A • Máx. 100A',
  'Min. 15A • Máx. 120A',
  'Min. 2,5A • Máx. 10A',
  'Min. 30A • Máx. 200A',
  'Min. 2,5A • Máx. 20A',
  '15A',
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
  '1,8',
  '3,6',
  '4,0',
  '4,8',
  '7,2',
  '10,8',
  '14,4',
  '2,4',
  '21,6',
  '0,3',
  '0,6',
  '1',
  '1,25',
  '0,3125',
  '6,25',
  '2',
  '10',
  '6',
]
const MANUFACTURER_OPTIONS = [
  'NANSEN',
  'ELETRA',
  'ELO',
  'LANDIS GYR',
  'SCHLUMBERGER',
  'CBM',
  'GE',
  'ELSTER',
  'ABB',
  'ITRON',
  'DOWERTECH',
  'SIEMENS',
  'INEPAR',
  'WESTINGHOUSE',
  'ECIL',
  'FAE',
  'ACTARIS',
  'APREL',
]

type FormMode = 'create' | 'passivo' | null
type PassiveEntryMode = 'individual' | 'massa'

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

  if (voltageRaw && !matchOption(voltageRaw, VOLTAGE_OPTIONS)) {
    return {
      valid: false,
      duplicate: false,
      error: `Tensão inválida: ${voltageRaw}`,
      display,
      key: emptyKey,
    }
  }
  if (currentRaw && !matchOption(currentRaw, CURRENT_OPTIONS)) {
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
    voltage: voltageRaw ? matchOption(voltageRaw, VOLTAGE_OPTIONS) || voltageRaw : '',
    current: currentRaw ? matchOption(currentRaw, CURRENT_OPTIONS) || currentRaw : '',
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
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [passiveEntryMode, setPassiveEntryMode] =
    useState<PassiveEntryMode>('individual')
  const [pasteText, setPasteText] = useState('')
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
    const rows = parsePassiveModelPaste(pasteText)
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

    return rows.map((row) => {
      const validated = validatePassiveModelRow(row, {
        manufacturer: manufacturer.trim(),
        meterType: meterType.trim(),
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
  }, [pasteText, manufacturer, meterType, models])

  const invalidPreviewCount = useMemo(
    () => previewRows.filter((row) => !row.valid).length,
    [previewRows],
  )

  const duplicatePreviewCount = useMemo(
    () => previewRows.filter((row) => row.duplicate).length,
    [previewRows],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { models: rows } = await api.listMeterModels()
      setModels(rows)
    } catch (error) {
      setModels([])
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
    setResults([])
    setPassiveEntryMode('individual')
  }

  const openForm = (mode: FormMode) => {
    setFormMode((current) => (current === mode ? null : mode))
    resetForm()
    setFeedback(null)
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()

    if (formMode === 'passivo' && passiveEntryMode === 'massa') {
      const records = parsePassiveModelPaste(pasteText)
      if (!records.length) {
        setFeedback({
          type: 'error',
          message:
            'Cole ao menos uma linha com modelo, fabricante e tipo (demais campos opcionais).',
        })
        return
      }

      setCreating(true)
      setFeedback(null)
      try {
        const response = await api.createPassiveMeterModels({
          records,
          manufacturer: manufacturer.trim() || undefined,
          meterType: meterType.trim() || undefined,
        })
        setResults(response.results)
        if (response.models.length) {
          setModels((currentRows) => [...response.models, ...currentRows])
        }
        if (!response.invalidCount) {
          setPasteText('')
        }
        setFeedback({
          type: response.createdCount ? 'success' : 'error',
          message: `${response.createdCount} modelo(s) passivo(s) cadastrado(s)${
            response.duplicateCount || response.invalidCount
              ? ` · ${response.duplicateCount} duplicado(s) · ${response.invalidCount} inválido(s)`
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

    const isPassivo = formMode === 'passivo'
    setCreating(true)
    setFeedback(null)
    try {
      if (isPassivo) {
        const response = await api.createPassiveMeterModels({
          records: [
            {
              name: name.trim(),
              manufacturer: manufacturer.trim(),
              meterType: meterType.trim(),
              voltage: voltage.trim(),
              current: current.trim(),
              wiresElements: wiresElements.trim(),
              accuracyClass: accuracyClass.trim(),
              constant: constant.trim(),
            },
          ],
        })
        setResults(response.results)
        if (response.createdCount === 0) {
          setFeedback({
            type: 'error',
            message:
              response.results.find((row) => row.error)?.error ||
              'Não foi possível cadastrar o modelo passivo.',
          })
        } else {
          setModels((currentRows) => [...response.models, ...currentRows])
          resetForm()
          setFormMode(null)
          setFeedback({
            type: 'success',
            message: `Modelo passivo "${response.models[0]?.name}" cadastrado com sucesso.`,
          })
        }
      } else {
        const { model } = await api.createMeterModel({
          name: name.trim(),
          manufacturer: manufacturer.trim(),
          meterType: meterType.trim(),
          voltage: voltage.trim(),
          current: current.trim(),
          wiresElements: wiresElements.trim(),
          accuracyClass: accuracyClass.trim(),
          constant: constant.trim(),
        })
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
            : 'Não foi possível cadastrar o modelo.',
      })
    } finally {
      setCreating(false)
    }
  }

  const formOpen = formMode !== null
  const isPassivoMass = formMode === 'passivo' && passiveEntryMode === 'massa'

  const modelFields = (
    <>
      <label>
        Modelo
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nome do modelo"
          required={!isPassivoMass}
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
          required={!isPassivoMass}
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

      {!isPassivoMass ? (
        <>
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
      ) : null}
    </>
  )

  return (
    <div className="criar-modelo-panel">
      <p className="entrada-panel-intro">
        Cadastre e consulte os modelos de medidores do laboratório, incluindo
        tensão, corrente, fios/elementos e classe.
      </p>

      <div className="area-actions right-aligned-actions criar-modelo-actions">
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
            onClick={() => openForm('create')}
          >
            {formMode === 'create' ? 'Fechar formulário' : 'Criar modelo'}
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

      {formOpen && (formMode === 'create' ? !readOnly : isAdmin) ? (
        <form
          className={`material-form-grid criar-modelo-form${
            formMode === 'passivo' ? ' passivo-panel' : ''
          }`}
          onSubmit={(event) => void handleCreate(event)}
        >
          {formMode === 'passivo' ? (
            <>
              <p className="passivo-intro full-width">
                Cadastro de modelos passivos. Campos:{' '}
                <strong>modelo</strong>, <strong>tipo</strong>,{' '}
                <strong>fabricante</strong>, <strong>tensão</strong>,{' '}
                <strong>corrente</strong>, <strong>fios • elementos</strong>,{' '}
                <strong>classe</strong> e <strong>constante</strong>.
              </p>
              <div
                className="passivo-mode-toggle full-width"
                role="group"
                aria-label="Modo de cadastro"
              >
                <button
                  type="button"
                  className={
                    passiveEntryMode === 'individual' ? 'passivo-mode-active' : undefined
                  }
                  onClick={() => setPassiveEntryMode('individual')}
                  disabled={creating}
                >
                  Individual
                </button>
                <button
                  type="button"
                  className={
                    passiveEntryMode === 'massa' ? 'passivo-mode-active' : undefined
                  }
                  onClick={() => setPassiveEntryMode('massa')}
                  disabled={creating}
                >
                  Em massa
                </button>
              </div>
            </>
          ) : null}

          {formMode === 'create' || passiveEntryMode === 'individual'
            ? modelFields
            : (
              <>
                <p className="field-hint full-width">
                  Opcionais: fabricante e tipo padrão abaixo preenchem linhas sem
                  esses valores.
                </p>
                <fieldset className="radio-fieldset criar-modelo-voltage full-width">
                  <legend>Tipo (padrão)</legend>
                  <div
                    className="ratm-choice-group"
                    role="radiogroup"
                    aria-label="Tipo padrão"
                  >
                    {METER_TYPE_OPTIONS.map((option) => {
                      const selected = meterType === option
                      return (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          className={`ratm-choice-btn tone-neutral${
                            selected ? ' is-selected' : ''
                          }`}
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
                  Fabricante (padrão)
                  <select
                    value={manufacturer}
                    onChange={(event) => setManufacturer(event.target.value)}
                    disabled={creating}
                  >
                    <option value="">Sem padrão</option>
                    {MANUFACTURER_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="passivo-paste-label full-width">
                  Colar registros (em massa)
                  <textarea
                    rows={10}
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    placeholder={
                      'Modelo\tTipo\tFabricante\tTensão\tCorrente\tFios • Elementos\tClasse\tConstante\nA1052\tEletrônico\tNANSEN\t240V\tMin. 15A • Máx. 100A\t2 FIOS 1 ELEMENTO\tCLASSE 1\t1,8'
                    }
                    spellCheck={false}
                    disabled={creating}
                    required
                  />
                </label>
                <p className="field-hint full-width">
                  Uma linha por modelo. Aceita tab, vírgula ou ponto e vírgula.
                  Cabeçalho opcional. Ordem sem cabeçalho: Modelo, Tipo,
                  Fabricante, Tensão, Corrente, Fios • Elementos, Classe, Constante.
                  Valores fora das opções ficam em vermelho e não são cadastrados.
                </p>
                {previewRows.length ? (
                  <div className="entrada-table-wrap full-width modelo-passivo-table-wrap">
                    <p className="field-hint">
                      Exibindo {previewRows.length} registro(s) para cadastro
                      {invalidPreviewCount
                        ? ` · ${invalidPreviewCount} inválido(s)`
                        : ''}
                      {duplicatePreviewCount
                        ? ` · ${duplicatePreviewCount} repetido(s)`
                        : ''}
                      .
                    </p>
                    {invalidPreviewCount || duplicatePreviewCount ? (
                      <p className="field-hint modelo-passivo-invalid-hint">
                        Vermelho = valor fora das opções. Amarelo = repetido (todos
                        os campos iguais). Esses não serão cadastrados.
                      </p>
                    ) : null}
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Prévia · Modelo</th>
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
                        {previewRows.map((row, index) => (
                          <tr
                            key={`${row.display.name}-${index}`}
                            className={
                              !row.valid
                                ? 'modelo-passivo-row-invalid'
                                : row.duplicate
                                  ? 'modelo-passivo-row-duplicate'
                                  : undefined
                            }
                            title={row.error}
                          >
                            <td>{index + 1}</td>
                            <td>{row.display.name}</td>
                            <td>{row.display.meterType}</td>
                            <td>{row.display.manufacturer}</td>
                            <td>{row.display.voltage}</td>
                            <td>{row.display.current}</td>
                            <td>{row.display.wiresElements}</td>
                            <td>{row.display.accuracyClass}</td>
                            <td>{row.display.constant}</td>
                            <td>
                              {!row.valid
                                ? row.error || 'Inválido'
                                : row.duplicate
                                  ? 'Repetido'
                                  : 'OK'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
                (isPassivoMass
                  ? !pasteText.trim()
                  : !name.trim() || !manufacturer.trim())
              }
            >
              {creating
                ? 'Salvando…'
                : formMode === 'passivo'
                  ? isPassivoMass
                    ? 'Cadastrar em massa'
                    : 'Salvar passivo'
                  : 'Salvar modelo'}
            </button>
          </div>

          {formMode === 'passivo' && results.length ? (
            <div className="entrada-table-wrap full-width modelo-passivo-table-wrap">
              <p className="field-hint">
                Resultado do cadastro · {results.length} registro(s)
              </p>
              <table className="data-table">
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10}>Nenhum modelo de medidor cadastrado ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
