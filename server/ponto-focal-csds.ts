import { query } from './db.js'

export const PONTO_FOCAL_SCOPE = 'Lavratura de TOI - Ponto Focal'

function normalizeWorkSubtype(value?: string | null) {
  return (value?.trim() ?? '').replace(/[–—]/g, '-')
}

/** `null` = não é Ponto Focal; lista = CSDs em que é responsável (pode ser vazia). */
export async function resolvePontoFocalCsdNames(userId: string): Promise<string[] | null> {
  const userResult = await query<{ work_area: string; work_subtype: string }>(
    `SELECT work_area, work_subtype FROM users WHERE id = $1`,
    [userId],
  )
  const user = userResult.rows[0]
  if (!user) {
    return []
  }

  const isPontoFocal =
    user.work_area?.trim() === 'CSD' &&
    normalizeWorkSubtype(user.work_subtype) === PONTO_FOCAL_SCOPE

  if (!isPontoFocal) {
    return null
  }

  const csdsResult = await query<{ name: string }>(
    `SELECT name FROM csds WHERE responsible_user_id = $1 ORDER BY name ASC`,
    [userId],
  )

  return csdsResult.rows.map((row) => row.name.trim()).filter(Boolean)
}

export function pontoFocalScopeUserId(
  role: string | undefined,
  userId: string | undefined,
  forUserId?: string,
) {
  return role === 'admin' && forUserId ? forUserId : (userId ?? '')
}
