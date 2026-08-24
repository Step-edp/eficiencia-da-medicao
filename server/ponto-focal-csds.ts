import type { Request } from 'express'
import { writeAuditLog } from './audit.js'
import { query } from './db.js'
import {
  isEngineerAreaSubtype,
  isEngineerProcessSubtype,
  isEngineerSubcellSubtype,
} from './engineer-access.js'

export const PONTO_FOCAL_SCOPE = 'Lavratura de TOI - Ponto Focal'
const PONTO_FOCAL_ACCESS_AREAS = ['Equipe de campo']

function normalizeWorkSubtype(value?: string | null) {
  return (value?.trim() ?? '').replace(/[–—]/g, '-')
}

/** `null` = sem escopo de CSD; lista = CSDs em que é responsável (pode ser vazia no perfil Ponto Focal). */
export async function resolvePontoFocalCsdNames(userId: string): Promise<string[] | null> {
  const csdsResult = await query<{ name: string }>(
    `SELECT name FROM csds WHERE responsible_user_id = $1 ORDER BY name ASC`,
    [userId],
  )
  const names = csdsResult.rows.map((row) => row.name.trim()).filter(Boolean)
  if (names.length > 0) {
    return names
  }

  const userResult = await query<{ work_area: string; work_subtype: string }>(
    `SELECT work_area, work_subtype FROM users WHERE id = $1`,
    [userId],
  )
  const user = userResult.rows[0]
  const isPontoFocal =
    user?.work_area?.trim() === 'CSD' &&
    normalizeWorkSubtype(user.work_subtype) === PONTO_FOCAL_SCOPE

  return isPontoFocal ? [] : null
}

export function pontoFocalScopeUserId(
  role: string | undefined,
  userId: string | undefined,
  forUserId?: string,
) {
  return role === 'admin' && forUserId ? forUserId : (userId ?? '')
}

function shouldKeepExistingProfile(jobTitle: string, workSubtype: string) {
  if (jobTitle.trim() === 'Gestor') return true
  return (
    isEngineerAreaSubtype(workSubtype) ||
    isEngineerSubcellSubtype(workSubtype) ||
    isEngineerProcessSubtype(workSubtype)
  )
}

/** Responsável de CSD assume o perfil Ponto Focal (home, documentos e dashboard). */
export async function promoteCsdResponsibleToPontoFocal(
  req: Request,
  userId: string | null,
) {
  if (!userId) return

  const result = await query<{
    id: string
    name: string
    registration: string
    job_title: string
    work_subtype: string
    access_areas: unknown
  }>(
    `SELECT id, name, registration, job_title, work_subtype, access_areas
     FROM users
     WHERE id = $1
       AND approval_status = 'approved'
       AND role <> 'admin'`,
    [userId],
  )
  const user = result.rows[0]
  if (!user) return
  if (shouldKeepExistingProfile(user.job_title, user.work_subtype)) return
  if (normalizeWorkSubtype(user.work_subtype) === PONTO_FOCAL_SCOPE) return

  const previousSubtype = user.work_subtype

  await query(
    `UPDATE users
     SET work_subtype = $2,
         access_areas = $3::jsonb,
         vacation_required_since = NULL
     WHERE id = $1`,
    [userId, PONTO_FOCAL_SCOPE, JSON.stringify(PONTO_FOCAL_ACCESS_AREAS)],
  )

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'user',
    entityId: user.id,
    summary: `Perfil de ${user.name} alterado para Ponto Focal ao ser definido como responsável de CSD`,
    oldData: { workSubtype: previousSubtype, accessAreas: user.access_areas },
    newData: { workSubtype: PONTO_FOCAL_SCOPE, accessAreas: PONTO_FOCAL_ACCESS_AREAS },
    metadata: { registration: user.registration, reason: 'csd_responsible' },
  })
}
