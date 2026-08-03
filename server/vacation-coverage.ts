import { query } from './db.js'

export type AbsenceType =
  | 'ferias'
  | 'licenca'
  | 'afastamento'
  | 'atestado'
  | 'treinamento'
  | 'outro'

export const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  ferias: 'Férias',
  licenca: 'Licença',
  afastamento: 'Afastamento',
  atestado: 'Atestado médico',
  treinamento: 'Treinamento',
  outro: 'Outra ausência',
}

export const ABSENCE_TYPES = Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[]

export function isAbsenceType(value: string): value is AbsenceType {
  return (ABSENCE_TYPES as string[]).includes(value)
}

export type CoveragePerson = {
  userId: string
  name: string
  registration: string
}

export type AbsenceCover = {
  titular: CoveragePerson
  substitute: CoveragePerson
  absenceStart: string
  absenceEnd: string
  absenceType: AbsenceType
  absenceTypeLabel: string
  sources: string[]
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function toDateOnly(value: string | Date) {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
}

function normalizeAbsenceType(raw: string | null | undefined): AbsenceType {
  if (raw && isAbsenceType(raw)) return raw
  return 'ferias'
}

/** Usuários com qualquer ausência ativa hoje (férias ou outros). */
export async function listUsersOnAbsenceToday(): Promise<
  Array<{
    userId: string
    startDate: string
    endDate: string
    absenceType: AbsenceType
    absenceLabel: string
    substituteUserId: string | null
  }>
> {
  const today = todayIso()
  const result = await query<{
    user_id: string
    start_date: string
    end_date: string
    absence_type: string
    absence_label: string
    substitute_user_id: string | null
  }>(
    `SELECT DISTINCT ON (user_id) user_id,
            start_date::text AS start_date,
            end_date::text AS end_date,
            absence_type,
            COALESCE(absence_label, '') AS absence_label,
            substitute_user_id
     FROM user_vacation_periods
     WHERE start_date <= $1::date AND end_date >= $1::date
     ORDER BY user_id,
              CASE WHEN absence_type = 'ferias' THEN 0 ELSE 1 END,
              start_date ASC,
              id ASC`,
    [today],
  )
  return result.rows.map((row) => ({
    userId: row.user_id,
    startDate: toDateOnly(row.start_date),
    endDate: toDateOnly(row.end_date),
    absenceType: normalizeAbsenceType(row.absence_type),
    absenceLabel: row.absence_label?.trim() ?? '',
    substituteUserId: row.substitute_user_id ?? null,
  }))
}

/** @deprecated use listUsersOnAbsenceToday */
export async function listUsersOnVacationToday() {
  return listUsersOnAbsenceToday()
}

export type SubstituteResolution = {
  substituteUserId: string
  substituteName: string
  substituteRegistration: string
  sources: string[]
}

async function loadApprovedUserAsSubstitute(
  substituteUserId: string,
  sourceLabel: string,
): Promise<SubstituteResolution | null> {
  const result = await query<{
    id: string
    name: string
    registration: string
  }>(
    `SELECT id, name, registration
     FROM users
     WHERE id = $1 AND approval_status = 'approved'`,
    [substituteUserId],
  )
  if (!result.rows[0]) return null
  return {
    substituteUserId: result.rows[0].id,
    substituteName: result.rows[0].name,
    substituteRegistration: result.rows[0].registration,
    sources: [sourceLabel],
  }
}

/**
 * Substitutos cadastrados para o titular (células e área Gestão Operacional).
 * Preferência: célula específica; depois área.
 */
export async function findSubstitutesForResponsible(
  titularUserId: string,
): Promise<SubstituteResolution | null> {
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

/**
 * Resolve o substituto de uma ausência: prioriza o indicado no período;
 * se ausente, usa a liderança da área/célula.
 */
export async function resolveSubstituteForAbsence(
  titularUserId: string,
  periodSubstituteUserId?: string | null,
): Promise<SubstituteResolution | null> {
  if (periodSubstituteUserId && periodSubstituteUserId !== titularUserId) {
    const fromPeriod = await loadApprovedUserAsSubstitute(
      periodSubstituteUserId,
      'Indicado no registro de ausência',
    )
    if (fromPeriod) return fromPeriod
  }
  return findSubstitutesForResponsible(titularUserId)
}

/** Coberturas ativas onde o usuário logado é o substituto. */
export async function listActiveCoversForSubstitute(
  substituteUserId: string,
): Promise<AbsenceCover[]> {
  const onAbsence = await listUsersOnAbsenceToday()
  if (!onAbsence.length) return []

  const covers: AbsenceCover[] = []
  for (const period of onAbsence) {
    const sub = await resolveSubstituteForAbsence(period.userId, period.substituteUserId)
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
      absenceStart: period.startDate,
      absenceEnd: period.endDate,
      absenceType: period.absenceType,
      absenceTypeLabel: ABSENCE_TYPE_LABELS[period.absenceType],
      sources: sub.sources,
    })
  }
  return covers
}

/** Mapa titular → substituto para quem está ausente hoje. */
export async function buildVacationSubstituteMap(): Promise<
  Map<
    string,
    {
      substituteUserId: string
      substituteName: string
      substituteRegistration: string
      vacationStart: string
      vacationEnd: string
      absenceType: AbsenceType
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
      absenceType: AbsenceType
    }
  >()

  const onAbsence = await listUsersOnAbsenceToday()
  await Promise.all(
    onAbsence.map(async (period) => {
      const sub = await resolveSubstituteForAbsence(period.userId, period.substituteUserId)
      if (!sub) return
      map.set(period.userId, {
        substituteUserId: sub.substituteUserId,
        substituteName: sub.substituteName,
        substituteRegistration: sub.substituteRegistration,
        vacationStart: period.startDate,
        vacationEnd: period.endDate,
        absenceType: period.absenceType,
      })
    }),
  )
  return map
}
