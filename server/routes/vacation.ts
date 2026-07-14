import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { writeAuditLog } from '../audit.js'
import {
  findSubstitutesForResponsible,
  listActiveCoversForSubstitute,
} from '../vacation-coverage.js'

export type VacationStatus = 'ok' | 'pendente' | 'bloqueado' | 'em_ferias'

export type VacationPeriodRow = {
  id: number
  user_id: string
  start_date: string
  end_date: string
  created_at: Date
  updated_at: Date
}

export type VacationPeriodView = {
  id: number
  startDate: string
  endDate: string
  createdAt: string
  updatedAt: string
}

export type VacationCoverSummary = {
  userId: string
  name: string
  registration: string
  vacationStart: string
  vacationEnd: string
  sources: string[]
}

export type VacationMeta = {
  vacationStatus: VacationStatus
  vacationDeadlineAt: string | null
  vacationRequiredSince: string | null
  nextVacation: VacationPeriodView | null
  vacationSubstituteUserId: string | null
  vacationSubstituteName: string | null
  coveringFor: VacationCoverSummary[]
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function toDateOnly(value: string | Date): string {
  if (typeof value === 'string') {
    return value.slice(0, 10)
  }
  return value.toISOString().slice(0, 10)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function toPeriodView(row: VacationPeriodRow): VacationPeriodView {
  return {
    id: row.id,
    startDate: toDateOnly(row.start_date),
    endDate: toDateOnly(row.end_date),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export async function listUserVacationPeriods(userId: string) {
  const result = await query<VacationPeriodRow>(
    `SELECT id, user_id, start_date::text AS start_date, end_date::text AS end_date,
            created_at, updated_at
     FROM user_vacation_periods
     WHERE user_id = $1
     ORDER BY start_date ASC, id ASC`,
    [userId],
  )
  return result.rows.map(toPeriodView)
}

async function findNextVacation(userId: string) {
  const today = todayIso()
  const result = await query<VacationPeriodRow>(
    `SELECT id, user_id, start_date::text AS start_date, end_date::text AS end_date,
            created_at, updated_at
     FROM user_vacation_periods
     WHERE user_id = $1 AND end_date >= $2::date
     ORDER BY start_date ASC, id ASC
     LIMIT 1`,
    [userId, today],
  )
  return result.rows[0] ? toPeriodView(result.rows[0]) : null
}

function isActiveVacation(period: VacationPeriodView) {
  const today = todayIso()
  return period.startDate <= today && period.endDate >= today
}

/**
 * Garante o relógio de 7 dias quando não há próximo período de férias.
 * Admin fica isento de pendente/bloqueado; pode ter em_ferias só informativo.
 */
export async function getVacationMetaForUser(
  userId: string,
  role: string,
): Promise<VacationMeta> {
  const covering = await listActiveCoversForSubstitute(userId)
  const coveringFor: VacationCoverSummary[] = covering.map((item) => ({
    userId: item.titular.userId,
    name: item.titular.name,
    registration: item.titular.registration,
    vacationStart: item.vacationStart,
    vacationEnd: item.vacationEnd,
    sources: item.sources,
  }))

  const nextVacation = await findNextVacation(userId)

  if (role === 'admin') {
    return {
      vacationStatus: 'ok',
      vacationDeadlineAt: null,
      vacationRequiredSince: null,
      nextVacation,
      vacationSubstituteUserId: null,
      vacationSubstituteName: null,
      coveringFor,
    }
  }

  if (nextVacation && isActiveVacation(nextVacation)) {
    await query(
      `UPDATE users SET vacation_required_since = NULL WHERE id = $1 AND vacation_required_since IS NOT NULL`,
      [userId],
    )
    const substitute = await findSubstitutesForResponsible(userId)
    return {
      vacationStatus: 'em_ferias',
      vacationDeadlineAt: null,
      vacationRequiredSince: null,
      nextVacation,
      vacationSubstituteUserId: substitute?.substituteUserId ?? null,
      vacationSubstituteName: substitute?.substituteName ?? null,
      coveringFor,
    }
  }

  if (nextVacation) {
    await query(
      `UPDATE users SET vacation_required_since = NULL WHERE id = $1 AND vacation_required_since IS NOT NULL`,
      [userId],
    )
    return {
      vacationStatus: 'ok',
      vacationDeadlineAt: null,
      vacationRequiredSince: null,
      nextVacation,
      vacationSubstituteUserId: null,
      vacationSubstituteName: null,
      coveringFor,
    }
  }

  const current = await query<{ vacation_required_since: Date | null }>(
    `SELECT vacation_required_since FROM users WHERE id = $1`,
    [userId],
  )
  let since = current.rows[0]?.vacation_required_since ?? null

  if (!since) {
    const updated = await query<{ vacation_required_since: Date }>(
      `UPDATE users
       SET vacation_required_since = NOW()
       WHERE id = $1
       RETURNING vacation_required_since`,
      [userId],
    )
    since = updated.rows[0]?.vacation_required_since ?? new Date()
  }

  const deadline = new Date(since.getTime() + SEVEN_DAYS_MS)
  const status: VacationStatus =
    Date.now() > deadline.getTime() ? 'bloqueado' : 'pendente'

  return {
    vacationStatus: status,
    vacationDeadlineAt: deadline.toISOString(),
    vacationRequiredSince: since.toISOString(),
    nextVacation: null,
    vacationSubstituteUserId: null,
    vacationSubstituteName: null,
    coveringFor,
  }
}

export function attachVacationMeta<T extends Record<string, unknown>>(
  user: T,
  meta: VacationMeta,
) {
  return {
    ...user,
    vacationStatus: meta.vacationStatus,
    vacationDeadlineAt: meta.vacationDeadlineAt,
    vacationRequiredSince: meta.vacationRequiredSince,
    nextVacationStart: meta.nextVacation?.startDate ?? null,
    nextVacationEnd: meta.nextVacation?.endDate ?? null,
    vacationSubstituteUserId: meta.vacationSubstituteUserId,
    vacationSubstituteName: meta.vacationSubstituteName,
    coveringFor: meta.coveringFor,
  }
}

function parseDateInput(raw: unknown): string | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return null
  }
  const value = raw.trim()
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null
  }
  return value
}

export async function getMyAgenda(req: Request, res: Response) {
  const userId = req.user!.id
  const role = req.user!.role
  const [periods, meta] = await Promise.all([
    listUserVacationPeriods(userId),
    getVacationMetaForUser(userId, role),
  ])
  res.json({
    periods,
    ...meta,
  })
}

export async function upsertMyNextVacation(req: Request, res: Response) {
  const userId = req.user!.id
  const role = req.user!.role

  const startDate = parseDateInput(req.body?.startDate)
  const endDate = parseDateInput(req.body?.endDate)

  if (!startDate || !endDate) {
    res.status(400).json({
      error: 'Informe as datas de início e fim no formato AAAA-MM-DD.',
    })
    return
  }
  if (endDate < startDate) {
    res.status(400).json({ error: 'A data de fim deve ser igual ou posterior ao início.' })
    return
  }
  if (endDate < todayIso()) {
    res.status(400).json({
      error: 'Registre o próximo período de férias com data de fim a partir de hoje.',
    })
    return
  }

  await query(
    `DELETE FROM user_vacation_periods
     WHERE user_id = $1 AND end_date >= CURRENT_DATE`,
    [userId],
  )

  const inserted = await query<VacationPeriodRow>(
    `INSERT INTO user_vacation_periods (user_id, start_date, end_date)
     VALUES ($1, $2::date, $3::date)
     RETURNING id, user_id, start_date::text AS start_date, end_date::text AS end_date,
               created_at, updated_at`,
    [userId, startDate, endDate],
  )

  await query(`UPDATE users SET vacation_required_since = NULL WHERE id = $1`, [userId])

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'user',
    entityId: userId,
    summary: `Período de férias registrado: ${startDate} a ${endDate}.`,
    newData: { startDate, endDate },
  })

  const [periods, meta] = await Promise.all([
    listUserVacationPeriods(userId),
    getVacationMetaForUser(userId, role),
  ])

  res.json({
    period: inserted.rows[0] ? toPeriodView(inserted.rows[0]) : null,
    periods,
    ...meta,
  })
}

export const vacationRoutes = {
  getMine: [requireAuth, getMyAgenda],
  upsertMine: [requireAuth, upsertMyNextVacation],
}
