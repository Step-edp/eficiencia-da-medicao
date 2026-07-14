import { query } from './db.js'

export type CoveragePerson = {
  userId: string
  name: string
  registration: string
}

export type VacationCover = {
  titular: CoveragePerson
  substitute: CoveragePerson
  vacationStart: string
  vacationEnd: string
  sources: string[]
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function toDateOnly(value: string | Date) {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
}

/** Usuários com férias ativas hoje (inclusive). */
export async function listUsersOnVacationToday(): Promise<
  Array<{ userId: string; startDate: string; endDate: string }>
> {
  const today = todayIso()
  const result = await query<{
    user_id: string
    start_date: string
    end_date: string
  }>(
    `SELECT DISTINCT ON (user_id) user_id,
            start_date::text AS start_date,
            end_date::text AS end_date
     FROM user_vacation_periods
     WHERE start_date <= $1::date AND end_date >= $1::date
     ORDER BY user_id, start_date ASC, id ASC`,
    [today],
  )
  return result.rows.map((row) => ({
    userId: row.user_id,
    startDate: toDateOnly(row.start_date),
    endDate: toDateOnly(row.end_date),
  }))
}

/**
 * Substitutos cadastrados para o titular (células e área Gestão).
 * Preferência: célula específica; depois área.
 */
export async function findSubstitutesForResponsible(titularUserId: string): Promise<{
  substituteUserId: string
  substituteName: string
  substituteRegistration: string
  sources: string[]
} | null> {
  const cells = await query<{
    substitute_user_id: string
    substitute_name: string
    substitute_registration: string
    label: string
  }>(
    `SELECT c.substitute_user_id,
            s.name AS substitute_name,
            s.registration AS substitute_registration,
            c.label
     FROM org_cells c
     INNER JOIN users s ON s.id = c.substitute_user_id
     WHERE c.responsible_user_id = $1
       AND c.substitute_user_id IS NOT NULL
       AND s.approval_status = 'approved'
     ORDER BY c.sort_order ASC, c.label ASC`,
    [titularUserId],
  )

  if (cells.rows[0]) {
    const primary = cells.rows[0]
    const sources = cells.rows.map((row) => `Célula ${row.label}`)
    return {
      substituteUserId: primary.substitute_user_id,
      substituteName: primary.substitute_name,
      substituteRegistration: primary.substitute_registration,
      sources,
    }
  }

  const area = await query<{
    substitute_user_id: string
    substitute_name: string
    substitute_registration: string
    label: string
  }>(
    `SELECT a.substitute_user_id,
            s.name AS substitute_name,
            s.registration AS substitute_registration,
            a.label
     FROM org_areas a
     INNER JOIN users s ON s.id = a.substitute_user_id
     WHERE a.responsible_user_id = $1
       AND a.substitute_user_id IS NOT NULL
       AND s.approval_status = 'approved'
     LIMIT 1`,
    [titularUserId],
  )

  if (!area.rows[0]) return null
  return {
    substituteUserId: area.rows[0].substitute_user_id,
    substituteName: area.rows[0].substitute_name,
    substituteRegistration: area.rows[0].substitute_registration,
    sources: [`Área ${area.rows[0].label}`],
  }
}

/** Coberturas ativas onde o usuário logado é o substituto. */
export async function listActiveCoversForSubstitute(
  substituteUserId: string,
): Promise<VacationCover[]> {
  const onVacation = await listUsersOnVacationToday()
  if (!onVacation.length) return []

  const covers: VacationCover[] = []
  for (const period of onVacation) {
    const sub = await findSubstitutesForResponsible(period.userId)
    if (!sub || sub.substituteUserId !== substituteUserId) continue

    const titular = await query<{ name: string; registration: string }>(
      `SELECT name, registration FROM users WHERE id = $1`,
      [period.userId],
    )
    if (!titular.rows[0]) continue

    covers.push({
      titular: {
        userId: period.userId,
        name: titular.rows[0].name,
        registration: titular.rows[0].registration,
      },
      substitute: {
        userId: sub.substituteUserId,
        name: sub.substituteName,
        registration: sub.substituteRegistration,
      },
      vacationStart: period.startDate,
      vacationEnd: period.endDate,
      sources: sub.sources,
    })
  }
  return covers
}

/** Mapa titular → substituto para quem está de férias hoje. */
export async function buildVacationSubstituteMap(): Promise<
  Map<
    string,
    {
      substituteUserId: string
      substituteName: string
      substituteRegistration: string
      vacationStart: string
      vacationEnd: string
    }
  >
> {
  const map = new Map<
    string,
    {
      substituteUserId: string
      substituteName: string
      substituteRegistration: string
      vacationStart: string
      vacationEnd: string
    }
  >()

  const onVacation = await listUsersOnVacationToday()
  await Promise.all(
    onVacation.map(async (period) => {
      const sub = await findSubstitutesForResponsible(period.userId)
      if (!sub) return
      map.set(period.userId, {
        substituteUserId: sub.substituteUserId,
        substituteName: sub.substituteName,
        substituteRegistration: sub.substituteRegistration,
        vacationStart: period.startDate,
        vacationEnd: period.endDate,
      })
    }),
  )
  return map
}
