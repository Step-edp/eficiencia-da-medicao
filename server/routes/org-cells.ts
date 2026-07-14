import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth, requireGestorOrAdmin } from '../auth.js'
import { writeAuditLog } from '../audit.js'

type OrgCellRow = {
  id: string
  area_id: string
  label: string
  description: string
  responsible_user_id: string | null
  responsible_name: string | null
  responsible_registration: string | null
  sort_order: number
  created_at: Date
  updated_at: Date
}

export type OrgCellView = {
  id: string
  areaId: string
  label: string
  description: string
  responsibleUserId: string | null
  responsibleName: string | null
  responsibleRegistration: string | null
  /** Sem responsável = pendente. */
  status: 'pendente' | 'ativa'
  sortOrder: number
  createdAt: string
  updatedAt: string
}

function toView(row: OrgCellRow): OrgCellView {
  return {
    id: row.id,
    areaId: row.area_id,
    label: row.label,
    description: row.description,
    responsibleUserId: row.responsible_user_id,
    responsibleName: row.responsible_name,
    responsibleRegistration: row.responsible_registration,
    status: row.responsible_user_id ? 'ativa' : 'pendente',
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

async function listCellRows() {
  const result = await query<OrgCellRow>(
    `SELECT c.id, c.area_id, c.label, c.description, c.responsible_user_id,
            u.name AS responsible_name, u.registration AS responsible_registration,
            c.sort_order, c.created_at, c.updated_at
     FROM org_cells c
     LEFT JOIN users u ON u.id = c.responsible_user_id
     ORDER BY c.sort_order ASC, c.label ASC`,
  )
  return result.rows
}

async function assertAssignableUser(userId: string): Promise<
  | { ok: true; user: { id: string; name: string } }
  | { ok: false; error: string; status: number }
> {
  const user = await query<{ id: string; approval_status: string; role: string; name: string }>(
    `SELECT id, approval_status, role, name FROM users WHERE id = $1`,
    [userId],
  )
  if (!user.rows[0]) {
    return { ok: false, error: 'Usuário não encontrado.', status: 404 }
  }
  if (user.rows[0].role === 'admin') {
    return {
      ok: false,
      error: 'O administrador não pode ser responsável de célula.',
      status: 400,
    }
  }
  if (user.rows[0].approval_status !== 'approved') {
    return {
      ok: false,
      error: 'Só é possível atribuir usuários aprovados.',
      status: 400,
    }
  }
  return { ok: true, user: user.rows[0] }
}

function normalizeLabel(raw: unknown) {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''
}

export async function listOrgCells(_req: Request, res: Response) {
  const rows = await listCellRows()
  res.json({ cells: rows.map(toView) })
}

export async function createOrgCell(req: Request, res: Response) {
  const label = normalizeLabel(req.body?.label)
  const description =
    typeof req.body?.description === 'string' ? req.body.description.trim() : ''
  const responsibleUserId =
    typeof req.body?.responsibleUserId === 'string' && req.body.responsibleUserId.trim()
      ? req.body.responsibleUserId.trim()
      : null

  if (!label) {
    res.status(400).json({ error: 'Informe o nome da célula.' })
    return
  }
  if (label.length > 80) {
    res.status(400).json({ error: 'O nome da célula deve ter no máximo 80 caracteres.' })
    return
  }

  if (responsibleUserId) {
    const check = await assertAssignableUser(responsibleUserId)
    if (!check.ok) {
      res.status(check.status).json({ error: check.error })
      return
    }
  }

  const existing = await query<{ id: string }>(
    `SELECT id FROM org_cells WHERE lower(id) = lower($1) OR lower(label) = lower($2)`,
    [label, label],
  )
  if (existing.rows[0]) {
    res.status(409).json({ error: 'Já existe uma célula com esse nome.' })
    return
  }

  const maxOrder = await query<{ max: number | null }>(
    `SELECT MAX(sort_order) AS max FROM org_cells WHERE area_id = 'Gestão'`,
  )
  const sortOrder = (maxOrder.rows[0]?.max ?? 0) + 1

  await query(
    `INSERT INTO org_cells (
       id, area_id, label, description, responsible_user_id, sort_order, created_by
     ) VALUES ($1, 'Gestão', $2, $3, $4, $5, $6)`,
    [label, label, description, responsibleUserId, sortOrder, req.user!.id],
  )

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'org_cell',
    entityId: label,
    summary: responsibleUserId
      ? `Célula "${label}" criada com responsável.`
      : `Célula "${label}" criada como pendente (sem responsável).`,
    newData: { label, description, responsibleUserId },
  })

  const rows = await listCellRows()
  const created = rows.find((row) => row.id === label)
  res.status(201).json({
    cell: created ? toView(created) : null,
    cells: rows.map(toView),
  })
}

export async function updateOrgCell(req: Request, res: Response) {
  const cellId = String(req.params.id ?? '').trim()
  if (!cellId) {
    res.status(400).json({ error: 'Identificador da célula inválido.' })
    return
  }

  const current = await query<OrgCellRow>(
    `SELECT c.id, c.area_id, c.label, c.description, c.responsible_user_id,
            u.name AS responsible_name, u.registration AS responsible_registration,
            c.sort_order, c.created_at, c.updated_at
     FROM org_cells c
     LEFT JOIN users u ON u.id = c.responsible_user_id
     WHERE c.id = $1`,
    [cellId],
  )
  if (!current.rows[0]) {
    res.status(404).json({ error: 'Célula não encontrada.' })
    return
  }

  const hasDescription = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'description')
  const hasResponsible = Object.prototype.hasOwnProperty.call(
    req.body ?? {},
    'responsibleUserId',
  )

  if (!hasDescription && !hasResponsible) {
    res.status(400).json({ error: 'Nenhuma alteração informada.' })
    return
  }

  let description = current.rows[0].description
  if (hasDescription) {
    description =
      typeof req.body.description === 'string' ? req.body.description.trim() : ''
  }

  let responsibleUserId = current.rows[0].responsible_user_id
  if (hasResponsible) {
    const raw = req.body.responsibleUserId
    responsibleUserId =
      typeof raw === 'string' && raw.trim() ? raw.trim() : null
    if (responsibleUserId) {
      const check = await assertAssignableUser(responsibleUserId)
      if (!check.ok) {
        res.status(check.status).json({ error: check.error })
        return
      }
    }
  }

  await query(
    `UPDATE org_cells
     SET description = $2,
         responsible_user_id = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [cellId, description, responsibleUserId],
  )

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'org_cell',
    entityId: cellId,
    summary: responsibleUserId
      ? `Responsável da célula "${cellId}" atualizado.`
      : `Célula "${cellId}" ficou pendente (sem responsável).`,
    oldData: {
      description: current.rows[0].description,
      responsibleUserId: current.rows[0].responsible_user_id,
    },
    newData: { description, responsibleUserId },
  })

  const rows = await listCellRows()
  const updated = rows.find((row) => row.id === cellId)
  res.json({
    cell: updated ? toView(updated) : null,
    cells: rows.map(toView),
  })
}

export const orgCellRoutes = {
  list: [requireAuth, listOrgCells],
  create: [requireAuth, requireGestorOrAdmin, createOrgCell],
  update: [requireAuth, requireGestorOrAdmin, updateOrgCell],
}

const DEFAULT_ORG_CELLS = [
  {
    id: 'Medição',
    label: 'Medição',
    description:
      'Célula liderada por um Engenheiro Dono de Área, com subcélulas e processos sob engenheiros responsáveis.',
    sortOrder: 1,
  },
  {
    id: 'Telemedição',
    label: 'Telemedição',
    description: 'Célula de Telemedição. Subcélulas ainda em definição.',
    sortOrder: 2,
  },
] as const

export async function ensureOrgCellsSeeded() {
  for (const cell of DEFAULT_ORG_CELLS) {
    await query(
      `INSERT INTO org_cells (id, area_id, label, description, sort_order)
       VALUES ($1, 'Gestão', $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [cell.id, cell.label, cell.description, cell.sortOrder],
    )
  }
}
