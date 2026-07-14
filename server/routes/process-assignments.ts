import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAdmin, requireAuth } from '../auth.js'
import { writeAuditLog } from '../audit.js'
import { encodeAccessProcess, PROCESSES_BY_AREA } from '../engineer-access.js'

export type ProcessRole = 'responsavel' | 'executor'

type AssignmentRow = {
  process_key: string
  role: ProcessRole
  user_id: string
  user_name: string | null
  user_registration: string | null
}

export type ProcessAssignmentView = {
  processKey: string
  area: string
  process: string
  responsavelUserId: string | null
  responsavelName: string | null
  responsavelRegistration: string | null
  executorUserId: string | null
  executorName: string | null
  executorRegistration: string | null
}

function catalogProcessKeys(): Array<{ processKey: string; area: string; process: string }> {
  return Object.entries(PROCESSES_BY_AREA).flatMap(([area, processes]) =>
    processes.map((process) => ({
      area,
      process,
      processKey: encodeAccessProcess(area, process),
    })),
  )
}

function isValidProcessKey(processKey: string) {
  return catalogProcessKeys().some((item) => item.processKey === processKey)
}

export async function listProcessAssignments(_req: Request, res: Response) {
  const result = await query<AssignmentRow>(
    `SELECT pa.process_key, pa.role, pa.user_id,
            u.name AS user_name, u.registration AS user_registration
     FROM process_assignments pa
     LEFT JOIN users u ON u.id = pa.user_id
     ORDER BY pa.process_key, pa.role`,
  )

  const byKey = new Map<string, ProcessAssignmentView>()

  for (const item of catalogProcessKeys()) {
    byKey.set(item.processKey, {
      processKey: item.processKey,
      area: item.area,
      process: item.process,
      responsavelUserId: null,
      responsavelName: null,
      responsavelRegistration: null,
      executorUserId: null,
      executorName: null,
      executorRegistration: null,
    })
  }

  for (const row of result.rows) {
    const current = byKey.get(row.process_key)
    if (!current) continue
    if (row.role === 'responsavel') {
      current.responsavelUserId = row.user_id
      current.responsavelName = row.user_name
      current.responsavelRegistration = row.user_registration
    } else if (row.role === 'executor') {
      current.executorUserId = row.user_id
      current.executorName = row.user_name
      current.executorRegistration = row.user_registration
    }
  }

  res.json({ assignments: [...byKey.values()] })
}

export async function upsertProcessAssignment(req: Request, res: Response) {
  const processKey =
    typeof req.body?.processKey === 'string' ? req.body.processKey.trim() : ''
  const role = req.body?.role as ProcessRole
  const userIdRaw = req.body?.userId
  const userId =
    userIdRaw === null || userIdRaw === undefined || userIdRaw === ''
      ? null
      : String(userIdRaw).trim()

  if (!processKey || !isValidProcessKey(processKey)) {
    res.status(400).json({ error: 'Selecione um processo válido.' })
    return
  }

  if (role !== 'responsavel' && role !== 'executor') {
    res.status(400).json({ error: 'Papel inválido. Use responsável ou executor.' })
    return
  }

  if (userId) {
    const user = await query<{ id: string; approval_status: string; role: string }>(
      `SELECT id, approval_status, role FROM users WHERE id = $1`,
      [userId],
    )
    if (!user.rows[0]) {
      res.status(404).json({ error: 'Usuário não encontrado.' })
      return
    }
    if (user.rows[0].role === 'admin') {
      res.status(400).json({ error: 'O administrador não pode ser atribuído a processos.' })
      return
    }
    if (user.rows[0].approval_status !== 'approved') {
      res.status(400).json({ error: 'Só é possível atribuir usuários aprovados.' })
      return
    }
  }

  const previous = await query<{ user_id: string }>(
    `SELECT user_id FROM process_assignments
     WHERE process_key = $1 AND role = $2`,
    [processKey, role],
  )

  if (!userId) {
    await query(
      `DELETE FROM process_assignments WHERE process_key = $1 AND role = $2`,
      [processKey, role],
    )
  } else {
    await query(
      `INSERT INTO process_assignments (process_key, role, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (process_key, role)
       DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = NOW()`,
      [processKey, role, userId],
    )
  }

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'process_assignment',
    entityId: `${processKey}:${role}`,
    summary: userId
      ? `Atribuição de ${role} no processo ${processKey}`
      : `Remoção de ${role} do processo ${processKey}`,
    oldData: {
      processKey,
      role,
      userId: previous.rows[0]?.user_id ?? null,
    },
    newData: { processKey, role, userId },
  })

  // Reaproveita listagem completa para resposta consistente.
  await listProcessAssignments(req, res)
}

export const processAssignmentRoutes = {
  list: [requireAuth, requireAdmin, listProcessAssignments],
  upsert: [requireAuth, requireAdmin, upsertProcessAssignment],
}
