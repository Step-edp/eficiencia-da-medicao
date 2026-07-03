import type { Request, Response } from 'express'
import { query } from '../db.js'

type CsdRow = {
  id: string
  name: string
  address: string
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
    responsibleUserId: row.responsible_user_id,
    responsibleName: row.responsible_name,
    responsibleRegistration: row.responsible_registration,
    createdAt: row.created_at.toISOString(),
  }
}

export async function listCsds(_req: Request, res: Response) {
  const result = await query<CsdRow>(
    `SELECT c.id, c.name, c.address, c.responsible_user_id, c.created_at,
            u.name AS responsible_name, u.registration AS responsible_registration
     FROM csds c
     JOIN users u ON u.id = c.responsible_user_id
     ORDER BY c.name ASC`,
  )
  res.json({ csds: result.rows.map(mapCsd) })
}

export async function createCsd(req: Request, res: Response) {
  const { name, address, responsibleUserId } = req.body as {
    name?: string
    address?: string
    responsibleUserId?: string
  }

  if (!name?.trim() || !address?.trim() || !responsibleUserId?.trim()) {
    res.status(400).json({ error: 'Nome, endereço e responsável são obrigatórios.' })
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

  const id = `csd-${Date.now()}`

  try {
    const insert = await query<CsdRow>(
      `INSERT INTO csds (id, name, address, responsible_user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, address, responsible_user_id, created_at,
                 (SELECT name FROM users WHERE id = $4) AS responsible_name,
                 (SELECT registration FROM users WHERE id = $4) AS responsible_registration`,
      [id, name.trim(), address.trim(), responsibleUserId.trim()],
    )
    res.status(201).json({ csd: mapCsd(insert.rows[0]) })
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
