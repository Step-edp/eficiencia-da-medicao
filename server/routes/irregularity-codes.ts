import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { writeAuditLog } from '../audit.js'

type IrregularityCodeRow = {
  id: number
  code: string
  description: string
  created_at: Date
  updated_at: Date
}

function mapCode(row: IrregularityCodeRow) {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

function normalizeCode(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
}

function normalizeDescription(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export async function listIrregularityCodes(_req: Request, res: Response) {
  const result = await query<IrregularityCodeRow>(
    `SELECT id, code, description, created_at, updated_at
     FROM irregularity_codes
     ORDER BY code ASC`,
  )
  res.json({ codes: result.rows.map(mapCode) })
}

export async function createIrregularityCode(req: Request, res: Response) {
  const code = normalizeCode(req.body?.code)
  const description = normalizeDescription(req.body?.description)

  if (!code) {
    res.status(400).json({ error: 'Informe o código de irregularidade.' })
    return
  }
  if (!description) {
    res.status(400).json({ error: 'Informe a descrição da irregularidade.' })
    return
  }

  try {
    const insert = await query<IrregularityCodeRow>(
      `INSERT INTO irregularity_codes (code, description)
       VALUES ($1, $2)
       RETURNING id, code, description, created_at, updated_at`,
      [code, description],
    )
    const created = mapCode(insert.rows[0])
    await writeAuditLog(req, {
      action: 'create',
      entityType: 'irregularity_code',
      entityId: String(created.id),
      summary: `Cadastrou o código de irregularidade ${created.code}.`,
      newData: created,
    })
    res.status(201).json({ code: created })
  } catch (error) {
    const duplicate =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    res.status(duplicate ? 409 : 500).json({
      error: duplicate
        ? `O código ${code} já está cadastrado.`
        : 'Não foi possível cadastrar o código de irregularidade.',
    })
  }
}

export async function updateIrregularityCode(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Código inválido.' })
    return
  }

  const code = normalizeCode(req.body?.code)
  const description = normalizeDescription(req.body?.description)

  if (!code) {
    res.status(400).json({ error: 'Informe o código de irregularidade.' })
    return
  }
  if (!description) {
    res.status(400).json({ error: 'Informe a descrição da irregularidade.' })
    return
  }

  const existing = await query<IrregularityCodeRow>(
    `SELECT id, code, description, created_at, updated_at
     FROM irregularity_codes WHERE id = $1`,
    [id],
  )
  if (!existing.rows[0]) {
    res.status(404).json({ error: 'Código de irregularidade não encontrado.' })
    return
  }

  try {
    const update = await query<IrregularityCodeRow>(
      `UPDATE irregularity_codes
       SET code = $2, description = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING id, code, description, created_at, updated_at`,
      [id, code, description],
    )
    const next = mapCode(update.rows[0])
    await writeAuditLog(req, {
      action: 'update',
      entityType: 'irregularity_code',
      entityId: String(id),
      summary: `Atualizou o código de irregularidade ${next.code}.`,
      oldData: mapCode(existing.rows[0]),
      newData: next,
    })
    res.json({ code: next })
  } catch (error) {
    const duplicate =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    res.status(duplicate ? 409 : 500).json({
      error: duplicate
        ? `O código ${code} já está cadastrado.`
        : 'Não foi possível atualizar o código de irregularidade.',
    })
  }
}

export async function deleteIrregularityCode(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Código inválido.' })
    return
  }

  const existing = await query<IrregularityCodeRow>(
    `SELECT id, code, description, created_at, updated_at
     FROM irregularity_codes WHERE id = $1`,
    [id],
  )
  if (!existing.rows[0]) {
    res.status(404).json({ error: 'Código de irregularidade não encontrado.' })
    return
  }

  await query(`DELETE FROM irregularity_codes WHERE id = $1`, [id])
  await writeAuditLog(req, {
    action: 'delete',
    entityType: 'irregularity_code',
    entityId: String(id),
    summary: `Excluiu o código de irregularidade ${existing.rows[0].code}.`,
    oldData: mapCode(existing.rows[0]),
  })
  res.json({ ok: true, id })
}

export const irregularityCodeRoutes = {
  list: [requireAuth, listIrregularityCodes],
}
