import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'

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

export async function listMaterials(_req: Request, res: Response) {
  const result = await query<MaterialRow>(
    'SELECT * FROM materials ORDER BY id DESC',
  )
  res.json({ materials: result.rows.map(mapMaterial) })
}

export async function createMaterial(req: Request, res: Response) {
  const { material, oldCode, newCode, description, manufacturer, prefix, equipmentType } =
    req.body as Record<string, string | undefined>

  if (!material?.trim() || !oldCode?.trim() || !description?.trim() || !equipmentType?.trim()) {
    res.status(400).json({ error: 'Preencha todos os campos do material antes de salvar.' })
    return
  }

  if (!/^\d{8}$/.test(material.trim())) {
    res.status(400).json({ error: 'O código do material deve ter exatamente 8 números.' })
    return
  }

  const result = await query<MaterialRow>(
    `INSERT INTO materials (material, old_code, new_code, description, manufacturer, prefix, equipment_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      material.trim(),
      oldCode.trim(),
      newCode?.trim() ?? '',
      description.trim(),
      manufacturer?.trim() ?? '',
      prefix?.trim() ?? '',
      equipmentType.trim(),
    ],
  )

  res.status(201).json({ material: mapMaterial(result.rows[0]) })
}

export const materialRoutes = {
  list: [requireAuth, listMaterials],
  create: [requireAuth, createMaterial],
}
