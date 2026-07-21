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
  const { name, manufacturer, meterType, description } = req.body as Record<
    string,
    string | undefined
  >

  if (!name?.trim() || !manufacturer?.trim() || !meterType?.trim()) {
    res.status(400).json({
      error: 'Informe modelo, fabricante e tipo do medidor.',
    })
    return
  }

  const result = await query<Omit<MeterModelRow, 'created_by_name' | 'created_by_registration'>>(
    `INSERT INTO meter_models (name, manufacturer, meter_type, description, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      name.trim(),
      manufacturer.trim(),
      meterType.trim(),
      description?.trim() ?? '',
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
    summary: `Modelo de medidor ${created.name}`,
    newData: created,
  })

  res.status(201).json({ model: created })
}

export const meterModelRoutes = {
  list: [requireAuth, listMeterModels],
  create: [requireAuth, createMeterModel],
}
