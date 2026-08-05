import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
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

export const meterModelRoutes = {
  list: [requireAuth, listMeterModels],
  create: [requireAuth, createMeterModel],
}
