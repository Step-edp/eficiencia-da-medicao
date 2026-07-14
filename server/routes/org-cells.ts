import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth, requireGestorOrAdmin } from '../auth.js'
import { writeAuditLog } from '../audit.js'

const ORG_AREA_ID = 'Gestão Operacional'

type LeadershipStatus = 'pendente' | 'ativa'

type OrgAreaRow = {
  id: string
  label: string
  description: string
  responsible_user_id: string | null
  responsible_name: string | null
  responsible_registration: string | null
  substitute_user_id: string | null
  substitute_name: string | null
  substitute_registration: string | null
  updated_at: Date
}

type OrgCellRow = {
  id: string
  area_id: string
  label: string
  description: string
  responsible_user_id: string | null
  responsible_name: string | null
  responsible_registration: string | null
  substitute_user_id: string | null
  substitute_name: string | null
  substitute_registration: string | null
  sort_order: number
  created_at: Date
  updated_at: Date
}

export type OrgAreaView = {
  id: string
  label: string
  description: string
  responsibleUserId: string | null
  responsibleName: string | null
  responsibleRegistration: string | null
  substituteUserId: string | null
  substituteName: string | null
  substituteRegistration: string | null
  status: LeadershipStatus
  updatedAt: string
}

export type OrgCellView = {
  id: string
  areaId: string
  label: string
  description: string
  responsibleUserId: string | null
  responsibleName: string | null
  responsibleRegistration: string | null
  substituteUserId: string | null
  substituteName: string | null
  substituteRegistration: string | null
  /** Sem responsável = pendente. */
  status: LeadershipStatus
  sortOrder: number
  createdAt: string
  updatedAt: string
}

function toAreaView(row: OrgAreaRow): OrgAreaView {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    responsibleUserId: row.responsible_user_id,
    responsibleName: row.responsible_name,
    responsibleRegistration: row.responsible_registration,
    substituteUserId: row.substitute_user_id,
    substituteName: row.substitute_name,
    substituteRegistration: row.substitute_registration,
    status: row.responsible_user_id ? 'ativa' : 'pendente',
    updatedAt: row.updated_at.toISOString(),
  }
}

function toCellView(row: OrgCellRow): OrgCellView {
  return {
    id: row.id,
    areaId: row.area_id,
    label: row.label,
    description: row.description,
    responsibleUserId: row.responsible_user_id,
    responsibleName: row.responsible_name,
    responsibleRegistration: row.responsible_registration,
    substituteUserId: row.substitute_user_id,
    substituteName: row.substitute_name,
    substituteRegistration: row.substitute_registration,
    status: row.responsible_user_id ? 'ativa' : 'pendente',
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

async function listAreaRows() {
  const result = await query<OrgAreaRow>(
    `SELECT a.id, a.label, a.description,
            a.responsible_user_id, r.name AS responsible_name,
            r.registration AS responsible_registration,
            a.substitute_user_id, s.name AS substitute_name,
            s.registration AS substitute_registration,
            a.updated_at
     FROM org_areas a
     LEFT JOIN users r ON r.id = a.responsible_user_id
     LEFT JOIN users s ON s.id = a.substitute_user_id
     WHERE a.id = $1`,
    [ORG_AREA_ID],
  )
  return result.rows
}

async function listCellRows() {
  const result = await query<OrgCellRow>(
    `SELECT c.id, c.area_id, c.label, c.description,
            c.responsible_user_id, r.name AS responsible_name,
            r.registration AS responsible_registration,
            c.substitute_user_id, s.name AS substitute_name,
            s.registration AS substitute_registration,
            c.sort_order, c.created_at, c.updated_at
     FROM org_cells c
     LEFT JOIN users r ON r.id = c.responsible_user_id
     LEFT JOIN users s ON s.id = c.substitute_user_id
     ORDER BY c.sort_order ASC, c.label ASC`,
  )
  return result.rows
}

async function getStructurePayload() {
  const [areas, cells] = await Promise.all([listAreaRows(), listCellRows()])
  const area = areas[0] ? toAreaView(areas[0]) : null
  return { area, cells: cells.map(toCellView) }
}

async function assertAssignableUser(
  userId: string,
  roleLabel: 'responsável' | 'substituto',
): Promise<
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
      error: `O administrador não pode ser ${roleLabel}.`,
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

function parseOptionalUserId(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

async function validateLeadershipPair(
  responsibleUserId: string | null,
  substituteUserId: string | null,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (substituteUserId && !responsibleUserId) {
    return {
      ok: false,
      error: 'Defina o responsável antes de atribuir o substituto.',
      status: 400,
    }
  }
  if (
    responsibleUserId &&
    substituteUserId &&
    responsibleUserId === substituteUserId
  ) {
    return {
      ok: false,
      error: 'O substituto deve ser diferente do responsável.',
      status: 400,
    }
  }
  if (responsibleUserId) {
    const check = await assertAssignableUser(responsibleUserId, 'responsável')
    if (!check.ok) return check
  }
  if (substituteUserId) {
    const check = await assertAssignableUser(substituteUserId, 'substituto')
    if (!check.ok) return check
  }
  return { ok: true }
}

function normalizeLabel(raw: unknown) {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''
}

export async function listOrgStructure(_req: Request, res: Response) {
  res.json(await getStructurePayload())
}

export async function updateOrgArea(req: Request, res: Response) {
  const areas = await listAreaRows()
  if (!areas[0]) {
    res.status(404).json({ error: 'Área Gestão Operacional não encontrada.' })
    return
  }

  const hasResponsible = Object.prototype.hasOwnProperty.call(
    req.body ?? {},
    'responsibleUserId',
  )
  const hasSubstitute = Object.prototype.hasOwnProperty.call(
    req.body ?? {},
    'substituteUserId',
  )

  if (!hasResponsible && !hasSubstitute) {
    res.status(400).json({ error: 'Nenhuma alteração informada.' })
    return
  }

  let responsibleUserId = areas[0].responsible_user_id
  let substituteUserId = areas[0].substitute_user_id

  if (hasResponsible) {
    responsibleUserId = parseOptionalUserId(req.body.responsibleUserId)
  }
  if (hasSubstitute) {
    substituteUserId = parseOptionalUserId(req.body.substituteUserId)
  }
  if (!responsibleUserId) {
    substituteUserId = null
  }

  const pair = await validateLeadershipPair(responsibleUserId, substituteUserId)
  if (!pair.ok) {
    res.status(pair.status).json({ error: pair.error })
    return
  }

  await query(
    `UPDATE org_areas
     SET responsible_user_id = $2,
         substitute_user_id = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [ORG_AREA_ID, responsibleUserId, substituteUserId],
  )

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'org_area',
    entityId: ORG_AREA_ID,
    summary: responsibleUserId
      ? 'Liderança da área Gestão Operacional atualizada (responsável e substituto).'
      : 'Área Gestão Operacional ficou pendente (sem responsável).',
    oldData: {
      responsibleUserId: areas[0].responsible_user_id,
      substituteUserId: areas[0].substitute_user_id,
    },
    newData: { responsibleUserId, substituteUserId },
  })

  res.json(await getStructurePayload())
}

export async function createOrgCell(req: Request, res: Response) {
  const label = normalizeLabel(req.body?.label)
  const description =
    typeof req.body?.description === 'string' ? req.body.description.trim() : ''
  const responsibleUserId = parseOptionalUserId(req.body?.responsibleUserId)
  let substituteUserId = parseOptionalUserId(req.body?.substituteUserId)
  if (!responsibleUserId) {
    substituteUserId = null
  }

  if (!label) {
    res.status(400).json({ error: 'Informe o nome da célula.' })
    return
  }
  if (label.length > 80) {
    res.status(400).json({ error: 'O nome da célula deve ter no máximo 80 caracteres.' })
    return
  }

  const pair = await validateLeadershipPair(responsibleUserId, substituteUserId)
  if (!pair.ok) {
    res.status(pair.status).json({ error: pair.error })
    return
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
    `SELECT MAX(sort_order) AS max FROM org_cells WHERE area_id = $1`,
    [ORG_AREA_ID],
  )
  const sortOrder = (maxOrder.rows[0]?.max ?? 0) + 1

  await query(
    `INSERT INTO org_cells (
       id, area_id, label, description,
       responsible_user_id, substitute_user_id, sort_order, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      label,
      ORG_AREA_ID,
      label,
      description,
      responsibleUserId,
      substituteUserId,
      sortOrder,
      req.user!.id,
    ],
  )

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'org_cell',
    entityId: label,
    summary: responsibleUserId
      ? `Célula "${label}" criada com responsável${substituteUserId ? ' e substituto' : ''}.`
      : `Célula "${label}" criada como pendente (sem responsável).`,
    newData: { label, description, responsibleUserId, substituteUserId },
  })

  const structure = await getStructurePayload()
  res.status(201).json({
    ...structure,
    cell: structure.cells.find((cell) => cell.id === label) ?? null,
  })
}

export async function updateOrgCell(req: Request, res: Response) {
  const cellId = String(req.params.id ?? '').trim()
  if (!cellId) {
    res.status(400).json({ error: 'Identificador da célula inválido.' })
    return
  }

  const current = await query<OrgCellRow>(
    `SELECT c.id, c.area_id, c.label, c.description,
            c.responsible_user_id, r.name AS responsible_name,
            r.registration AS responsible_registration,
            c.substitute_user_id, s.name AS substitute_name,
            s.registration AS substitute_registration,
            c.sort_order, c.created_at, c.updated_at
     FROM org_cells c
     LEFT JOIN users r ON r.id = c.responsible_user_id
     LEFT JOIN users s ON s.id = c.substitute_user_id
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
  const hasSubstitute = Object.prototype.hasOwnProperty.call(
    req.body ?? {},
    'substituteUserId',
  )

  if (!hasDescription && !hasResponsible && !hasSubstitute) {
    res.status(400).json({ error: 'Nenhuma alteração informada.' })
    return
  }

  let description = current.rows[0].description
  if (hasDescription) {
    description =
      typeof req.body.description === 'string' ? req.body.description.trim() : ''
  }

  let responsibleUserId = current.rows[0].responsible_user_id
  let substituteUserId = current.rows[0].substitute_user_id

  if (hasResponsible) {
    responsibleUserId = parseOptionalUserId(req.body.responsibleUserId)
  }
  if (hasSubstitute) {
    substituteUserId = parseOptionalUserId(req.body.substituteUserId)
  }
  if (!responsibleUserId) {
    substituteUserId = null
  }

  const pair = await validateLeadershipPair(responsibleUserId, substituteUserId)
  if (!pair.ok) {
    res.status(pair.status).json({ error: pair.error })
    return
  }

  await query(
    `UPDATE org_cells
     SET description = $2,
         responsible_user_id = $3,
         substitute_user_id = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [cellId, description, responsibleUserId, substituteUserId],
  )

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'org_cell',
    entityId: cellId,
    summary: responsibleUserId
      ? `Liderança da célula "${cellId}" atualizada.`
      : `Célula "${cellId}" ficou pendente (sem responsável).`,
    oldData: {
      description: current.rows[0].description,
      responsibleUserId: current.rows[0].responsible_user_id,
      substituteUserId: current.rows[0].substitute_user_id,
    },
    newData: { description, responsibleUserId, substituteUserId },
  })

  const structure = await getStructurePayload()
  res.json({
    ...structure,
    cell: structure.cells.find((cell) => cell.id === cellId) ?? null,
  })
}

export const orgCellRoutes = {
  list: [requireAuth, listOrgStructure],
  updateArea: [requireAuth, requireGestorOrAdmin, updateOrgArea],
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
  await query(
    `INSERT INTO org_areas (id, label, description)
     VALUES (
       $1,
       $1,
       'Área gerencial do portal. Conta com 1 responsável e 1 substituto para períodos de ausência.'
     )
     ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label`,
    [ORG_AREA_ID],
  )

  for (const cell of DEFAULT_ORG_CELLS) {
    await query(
      `INSERT INTO org_cells (id, area_id, label, description, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [cell.id, ORG_AREA_ID, cell.label, cell.description, cell.sortOrder],
    )
  }
}
