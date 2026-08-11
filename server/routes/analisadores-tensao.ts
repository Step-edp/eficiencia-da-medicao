import type { Request, Response } from 'express'
import { query } from '../db.js'
import { writeAuditLog } from '../audit.js'

type AnalisadorTensaoRow = {
  id: string
  equipment_number: string
  numero_serie: string
  modelo: string
  created_by_user_id: string | null
  created_by_name: string | null
  created_by_registration: string | null
  created_at: Date
}

function mapAnalisador(row: AnalisadorTensaoRow) {
  return {
    id: row.id,
    equipmentNumber: row.equipment_number,
    numeroSerie: row.numero_serie,
    modelo: row.modelo,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    createdByRegistration: row.created_by_registration,
    createdAt: row.created_at.toISOString(),
  }
}

async function nextEquipmentNumber() {
  const result = await query<{ n: string }>(
    `SELECT nextval('analisador_tensao_seq')::text AS n`,
  )
  return `AT-${String(result.rows[0].n).padStart(5, '0')}`
}

export async function listAnalisadoresTensao(_req: Request, res: Response) {
  const result = await query<AnalisadorTensaoRow>(
    `SELECT a.*,
            u.name AS created_by_name,
            u.registration AS created_by_registration
     FROM analisadores_tensao a
     LEFT JOIN users u ON u.id = a.created_by_user_id
     ORDER BY a.created_at DESC`,
  )
  res.json({ analisadores: result.rows.map(mapAnalisador) })
}

export async function createAnalisadorTensao(req: Request, res: Response) {
  const user = req.user
  if (!user) {
    res.status(401).json({ error: 'Não autenticado.' })
    return
  }

  const numeroSerie =
    typeof req.body?.numeroSerie === 'string' ? req.body.numeroSerie.trim() : ''
  const modelo = typeof req.body?.modelo === 'string' ? req.body.modelo.trim() : ''

  if (!numeroSerie || !modelo) {
    res.status(400).json({ error: 'Informe número de série e modelo.' })
    return
  }

  const id = `at-${Date.now()}`
  const equipmentNumber = await nextEquipmentNumber()

  const insert = await query<
    Omit<AnalisadorTensaoRow, 'created_by_name' | 'created_by_registration'>
  >(
    `INSERT INTO analisadores_tensao (id, equipment_number, numero_serie, modelo, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, equipmentNumber, numeroSerie, modelo, user.id],
  )

  const analisador = mapAnalisador({
    ...insert.rows[0],
    created_by_name: null,
    created_by_registration: user.registration,
  })

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'analisador_tensao',
    entityId: analisador.id,
    summary: `Analisador de tensão ${analisador.equipmentNumber} cadastrado`,
    newData: analisador,
  })

  res.status(201).json({ analisador })
}
