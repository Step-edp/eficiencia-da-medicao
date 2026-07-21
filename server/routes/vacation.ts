import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { writeAuditLog } from '../audit.js'
import {
  ABSENCE_TYPE_LABELS,
  type AbsenceType,
  findSubstitutesForResponsible,
  isAbsenceType,
  listActiveCoversForSubstitute,
} from '../vacation-coverage.js'
import { skipsVacationAgenda } from '../vacation-exempt.js'

export type VacationStatus = 'ok' | 'pendente' | 'bloqueado' | 'em_ausencia' | 'em_ferias'

export type VacationPeriodRow = {
  id: number
  user_id: string
  start_date: string
  end_date: string
  absence_type: string
  absence_label: string
  created_at: Date
  updated_at: Date
}

export type VacationPeriodView = {
  id: number
  startDate: string
  endDate: string
  absenceType: AbsenceType
  absenceTypeLabel: string
  createdAt: string
  updatedAt: string
}

export type VacationCoverSummary = {
  userId: string
  name: string
  registration: string
  vacationStart: string
  vacationEnd: string
  absenceType: AbsenceType
  absenceTypeLabel: string
  sources: string[]
}

export type VacationMeta = {
  vacationStatus: VacationStatus
  vacationDeadlineAt: string | null
  vacationRequiredSince: string | null
  nextVacation: VacationPeriodView | null
  activeAbsence: VacationPeriodView | null
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

function normalizeAbsenceType(raw: string | null | undefined): AbsenceType {
  if (raw && isAbsenceType(raw)) return raw
  return 'ferias'
}

function absenceLabelFor(
  absenceType: AbsenceType,
  absenceLabel: string | null | undefined,
) {
  const custom = typeof absenceLabel === 'string' ? absenceLabel.trim() : ''
  if (absenceType === 'outro' && custom) return custom
  return ABSENCE_TYPE_LABELS[absenceType]
}

function toPeriodView(row: VacationPeriodRow): VacationPeriodView {
  const absenceType = normalizeAbsenceType(row.absence_type)
  return {
    id: row.id,
    startDate: toDateOnly(row.start_date),
    endDate: toDateOnly(row.end_date),
    absenceType,
    absenceTypeLabel: absenceLabelFor(absenceType, row.absence_label),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export async function listUserVacationPeriods(userId: string) {
  const result = await query<VacationPeriodRow>(
    `SELECT id, user_id, start_date::text AS start_date, end_date::text AS end_date,
            absence_type, COALESCE(absence_label, '') AS absence_label,
            created_at, updated_at
     FROM user_vacation_periods
     WHERE user_id = $1
     ORDER BY start_date ASC, id ASC`,
    [userId],
  )
  return result.rows.map(toPeriodView)
}

/** Próximas férias obrigatórias (somente tipo ferias). */
async function findNextVacation(userId: string) {
  const today = todayIso()
  const result = await query<VacationPeriodRow>(
    `SELECT id, user_id, start_date::text AS start_date, end_date::text AS end_date,
            absence_type, COALESCE(absence_label, '') AS absence_label,
            created_at, updated_at
     FROM user_vacation_periods
     WHERE user_id = $1
       AND absence_type = 'ferias'
       AND end_date >= $2::date
     ORDER BY start_date ASC, id ASC
     LIMIT 1`,
    [userId, today],
  )
  return result.rows[0] ? toPeriodView(result.rows[0]) : null
}

/** Qualquer ausência ativa hoje. */
async function findActiveAbsence(userId: string) {
  const today = todayIso()
  const result = await query<VacationPeriodRow>(
    `SELECT id, user_id, start_date::text AS start_date, end_date::text AS end_date,
            absence_type, COALESCE(absence_label, '') AS absence_label,
            created_at, updated_at
     FROM user_vacation_periods
     WHERE user_id = $1
       AND start_date <= $2::date
       AND end_date >= $2::date
     ORDER BY CASE WHEN absence_type = 'ferias' THEN 0 ELSE 1 END,
              start_date ASC, id ASC
     LIMIT 1`,
    [userId, today],
  )
  return result.rows[0] ? toPeriodView(result.rows[0]) : null
}

/**
 * Garante o relógio de 7 dias quando não há próximo período de férias.
 * Qualquer ausência ativa (férias ou outra) bloqueia o portal e cobre o substituto.
 */
export async function getVacationMetaForUser(
  userId: string,
  role: string,
  workSubtype?: string | null,
): Promise<VacationMeta> {
  const covering = await listActiveCoversForSubstitute(userId)
  const coveringFor: VacationCoverSummary[] = covering.map((item) => ({
    userId: item.titular.userId,
    name: item.titular.name,
    registration: item.titular.registration,
    vacationStart: item.absenceStart,
    vacationEnd: item.absenceEnd,
    absenceType: item.absenceType,
    absenceTypeLabel: item.absenceTypeLabel,
    sources: item.sources,
  }))

  const [nextVacation, activeAbsence] = await Promise.all([
    findNextVacation(userId),
    findActiveAbsence(userId),
  ])

  if (role === 'admin' || skipsVacationAgenda(workSubtype)) {
    if (skipsVacationAgenda(workSubtype)) {
      await query(
        `UPDATE users SET vacation_required_since = NULL WHERE id = $1 AND vacation_required_since IS NOT NULL`,
        [userId],
      )
    }
    return {
      vacationStatus: 'ok',
      vacationDeadlineAt: null,
      vacationRequiredSince: null,
      nextVacation,
      activeAbsence,
      vacationSubstituteUserId: null,
      vacationSubstituteName: null,
      coveringFor,
    }
  }

  if (activeAbsence) {
    await query(
      `UPDATE users SET vacation_required_since = NULL WHERE id = $1 AND vacation_required_since IS NOT NULL`,
      [userId],
    )
    const substitute = await findSubstitutesForResponsible(userId)
    return {
      vacationStatus: 'em_ausencia',
      vacationDeadlineAt: null,
      vacationRequiredSince: null,
      nextVacation,
      activeAbsence,
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
      activeAbsence: null,
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
    activeAbsence: null,
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
    activeAbsenceType: meta.activeAbsence?.absenceType ?? null,
    activeAbsenceTypeLabel: meta.activeAbsence?.absenceTypeLabel ?? null,
    activeAbsenceStart: meta.activeAbsence?.startDate ?? null,
    activeAbsenceEnd: meta.activeAbsence?.endDate ?? null,
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

async function agendaResponse(userId: string, role: string, extra: Record<string, unknown> = {}) {
  const userRow = await query<{ work_subtype: string }>(
    `SELECT work_subtype FROM users WHERE id = $1`,
    [userId],
  )
  const workSubtype = userRow.rows[0]?.work_subtype ?? ''
  const [periods, meta] = await Promise.all([
    listUserVacationPeriods(userId),
    getVacationMetaForUser(userId, role, workSubtype),
  ])
  return {
    periods,
    ...meta,
    ...extra,
  }
}

export async function getMyAgenda(req: Request, res: Response) {
  res.json(await agendaResponse(req.user!.id, req.user!.role))
}

/** Define/atualiza o próximo período de férias (obrigatório). */
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

  // Substitui somente férias futuras/atuais; preserva outras ausências.
  await query(
    `DELETE FROM user_vacation_periods
     WHERE user_id = $1
       AND absence_type = 'ferias'
       AND end_date >= CURRENT_DATE`,
    [userId],
  )

  const inserted = await query<VacationPeriodRow>(
    `INSERT INTO user_vacation_periods (user_id, start_date, end_date, absence_type)
     VALUES ($1, $2::date, $3::date, 'ferias')
     RETURNING id, user_id, start_date::text AS start_date, end_date::text AS end_date,
               absence_type, COALESCE(absence_label, '') AS absence_label,
               created_at, updated_at`,
    [userId, startDate, endDate],
  )

  await query(`UPDATE users SET vacation_required_since = NULL WHERE id = $1`, [userId])

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'user',
    entityId: userId,
    summary: `Período de férias registrado: ${startDate} a ${endDate}.`,
    newData: { startDate, endDate, absenceType: 'ferias' },
  })

  res.json(
    await agendaResponse(userId, role, {
      period: inserted.rows[0] ? toPeriodView(inserted.rows[0]) : null,
    }),
  )
}

/** Adiciona outro período de ausência (licença, atestado, etc.). */
export async function createMyAbsence(req: Request, res: Response) {
  const userId = req.user!.id
  const role = req.user!.role

  const startDate = parseDateInput(req.body?.startDate)
  const endDate = parseDateInput(req.body?.endDate)
  const rawType =
    typeof req.body?.absenceType === 'string' ? req.body.absenceType.trim() : ''
  const absenceType: AbsenceType =
    rawType && isAbsenceType(rawType) ? rawType : 'outro'
  const absenceLabel =
    typeof req.body?.absenceLabel === 'string' ? req.body.absenceLabel.trim() : ''

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
      error: 'A ausência deve ter data de fim a partir de hoje.',
    })
    return
  }

  if (absenceType === 'ferias') {
    res.status(400).json({
      error: 'Para férias, use o campo de próximo período de férias.',
    })
    return
  }

  if (absenceType === 'outro' && !absenceLabel) {
    res.status(400).json({
      error: 'Descreva qual será a ausência.',
    })
    return
  }

  const storedLabel = absenceType === 'outro' ? absenceLabel : ''

  const inserted = await query<VacationPeriodRow>(
    `INSERT INTO user_vacation_periods (user_id, start_date, end_date, absence_type, absence_label)
     VALUES ($1, $2::date, $3::date, $4, $5)
     RETURNING id, user_id, start_date::text AS start_date, end_date::text AS end_date,
               absence_type, COALESCE(absence_label, '') AS absence_label,
               created_at, updated_at`,
    [userId, startDate, endDate, absenceType, storedLabel],
  )

  const periodView = inserted.rows[0] ? toPeriodView(inserted.rows[0]) : null

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'user',
    entityId: userId,
    summary: `Ausência (${periodView?.absenceTypeLabel ?? ABSENCE_TYPE_LABELS[absenceType]}) registrada: ${startDate} a ${endDate}.`,
    newData: {
      startDate,
      endDate,
      absenceType,
      absenceLabel: storedLabel || undefined,
    },
  })

  res.status(201).json(
    await agendaResponse(userId, role, {
      period: periodView,
    }),
  )
}

export async function deleteMyAbsence(req: Request, res: Response) {
  const userId = req.user!.id
  const role = req.user!.role
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Identificador inválido.' })
    return
  }

  const deleted = await query<{ id: number; absence_type: string }>(
    `DELETE FROM user_vacation_periods
     WHERE id = $1 AND user_id = $2
     RETURNING id, absence_type`,
    [id, userId],
  )
  if (!deleted.rows[0]) {
    res.status(404).json({ error: 'Período não encontrado.' })
    return
  }

  await writeAuditLog(req, {
    action: 'delete',
    entityType: 'user',
    entityId: userId,
    summary: `Período de ausência removido (#${id}).`,
    oldData: deleted.rows[0],
  })

  res.json(await agendaResponse(userId, role))
}

export const vacationRoutes = {
  getMine: [requireAuth, getMyAgenda],
  upsertMine: [requireAuth, upsertMyNextVacation],
  createAbsence: [requireAuth, createMyAbsence],
  deleteAbsence: [requireAuth, deleteMyAbsence],
}
