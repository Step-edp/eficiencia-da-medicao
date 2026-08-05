import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth, requireAdmin } from '../auth.js'
import { writeAuditLog } from '../audit.js'

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
    .map((value) => value.trim().toLowerCase())
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

  const results: Array<{
    name: string
    manufacturer: string
    status: 'created' | 'duplicate' | 'invalid'
    error?: string
  }> = []
  const newModels: ReturnType<typeof mapMeterModel>[] = []
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

    if (!name || !rowManufacturer || !rowMeterType) {
      results.push({
        name: name || '—',
        manufacturer: rowManufacturer || '—',
        status: 'invalid',
        error: 'Modelo, fabricante e tipo são obrigatórios.',
      })
      continue
    }

    const key = duplicateKey({
      name,
      manufacturer: rowManufacturer,
      meterType: rowMeterType,
      voltage,
      current,
      wiresElements,
      accuracyClass,
      constant,
    })

    if (existingKeys.has(key) || processed.has(key)) {
      results.push({
        name,
        manufacturer: rowManufacturer,
        status: 'duplicate',
        error: 'Esse modelo já está cadastrado com os mesmos dados.',
      })
      continue
    }

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
        name,
        rowManufacturer,
        rowMeterType,
        String(item?.description ?? '').trim(),
        voltage,
        current,
        wiresElements,
        accuracyClass,
        constant,
        req.user?.id ?? null,
      ],
    )

    const created = mapMeterModel({
      ...result.rows[0],
      created_by_name: '',
      created_by_registration: req.user?.registration ?? '',
    })

    processed.add(key)
    existingKeys.add(key)
    newModels.push(created)
    results.push({ name, manufacturer: rowManufacturer, status: 'created' })
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
