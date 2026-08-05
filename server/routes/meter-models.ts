import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth, requireAdmin } from '../auth.js'
import { writeAuditLog } from '../audit.js'

const METER_TYPE_OPTIONS = ['Eletrônico', 'Eletromecânico']
const VOLTAGE_OPTIONS = [
  '240V',
  '120V',
  '230V',
  'Min. 120V (•) Máx. 240V',
]
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

type MeterModelRow = {
  id: number
  name: string
  manufacturer: string
  meter_type: string
  description: string
  voltage: string
  current_rating: string
  wires_elements: string
  accuracy_class: string
  meter_constant: string
  source: string
  created_at: Date
  created_by_user_id: string | null
  created_by_name: string | null
  created_by_registration: string | null
}

type MeterModelInput = {
  name?: string
  manufacturer?: string
  meterType?: string
  description?: string
  voltage?: string
  current?: string
  wiresElements?: string
  accuracyClass?: string
  constant?: string
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
  const legacyLabels = [
    '240V • 120V',
    '240V 120V',
    '240V-120V',
    '240V bolinha 120V',
    '120V • 240V',
    '120V 240V',
    'Min. 120V (Bolinha) Máx. 240V',
    'Min. 120V Bolinha Máx. 240V',
  ]
  if (legacyLabels.some((label) => normalizeOptionValue(label) === normalized)) {
    return 'Min. 120V (•) Máx. 240V'
  }
  if (normalized.includes('bolinha') && normalized.includes('120') && normalized.includes('240')) {
    return 'Min. 120V (•) Máx. 240V'
  }
  if (
    normalized.includes('120') &&
    normalized.includes('240') &&
    (normalized.includes('min') || normalized.includes('max'))
  ) {
    return 'Min. 120V (•) Máx. 240V'
  }
  return null
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

function validatePassiveModelFields(fields: {
  name: string
  manufacturer: string
  meterType: string
  voltage: string
  current: string
  wiresElements: string
  accuracyClass: string
  constant: string
}): { ok: true; values: typeof fields } | { ok: false; error: string } {
  if (!fields.name) {
    return { ok: false, error: 'Modelo é obrigatório.' }
  }

  const manufacturer = matchOption(fields.manufacturer, MANUFACTURER_OPTIONS)
  if (!manufacturer) {
    return {
      ok: false,
      error: fields.manufacturer
        ? `Fabricante inválido: ${fields.manufacturer}`
        : 'Fabricante é obrigatório.',
    }
  }

  const meterTypeRaw = parseMeterTypeLabel(fields.meterType) || fields.meterType
  const meterType = matchOption(meterTypeRaw, METER_TYPE_OPTIONS)
  if (!meterType) {
    return {
      ok: false,
      error: fields.meterType
        ? `Tipo inválido: ${fields.meterType}`
        : 'Tipo é obrigatório.',
    }
  }

  let voltage = ''
  if (fields.voltage) {
    const matched = matchVoltageOption(fields.voltage)
    if (!matched) {
      return { ok: false, error: `Tensão inválida: ${fields.voltage}` }
    }
    voltage = matched
  }

  let current = ''
  if (fields.current) {
    const matched = matchOption(fields.current, CURRENT_OPTIONS)
    if (!matched) {
      return { ok: false, error: `Corrente inválida: ${fields.current}` }
    }
    current = matched
  }

  let wiresElements = ''
  if (fields.wiresElements) {
    const matched = matchOption(fields.wiresElements, WIRES_ELEMENTS_OPTIONS)
    if (!matched) {
      return { ok: false, error: `Fios • Elementos inválido: ${fields.wiresElements}` }
    }
    wiresElements = matched
  }

  let accuracyClass = ''
  if (fields.accuracyClass) {
    const matched = matchOption(fields.accuracyClass, CLASS_OPTIONS)
    if (!matched) {
      return { ok: false, error: `Classe inválida: ${fields.accuracyClass}` }
    }
    accuracyClass = matched
  }

  let constant = ''
  if (fields.constant) {
    const matched = matchOption(fields.constant, CONSTANT_OPTIONS)
    if (!matched) {
      return { ok: false, error: `Constante inválida: ${fields.constant}` }
    }
    constant = matched
  }

  return {
    ok: true,
    values: {
      name: fields.name,
      manufacturer,
      meterType,
      voltage,
      current,
      wiresElements,
      accuracyClass,
      constant,
    },
  }
}

function mapMeterModel(row: MeterModelRow) {
  return {
    id: row.id,
    name: row.name,
    manufacturer: row.manufacturer,
    meterType: row.meter_type,
    description: row.description,
    voltage: row.voltage ?? '',
    current: row.current_rating ?? '',
    wiresElements: row.wires_elements ?? '',
    accuracyClass: row.accuracy_class ?? '',
    constant: row.meter_constant ?? '',
    source: row.source === 'passivo' ? 'passivo' : 'cadastrado',
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name || '',
    createdByRegistration: row.created_by_registration || '',
  }
}

function duplicateKey(parts: {
  name: string
  manufacturer: string
  meterType: string
  voltage: string
  current: string
  wiresElements: string
  accuracyClass: string
  constant: string
}) {
  return [
    parts.name,
    parts.manufacturer,
    parts.meterType,
    parts.voltage,
    parts.current,
    parts.wiresElements,
    parts.accuracyClass,
    parts.constant,
  ]
    .map((value) => normalizeOptionValue(value))
    .join('|')
}

export async function listMeterModels(_req: Request, res: Response) {
  const result = await query<MeterModelRow>(
    `SELECT m.*,
            u.name AS created_by_name,
            u.registration AS created_by_registration
     FROM meter_models m
     LEFT JOIN users u ON u.id = m.created_by_user_id
     ORDER BY m.created_at DESC, m.id DESC`,
  )
  res.json({ models: result.rows.map(mapMeterModel) })
}

export async function createMeterModel(req: Request, res: Response) {
  const {
    name,
    manufacturer,
    meterType,
    description,
    voltage,
    current,
    wiresElements,
    accuracyClass,
    constant,
    source,
  } = req.body as Record<string, string | undefined>

  if (!name?.trim() || !manufacturer?.trim() || !meterType?.trim()) {
    res.status(400).json({
      error: 'Informe modelo, fabricante e tipo do medidor.',
    })
    return
  }

  const normalizedSource = source === 'passivo' ? 'passivo' : 'cadastrado'
  if (normalizedSource === 'passivo' && req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Apenas o administrador pode adicionar modelo passivo.' })
    return
  }

  const result = await query<Omit<MeterModelRow, 'created_by_name' | 'created_by_registration'>>(
    `INSERT INTO meter_models (
       name, manufacturer, meter_type, description,
       voltage, current_rating, wires_elements, accuracy_class, meter_constant,
       source, created_by_user_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      name.trim(),
      manufacturer.trim(),
      meterType.trim(),
      description?.trim() ?? '',
      voltage?.trim() ?? '',
      current?.trim() ?? '',
      wiresElements?.trim() ?? '',
      accuracyClass?.trim() ?? '',
      constant?.trim() ?? '',
      normalizedSource,
      req.user?.id ?? null,
    ],
  )

  const created = {
    ...mapMeterModel({
      ...result.rows[0],
      created_by_name: '',
      created_by_registration: req.user?.registration ?? '',
    }),
  }

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'meter_model',
    entityId: String(created.id),
    summary:
      normalizedSource === 'passivo'
        ? `Modelo passivo de medidor ${created.name}`
        : `Modelo de medidor ${created.name}`,
    newData: created,
  })

  res.status(201).json({ model: created })
}

/** Cadastro individual/em massa de modelos passivos — exclusivo do administrador. */
export async function createPassiveMeterModels(req: Request, res: Response) {
  const { records, manufacturer, meterType } = req.body as {
    records?: MeterModelInput[]
    manufacturer?: string
    meterType?: string
  }

  const items = Array.isArray(records) ? records : []
  if (!items.length) {
    res.status(400).json({ error: 'Informe ao menos um modelo passivo.' })
    return
  }
  if (items.length > 5000) {
    res.status(400).json({ error: 'Limite de 5000 registros por importação.' })
    return
  }

  const defaultManufacturer = String(manufacturer ?? '').trim()
  const defaultMeterType = String(meterType ?? '').trim()

  const existing = await query<{
    name: string
    manufacturer: string
    meter_type: string
    voltage: string
    current_rating: string
    wires_elements: string
    accuracy_class: string
    meter_constant: string
  }>(
    `SELECT name, manufacturer, meter_type, voltage, current_rating,
            wires_elements, accuracy_class, meter_constant
     FROM meter_models`,
  )
  const existingKeys = new Set(
    existing.rows.map((row) =>
      duplicateKey({
        name: row.name,
        manufacturer: row.manufacturer,
        meterType: row.meter_type,
        voltage: row.voltage ?? '',
        current: row.current_rating ?? '',
        wiresElements: row.wires_elements ?? '',
        accuracyClass: row.accuracy_class ?? '',
        constant: row.meter_constant ?? '',
      }),
    ),
  )

  type PreparedRow =
    | {
        status: 'invalid' | 'duplicate'
        name: string
        manufacturer: string
        meterType: string
        voltage: string
        current: string
        wiresElements: string
        accuracyClass: string
        constant: string
        error: string
      }
    | {
        status: 'ready'
        name: string
        manufacturer: string
        meterType: string
        voltage: string
        current: string
        wiresElements: string
        accuracyClass: string
        constant: string
        description: string
        key: string
      }

  const prepared: PreparedRow[] = []
  const processed = new Set<string>()

  for (const item of items) {
    const name = String(item?.name ?? '').trim()
    const rowManufacturer =
      String(item?.manufacturer ?? '').trim() || defaultManufacturer
    const rowMeterType = String(item?.meterType ?? '').trim() || defaultMeterType
    const voltage = String(item?.voltage ?? '').trim()
    const current = String(item?.current ?? '').trim()
    const wiresElements = String(item?.wiresElements ?? '').trim()
    const accuracyClass = String(item?.accuracyClass ?? '').trim()
    const constant = String(item?.constant ?? '').trim()

    const validated = validatePassiveModelFields({
      name,
      manufacturer: rowManufacturer,
      meterType: rowMeterType,
      voltage,
      current,
      wiresElements,
      accuracyClass,
      constant,
    })

    if (!validated.ok) {
      prepared.push({
        status: 'invalid',
        name: name || '—',
        manufacturer: rowManufacturer || '—',
        meterType: rowMeterType || '—',
        voltage: voltage || '—',
        current: current || '—',
        wiresElements: wiresElements || '—',
        accuracyClass: accuracyClass || '—',
        constant: constant || '—',
        error: validated.error,
      })
      continue
    }

    const values = validated.values
    const key = duplicateKey(values)

    if (existingKeys.has(key) || processed.has(key)) {
      prepared.push({
        status: 'duplicate',
        name: values.name,
        manufacturer: values.manufacturer,
        meterType: values.meterType,
        voltage: values.voltage || '—',
        current: values.current || '—',
        wiresElements: values.wiresElements || '—',
        accuracyClass: values.accuracyClass || '—',
        constant: values.constant || '—',
        error: 'Repetido: já existe modelo com exatamente as mesmas características.',
      })
      continue
    }

    processed.add(key)
    prepared.push({
      status: 'ready',
      ...values,
      description: String(item?.description ?? '').trim(),
      key,
    })
  }

  const invalidCount = prepared.filter((row) => row.status === 'invalid').length
  const duplicateCount = prepared.filter((row) => row.status === 'duplicate').length

  const results: Array<{
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
  }> = prepared
    .filter((row) => row.status !== 'ready')
    .map((row) => ({
      name: row.name,
      manufacturer: row.manufacturer,
      meterType: row.meterType,
      voltage: row.voltage,
      current: row.current,
      wiresElements: row.wiresElements,
      accuracyClass: row.accuracyClass,
      constant: row.constant,
      status: row.status,
      error: row.error,
    }))
  const newModels: ReturnType<typeof mapMeterModel>[] = []

  for (const row of prepared) {
    if (row.status !== 'ready') continue

    const result = await query<
      Omit<MeterModelRow, 'created_by_name' | 'created_by_registration'>
    >(
      `INSERT INTO meter_models (
         name, manufacturer, meter_type, description,
         voltage, current_rating, wires_elements, accuracy_class, meter_constant,
         source, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'passivo', $10)
       RETURNING *`,
      [
        row.name,
        row.manufacturer,
        row.meterType,
        row.description,
        row.voltage,
        row.current,
        row.wiresElements,
        row.accuracyClass,
        row.constant,
        req.user?.id ?? null,
      ],
    )

    const created = mapMeterModel({
      ...result.rows[0],
      created_by_name: '',
      created_by_registration: req.user?.registration ?? '',
    })

    existingKeys.add(row.key)
    newModels.push(created)
    results.push({
      name: row.name,
      manufacturer: row.manufacturer,
      meterType: row.meterType,
      voltage: row.voltage || '—',
      current: row.current || '—',
      wiresElements: row.wiresElements || '—',
      accuracyClass: row.accuracyClass || '—',
      constant: row.constant || '—',
      status: 'created',
    })
  }

  if (newModels.length) {
    await writeAuditLog(req, {
      action: 'create',
      entityType: 'meter_model',
      summary: `${newModels.length} modelo(s) passivo(s) cadastrado(s)`,
      newData: {
        names: newModels.map((model) => model.name),
        createdCount: newModels.length,
        duplicateCount: results.filter((item) => item.status === 'duplicate').length,
        invalidCount: results.filter((item) => item.status === 'invalid').length,
      },
      metadata: { source: 'passivo' },
    })
  }

  res.status(201).json({
    results,
    models: newModels,
    createdCount: newModels.length,
    duplicateCount: results.filter((item) => item.status === 'duplicate').length,
    invalidCount: results.filter((item) => item.status === 'invalid').length,
  })
}

export const meterModelRoutes = {
  list: [requireAuth, listMeterModels],
  create: [requireAuth, createMeterModel],
  createPassive: [requireAuth, requireAdmin, createPassiveMeterModels],
}
