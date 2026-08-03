import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth, requireAdmin } from '../auth.js'
import { writeAuditLog } from '../audit.js'

type MaterialRow = {
  id: number
  material: string
  old_code: string
  new_code: string
  description: string
  manufacturer: string
  prefix: string
  equipment_type: string
}

function mapMaterial(row: MaterialRow) {
  return {
    id: row.id,
    material: row.material,
    oldCode: row.old_code,
    newCode: row.new_code,
    description: row.description,
    manufacturer: row.manufacturer,
    prefix: row.prefix,
    equipmentType: row.equipment_type,
  }
}

async function descriptionAlreadyExists(description: string, excludeId?: number) {
  const result = await query<{ id: number }>(
    `SELECT id
     FROM materials
     WHERE lower(btrim(description)) = lower(btrim($1))
       AND ($2::int IS NULL OR id <> $2)
     LIMIT 1`,
    [description, excludeId ?? null],
  )
  return Boolean(result.rows[0])
}

function parseMaterialPayload(body: Record<string, string | undefined>) {
  const material = body.material?.trim() ?? ''
  const oldCode = body.oldCode?.trim() ?? ''
  const newCode = body.newCode?.trim() ?? ''
  const description = body.description?.trim() ?? ''
  const manufacturer = body.manufacturer?.trim() ?? ''
  const prefix = body.prefix?.trim() ?? ''
  const equipmentType = body.equipmentType?.trim() ?? ''

  if (!material || !oldCode || !description || !equipmentType) {
    return { error: 'Preencha todos os campos do material antes de salvar.' as const }
  }
  if (!/^\d{8}$/.test(material)) {
    return { error: 'O código do material deve ter exatamente 8 números.' as const }
  }

  return {
    material,
    oldCode,
    newCode,
    description,
    manufacturer,
    prefix,
    equipmentType,
  }
}

export async function listMaterials(_req: Request, res: Response) {
  const result = await query<MaterialRow>(
    'SELECT * FROM materials ORDER BY id DESC',
  )
  res.json({ materials: result.rows.map(mapMaterial) })
}

export async function createMaterial(req: Request, res: Response) {
  const parsed = parseMaterialPayload(req.body as Record<string, string | undefined>)
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }

  if (await descriptionAlreadyExists(parsed.description)) {
    res.status(409).json({
      error: 'Já existe um material com essa descrição. A descrição deve ser única.',
    })
    return
  }

  const result = await query<MaterialRow>(
    `INSERT INTO materials (material, old_code, new_code, description, manufacturer, prefix, equipment_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      parsed.material,
      parsed.oldCode,
      parsed.newCode,
      parsed.description,
      parsed.manufacturer,
      parsed.prefix,
      parsed.equipmentType,
    ],
  )

  const createdMaterial = mapMaterial(result.rows[0])

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'material',
    entityId: String(createdMaterial.id),
    summary: `Material ${createdMaterial.material}`,
    newData: createdMaterial,
  })

  res.status(201).json({ material: createdMaterial })
}

export async function updateMaterial(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Identificador do material inválido.' })
    return
  }

  const parsed = parseMaterialPayload(req.body as Record<string, string | undefined>)
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }

  const previous = await query<MaterialRow>(
    'SELECT * FROM materials WHERE id = $1',
    [id],
  )
  if (!previous.rows[0]) {
    res.status(404).json({ error: 'Material não encontrado.' })
    return
  }

  if (await descriptionAlreadyExists(parsed.description, id)) {
    res.status(409).json({
      error: 'Já existe um material com essa descrição. A descrição deve ser única.',
    })
    return
  }

  const result = await query<MaterialRow>(
    `UPDATE materials
     SET material = $1,
         old_code = $2,
         new_code = $3,
         description = $4,
         manufacturer = $5,
         prefix = $6,
         equipment_type = $7
     WHERE id = $8
     RETURNING *`,
    [
      parsed.material,
      parsed.oldCode,
      parsed.newCode,
      parsed.description,
      parsed.manufacturer,
      parsed.prefix,
      parsed.equipmentType,
      id,
    ],
  )

  const updatedMaterial = mapMaterial(result.rows[0])

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'material',
    entityId: String(updatedMaterial.id),
    summary: `Material ${updatedMaterial.material} atualizado`,
    oldData: mapMaterial(previous.rows[0]),
    newData: updatedMaterial,
  })

  res.json({ material: updatedMaterial })
}

export const materialRoutes = {
  list: [requireAuth, listMaterials],
  create: [requireAuth, createMaterial],
  update: [requireAuth, requireAdmin, updateMaterial],
}
