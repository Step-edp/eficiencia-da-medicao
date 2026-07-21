import type { Request, Response } from 'express'
import { query } from '../db.js'
import { normalizeCsdCities } from '../csd-cities.js'
import { writeAuditLog } from '../audit.js'

type CsdRow = {
  id: string
  name: string
  address: string
  cities: string[] | null
  responsible_user_id: string | null
  created_at: Date
  responsible_name: string | null
  responsible_registration: string | null
}

const CSD_SELECT = `
  SELECT c.id, c.name, c.address, c.cities, c.responsible_user_id, c.created_at,
         u.name AS responsible_name, u.registration AS responsible_registration
  FROM csds c
  LEFT JOIN users u ON u.id = c.responsible_user_id
`

function mapCsd(row: CsdRow) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    cities: normalizeCsdCities(row.cities ?? []),
    responsibleUserId: row.responsible_user_id,
    responsibleName: row.responsible_name,
    responsibleRegistration: row.responsible_registration,
    status: row.responsible_user_id ? ('ativa' as const) : ('pendente' as const),
    createdAt: row.created_at.toISOString(),
  }
}

function parseOptionalResponsibleId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

async function assertCsdResponsible(userId: string) {
  const responsible = await query<{ id: string }>(
    `SELECT id FROM users
     WHERE id = $1
       AND approval_status = 'approved'
       AND role <> 'admin'
       AND work_area = 'CSD'`,
    [userId],
  )

  return Boolean(responsible.rows[0])
}

export async function listCsds(_req: Request, res: Response) {
  const result = await query<CsdRow>(`${CSD_SELECT} ORDER BY c.name ASC`)
  res.json({ csds: result.rows.map(mapCsd) })
}

export async function createCsd(req: Request, res: Response) {
  const { name, address, cities } = req.body as {
    name?: string
    address?: string
    cities?: unknown
  }
  const responsibleUserId = parseOptionalResponsibleId(req.body?.responsibleUserId)

  const normalizedCities = normalizeCsdCities(cities)

  if (!name?.trim() || !address?.trim()) {
    res.status(400).json({ error: 'Nome e endereço são obrigatórios.' })
    return
  }

  if (normalizedCities.length === 0) {
    res.status(400).json({ error: 'Selecione ao menos uma cidade.' })
    return
  }

  if (responsibleUserId) {
    const valid = await assertCsdResponsible(responsibleUserId)
    if (!valid) {
      res.status(400).json({
        error: 'Responsável inválido. Selecione um usuário com perfil de CSD.',
      })
      return
    }
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
        responsibleUserId,
      ],
    )
    const csd = mapCsd(insert.rows[0])

    await writeAuditLog(req, {
      action: 'create',
      entityType: 'csd',
      entityId: csd.id,
      summary: responsibleUserId
        ? `CSD ${csd.name}`
        : `CSD ${csd.name} criado como pendente (sem responsável)`,
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

export async function updateCsd(req: Request, res: Response) {
  const { id } = req.params
  const hasResponsible = Object.prototype.hasOwnProperty.call(
    req.body ?? {},
    'responsibleUserId',
  )
  const hasCities = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'cities')

  if (!hasResponsible && !hasCities) {
    res.status(400).json({ error: 'Nada para atualizar.' })
    return
  }

  const existing = await query<CsdRow>(`${CSD_SELECT} WHERE c.id = $1`, [id])

  if (!existing.rows[0]) {
    res.status(404).json({ error: 'CSD não encontrado.' })
    return
  }

  let responsibleUserId = existing.rows[0].responsible_user_id
  let cities = normalizeCsdCities(existing.rows[0].cities ?? [])

  if (hasResponsible) {
    responsibleUserId = parseOptionalResponsibleId(req.body.responsibleUserId)
    if (responsibleUserId) {
      const valid = await assertCsdResponsible(responsibleUserId)
      if (!valid) {
        res.status(400).json({
          error: 'Responsável inválido. Selecione um usuário com perfil de CSD.',
        })
        return
      }
    }
  }

  if (hasCities) {
    cities = normalizeCsdCities(req.body.cities)
    if (cities.length === 0) {
      res.status(400).json({ error: 'Selecione ao menos uma cidade.' })
      return
    }

    const conflicts = await query<{ city: string; csd_name: string }>(
      `SELECT city.value AS city, c.name AS csd_name
       FROM csds c
       CROSS JOIN LATERAL jsonb_array_elements_text(c.cities) AS city(value)
       WHERE city.value = ANY($1::text[])
         AND c.id <> $2`,
      [cities, id],
    )

    if (conflicts.rows[0]) {
      res.status(409).json({
        error: `A cidade ${conflicts.rows[0].city} já está vinculada ao CSD ${conflicts.rows[0].csd_name}.`,
      })
      return
    }
  }

  const updated = await query<CsdRow>(
    `UPDATE csds
     SET responsible_user_id = $2,
         cities = $3::jsonb
     WHERE id = $1
     RETURNING id, name, address, cities, responsible_user_id, created_at,
               (SELECT name FROM users WHERE id = $2) AS responsible_name,
               (SELECT registration FROM users WHERE id = $2) AS responsible_registration`,
    [id, responsibleUserId, JSON.stringify(cities)],
  )

  const previous = mapCsd(existing.rows[0])
  const csd = mapCsd(updated.rows[0])

  const summaryParts: string[] = []
  if (hasCities) summaryParts.push('cidades')
  if (hasResponsible) {
    summaryParts.push(
      responsibleUserId ? 'responsável' : 'responsável removido (pendente)',
    )
  }

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'csd',
    entityId: csd.id,
    summary: `CSD ${csd.name}: ${summaryParts.join(' e ')} atualizado(s)`,
    oldData: previous,
    newData: csd,
  })

  res.json({ csd })
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
       AND role <> 'admin'
       AND work_area = 'CSD'
     ORDER BY name ASC`,
  )
  res.json({ users: result.rows })
}

export async function deleteCsd(req: Request, res: Response) {
  const { id } = req.params

  const existing = await query<CsdRow>(`${CSD_SELECT} WHERE c.id = $1`, [id])

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
