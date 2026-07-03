import type { Request, Response } from 'express'
import { query } from '../db.js'
import { normalizeCsdCities } from '../csd-cities.js'
import { writeAuditLog } from '../audit.js'

type CsdRow = {
  id: string
  name: string
  address: string
  cities: string[] | null
  responsible_user_id: string
  created_at: Date
  responsible_name: string
  responsible_registration: string
}

function mapCsd(row: CsdRow) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    cities: normalizeCsdCities(row.cities ?? []),
    responsibleUserId: row.responsible_user_id,
    responsibleName: row.responsible_name,
    responsibleRegistration: row.responsible_registration,
    createdAt: row.created_at.toISOString(),
  }
}

export async function listCsds(_req: Request, res: Response) {
  const result = await query<CsdRow>(
    `SELECT c.id, c.name, c.address, c.cities, c.responsible_user_id, c.created_at,
            u.name AS responsible_name, u.registration AS responsible_registration
     FROM csds c
     JOIN users u ON u.id = c.responsible_user_id
     ORDER BY c.name ASC`,
  )
  res.json({ csds: result.rows.map(mapCsd) })
}

export async function createCsd(req: Request, res: Response) {
  const { name, address, responsibleUserId, cities } = req.body as {
    name?: string
    address?: string
    responsibleUserId?: string
    cities?: unknown
  }

  const normalizedCities = normalizeCsdCities(cities)

  if (!name?.trim() || !address?.trim() || !responsibleUserId?.trim()) {
    res.status(400).json({ error: 'Nome, endereço e responsável são obrigatórios.' })
    return
  }

  if (normalizedCities.length === 0) {
    res.status(400).json({ error: 'Selecione ao menos uma cidade.' })
    return
  }

  const responsible = await query<{ id: string }>(
    `SELECT id FROM users
     WHERE id = $1
       AND approval_status = 'approved'
       AND work_area = 'Equipe de Campo'
       AND work_subtype = 'Inspeção'`,
    [responsibleUserId.trim()],
  )

  if (!responsible.rows[0]) {
    res.status(400).json({
      error: 'Responsável inválido. Selecione um inspetor da Equipe de Campo.',
    })
    return
  }

  const conflicts = await query<{ city: string; csd_name: string }>(
    `SELECT city.value AS city, c.name AS csd_name
     FROM csds c
     CROSS JOIN LATERAL jsonb_array_elements_text(c.cities) AS city(value)
     WHERE city.value = ANY($1::text[])`,
    [normalizedCities],
  )

  if (conflicts.rows[0]) {
    res.status(409).json({
      error: `A cidade ${conflicts.rows[0].city} já está vinculada ao CSD ${conflicts.rows[0].csd_name}.`,
    })
    return
  }

  const id = `csd-${Date.now()}`

  try {
    const insert = await query<CsdRow>(
      `INSERT INTO csds (id, name, address, cities, responsible_user_id)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id, name, address, cities, responsible_user_id, created_at,
                 (SELECT name FROM users WHERE id = $5) AS responsible_name,
                 (SELECT registration FROM users WHERE id = $5) AS responsible_registration`,
      [
        id,
        name.trim(),
        address.trim(),
        JSON.stringify(normalizedCities),
        responsibleUserId.trim(),
      ],
    )
    const csd = mapCsd(insert.rows[0])

    await writeAuditLog(req, {
      action: 'create',
      entityType: 'csd',
      entityId: csd.id,
      summary: `CSD ${csd.name}`,
      newData: csd,
    })

    res.status(201).json({ csd })
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '23505') {
      res.status(409).json({ error: 'Já existe um CSD com este nome.' })
      return
    }
    throw error
  }
}

export async function listInspectionUsers(_req: Request, res: Response) {
  const result = await query<{
    id: string
    name: string
    registration: string
  }>(
    `SELECT id, name, registration
     FROM users
     WHERE approval_status = 'approved'
       AND work_area = 'Equipe de Campo'
       AND work_subtype = 'Inspeção'
     ORDER BY name ASC`,
  )
  res.json({ users: result.rows })
}

export async function deleteCsd(req: Request, res: Response) {
  const { id } = req.params

  const existing = await query<CsdRow>(
    `SELECT c.id, c.name, c.address, c.cities, c.responsible_user_id, c.created_at,
            u.name AS responsible_name, u.registration AS responsible_registration
     FROM csds c
     JOIN users u ON u.id = c.responsible_user_id
     WHERE c.id = $1`,
    [id],
  )

  if (!existing.rows[0]) {
    res.status(404).json({ error: 'CSD não encontrado.' })
    return
  }

  const result = await query<{ id: string; name: string }>(
    `DELETE FROM csds WHERE id = $1 RETURNING id, name`,
    [id],
  )

  const removed = mapCsd(existing.rows[0])

  await writeAuditLog(req, {
    action: 'delete',
    entityType: 'csd',
    entityId: removed.id,
    summary: `CSD ${removed.name} excluído`,
    oldData: removed,
  })

  res.json({ ok: true, id: result.rows[0].id, name: result.rows[0].name })
}
