import type { Request, Response } from 'express'
import { query } from '../db.js'
import { writeAuditLog } from '../audit.js'

export type MemoriaMassaNotaStatus =
  | 'pendente'
  | 'executada'
  | 'conferida'
  | 'baixada'

type NotaRow = {
  id: number
  nota: string
  instalacao: string
  cliente: string
  observacao: string
  status: MemoriaMassaNotaStatus
  created_at: Date
  created_by_user_id: string | null
  created_by_name: string | null
  created_by_registration: string | null
  updated_at: Date
}

const VALID_STATUSES: MemoriaMassaNotaStatus[] = [
  'pendente',
  'executada',
  'conferida',
  'baixada',
]

function mapNota(row: NotaRow) {
  return {
    id: row.id,
    nota: row.nota,
    instalacao: row.instalacao || '',
    cliente: row.cliente || '',
    observacao: row.observacao || '',
    status: row.status,
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name || '',
    createdByRegistration: row.created_by_registration || '',
    updatedAt: row.updated_at.toISOString(),
  }
}

function normalizeNota(value: unknown): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .trim()
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
}

function isValidStatus(value: unknown): value is MemoriaMassaNotaStatus {
  return typeof value === 'string' && (VALID_STATUSES as string[]).includes(value)
}

export async function listMemoriaMassaNotas(req: Request, res: Response) {
  const statusRaw =
    typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : ''
  const search =
    typeof req.query.search === 'string' ? req.query.search.trim() : ''

  const params: unknown[] = []
  const filters: string[] = []

  if (statusRaw === 'pendente' || statusRaw === 'executada' || statusRaw === 'conferida' || statusRaw === 'baixada') {
    params.push(statusRaw)
    filters.push(`n.status = $${params.length}`)
  }

  if (search) {
    params.push(`%${search}%`)
    const idx = params.length
    filters.push(
      `(n.nota ILIKE $${idx} OR n.instalacao ILIKE $${idx} OR n.cliente ILIKE $${idx} OR n.observacao ILIKE $${idx})`,
    )
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''

  const result = await query<NotaRow>(
    `SELECT n.id, n.nota, n.instalacao, n.cliente, n.observacao, n.status,
            n.created_at, n.created_by_user_id, n.updated_at,
            u.name AS created_by_name, u.registration AS created_by_registration
     FROM memoria_massa_notas n
     LEFT JOIN users u ON u.id = n.created_by_user_id
     ${where}
     ORDER BY n.created_at DESC, n.id DESC`,
    params,
  )

  const counts = await query<{ status: string; total: string }>(
    `SELECT status, COUNT(*)::text AS total
     FROM memoria_massa_notas
     GROUP BY status`,
  )

  const byStatus: Record<string, number> = {
    pendente: 0,
    executada: 0,
    conferida: 0,
    baixada: 0,
  }
  for (const row of counts.rows) {
    byStatus[row.status] = Number(row.total)
  }

  res.json({
    notas: result.rows.map(mapNota),
    total: result.rowCount ?? 0,
    counts: byStatus,
  })
}

export async function createMemoriaMassaNotasBulk(req: Request, res: Response) {
  const body = req.body as {
    notas?: Array<{
      nota?: string
      instalacao?: string
      cliente?: string
      observacao?: string
    }>
  }

  const items = Array.isArray(body.notas) ? body.notas : []
  if (!items.length) {
    res.status(400).json({ error: 'Informe ao menos uma nota para cadastrar.' })
    return
  }

  if (items.length > 2000) {
    res.status(400).json({ error: 'Limite de 2000 notas por importação.' })
    return
  }

  const prepared: Array<{
    nota: string
    instalacao: string
    cliente: string
    observacao: string
  }> = []
  const errors: string[] = []

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const nota = normalizeNota(item?.nota)
    if (!nota) {
      errors.push(`Linha ${index + 1}: informe o número da nota.`)
      continue
    }
    if (nota.length < 5 || nota.length > 12) {
      errors.push(`Linha ${index + 1}: nota "${nota}" inválida (5 a 12 dígitos).`)
      continue
    }
    prepared.push({
      nota,
      instalacao: normalizeText(item?.instalacao),
      cliente: normalizeText(item?.cliente),
      observacao: normalizeText(item?.observacao),
    })
  }

  if (!prepared.length) {
    res.status(400).json({
      error: errors[0] ?? 'Nenhuma nota válida para cadastrar.',
      errors,
    })
    return
  }

  const inserted: ReturnType<typeof mapNota>[] = []
  const skippedDuplicates: string[] = []

  for (const item of prepared) {
    const existing = await query<{ id: number }>(
      `SELECT id FROM memoria_massa_notas
       WHERE nota = $1 AND status = 'pendente'
       LIMIT 1`,
      [item.nota],
    )
    if (existing.rows[0]) {
      skippedDuplicates.push(item.nota)
      continue
    }

    const result = await query<{
      id: number
      nota: string
      instalacao: string
      cliente: string
      observacao: string
      status: MemoriaMassaNotaStatus
      created_at: Date
      created_by_user_id: string | null
      updated_at: Date
    }>(
      `INSERT INTO memoria_massa_notas (
         nota, instalacao, cliente, observacao, status, created_by_user_id
       ) VALUES ($1,$2,$3,$4,'pendente',$5)
       RETURNING id, nota, instalacao, cliente, observacao, status,
                 created_at, created_by_user_id, updated_at`,
      [
        item.nota,
        item.instalacao,
        item.cliente,
        item.observacao,
        req.user?.id ?? null,
      ],
    )

    inserted.push(
      mapNota({
        ...result.rows[0],
        created_by_name: null,
        created_by_registration: req.user?.registration ?? null,
      }),
    )
  }

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'catalog_option',
    entityId: 'memoria_massa_notas',
    summary: `${inserted.length} nota(s) pendente(s) importada(s) na Memória de massa`,
    newData: {
      inserted: inserted.length,
      skippedDuplicates: skippedDuplicates.length,
      sample: inserted.slice(0, 10).map((item) => item.nota),
    },
    metadata: { process: 'memoria_massa_notas' },
  })

  res.status(201).json({
    notas: inserted,
    inserted: inserted.length,
    skippedDuplicates,
    errors,
  })
}

export async function updateMemoriaMassaNotaStatus(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Nota inválida.' })
    return
  }

  const { status } = req.body as { status?: string }
  if (!isValidStatus(status)) {
    res.status(400).json({ error: 'Status inválido.' })
    return
  }

  const result = await query<{
    id: number
    nota: string
    instalacao: string
    cliente: string
    observacao: string
    status: MemoriaMassaNotaStatus
    created_at: Date
    created_by_user_id: string | null
    updated_at: Date
  }>(
    `UPDATE memoria_massa_notas
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, nota, instalacao, cliente, observacao, status,
               created_at, created_by_user_id, updated_at`,
    [status, id],
  )

  const updated = result.rows[0]
  if (!updated) {
    res.status(404).json({ error: 'Nota não encontrada.' })
    return
  }

  const row: NotaRow = {
    ...updated,
    created_by_name: null,
    created_by_registration: null,
  }

  if (row.created_by_user_id) {
    const user = await query<{ name: string; registration: string }>(
      `SELECT name, registration FROM users WHERE id = $1`,
      [row.created_by_user_id],
    )
    row.created_by_name = user.rows[0]?.name ?? null
    row.created_by_registration = user.rows[0]?.registration ?? null
  }

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'catalog_option',
    entityId: String(row.id),
    summary: `Nota ${row.nota} movida para status "${status}" na Memória de massa`,
    newData: mapNota(row),
    metadata: { process: 'memoria_massa_notas', status },
  })

  res.json({ nota: mapNota(row) })
}

export async function deleteMemoriaMassaNota(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Nota inválida.' })
    return
  }

  const result = await query<{ id: number; nota: string }>(
    `DELETE FROM memoria_massa_notas WHERE id = $1 RETURNING id, nota`,
    [id],
  )
  const row = result.rows[0]
  if (!row) {
    res.status(404).json({ error: 'Nota não encontrada.' })
    return
  }

  await writeAuditLog(req, {
    action: 'delete',
    entityType: 'catalog_option',
    entityId: String(row.id),
    summary: `Nota ${row.nota} removida da Memória de massa`,
    oldData: row,
    metadata: { process: 'memoria_massa_notas' },
  })

  res.json({ ok: true, id: row.id, nota: row.nota })
}

export const memoriaMassaNotasRoutes = {
  list: listMemoriaMassaNotas,
  createBulk: createMemoriaMassaNotasBulk,
  updateStatus: updateMemoriaMassaNotaStatus,
  remove: deleteMemoriaMassaNota,
}
