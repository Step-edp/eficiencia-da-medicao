import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAdmin, requireAuth } from '../auth.js'
import { writeAuditLog } from '../audit.js'
import { encodeAccessProcess, PROCESSES_BY_AREA } from '../engineer-access.js'
import { buildVacationSubstituteMap } from '../vacation-coverage.js'

export const PROCESS_EXECUTOR_ROLES = ['executor1', 'executor2', 'executor3'] as const
export type ProcessRole = (typeof PROCESS_EXECUTOR_ROLES)[number]

type AssignmentRow = {
  process_key: string
  role: string
  user_id: string
  user_name: string | null
  user_registration: string | null
}

export type ProcessExecutorSlot = {
  userId: string | null
  name: string | null
  registration: string | null
  actingUserId: string | null
  actingName: string | null
  coveredBySubstitute: boolean
}

export type ProcessAssignmentView = {
  processKey: string
  area: string
  process: string
  executor1: ProcessExecutorSlot
  executor2: ProcessExecutorSlot
  executor3: ProcessExecutorSlot
}

function emptySlot(): ProcessExecutorSlot {
  return {
    userId: null,
    name: null,
    registration: null,
    actingUserId: null,
    actingName: null,
    coveredBySubstitute: false,
  }
}

function isProcessRole(value: unknown): value is ProcessRole {
  return (
    typeof value === 'string' &&
    (PROCESS_EXECUTOR_ROLES as readonly string[]).includes(value)
  )
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

function applyVacationCover(
  slot: ProcessExecutorSlot,
  coverMap: Awaited<ReturnType<typeof buildVacationSubstituteMap>>,
) {
  if (!slot.userId) {
    slot.actingUserId = null
    slot.actingName = null
    slot.coveredBySubstitute = false
    return
  }

  const cover = coverMap.get(slot.userId)
  if (!cover) {
    slot.actingUserId = slot.userId
    slot.actingName = slot.name
    slot.coveredBySubstitute = false
    return
  }

  slot.actingUserId = cover.substituteUserId
  slot.actingName = `${cover.substituteName} (subst. de ${slot.name ?? 'titular'})`
  slot.coveredBySubstitute = true
}

function slotForRole(view: ProcessAssignmentView, role: ProcessRole): ProcessExecutorSlot {
  if (role === 'executor1') return view.executor1
  if (role === 'executor2') return view.executor2
  return view.executor3
}

export async function listProcessAssignments(_req: Request, res: Response) {
  const [result, coverMap] = await Promise.all([
    query<AssignmentRow>(
      `SELECT pa.process_key, pa.role, pa.user_id,
              u.name AS user_name, u.registration AS user_registration
       FROM process_assignments pa
       LEFT JOIN users u ON u.id = pa.user_id
       ORDER BY pa.process_key, pa.role`,
    ),
    buildVacationSubstituteMap(),
  ])

  const byKey = new Map<string, ProcessAssignmentView>()

  for (const item of catalogProcessKeys()) {
    byKey.set(item.processKey, {
      processKey: item.processKey,
      area: item.area,
      process: item.process,
      executor1: emptySlot(),
      executor2: emptySlot(),
      executor3: emptySlot(),
    })
  }

  for (const row of result.rows) {
    const current = byKey.get(row.process_key)
    if (!current || !isProcessRole(row.role)) continue
    const slot = slotForRole(current, row.role)
    slot.userId = row.user_id
    slot.name = row.user_name
    slot.registration = row.user_registration
  }

  for (const view of byKey.values()) {
    applyVacationCover(view.executor1, coverMap)
    applyVacationCover(view.executor2, coverMap)
    applyVacationCover(view.executor3, coverMap)
  }

  res.json({ assignments: [...byKey.values()] })
}

export async function upsertProcessAssignment(req: Request, res: Response) {
  const processKey =
    typeof req.body?.processKey === 'string' ? req.body.processKey.trim() : ''
  const role = req.body?.role
  const userIdRaw = req.body?.userId
  const userId =
    userIdRaw === null || userIdRaw === undefined || userIdRaw === ''
      ? null
      : String(userIdRaw).trim()

  if (!processKey || !isValidProcessKey(processKey)) {
    res.status(400).json({ error: 'Selecione um processo válido.' })
    return
  }

  if (!isProcessRole(role)) {
    res.status(400).json({
      error: 'Papel inválido. Use executor1, executor2 ou executor3.',
    })
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
    // Evita a mesma pessoa em dois slots do mesmo processo.
    await query(
      `DELETE FROM process_assignments
       WHERE process_key = $1 AND role <> $2 AND user_id = $3`,
      [processKey, role, userId],
    )
    await query(
      `INSERT INTO process_assignments (process_key, role, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (process_key, role)
       DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = NOW()`,
      [processKey, role, userId],
    )
  }

  const roleLabel =
    role === 'executor1' ? 'Executor 1' : role === 'executor2' ? 'Executor 2' : 'Executor 3'

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'process_assignment',
    entityId: `${processKey}:${role}`,
    summary: userId
      ? `Atribuição de ${roleLabel} no processo ${processKey}`
      : `Remoção de ${roleLabel} do processo ${processKey}`,
    oldData: {
      processKey,
      role,
      userId: previous.rows[0]?.user_id ?? null,
    },
    newData: { processKey, role, userId },
  })

  await listProcessAssignments(req, res)
}

export const processAssignmentRoutes = {
  list: [requireAuth, requireAdmin, listProcessAssignments],
  upsert: [requireAuth, requireAdmin, upsertProcessAssignment],
}
