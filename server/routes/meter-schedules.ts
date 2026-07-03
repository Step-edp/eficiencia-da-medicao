import type { Request, Response } from 'express'
import { query } from '../db.js'
import { writeAuditLog } from '../audit.js'
import { validateScheduleNumericField } from '../numeric-field-validation.js'
import {
  findNextAvailableSlot,
  formatAvailableSlot,
} from '../schedule-slots.js'

export const ENTRADA_TRAIL_STEP = 'Entrada de medidores'

type MeterScheduleRow = {
  id: string
  meter: string
  installation: string
  toi: string
  note: string
  csd: string
  client_present: 'sim' | 'nao'
  scheduling_notes: string
  scheduled_at: Date
  trail_step: string
  source: string
  created_at: Date
  created_by_user_id: string | null
  created_by_registration: string | null
}

function mapMeterSchedule(row: MeterScheduleRow) {
  return {
    id: row.id,
    meter: row.meter,
    installation: row.installation,
    toi: row.toi,
    note: row.note,
    csd: row.csd,
    clientPresent: row.client_present,
    schedulingNotes: row.scheduling_notes,
    scheduledAt: row.scheduled_at.toISOString(),
    scheduledAtLabel: formatAvailableSlot(row.scheduled_at),
    trailStep: row.trail_step,
    source: row.source,
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
    createdByRegistration: row.created_by_registration,
  }
}

export async function listMeterSchedules(req: Request, res: Response) {
  const trailStep =
    typeof req.query.trailStep === 'string' && req.query.trailStep.trim()
      ? req.query.trailStep.trim()
      : ENTRADA_TRAIL_STEP

  const result = await query<MeterScheduleRow>(
    `SELECT ms.*, u.registration AS created_by_registration
     FROM meter_schedules ms
     LEFT JOIN users u ON u.id = ms.created_by_user_id
     WHERE ms.trail_step = $1
     ORDER BY ms.scheduled_at ASC, ms.created_at DESC`,
    [trailStep],
  )

  res.json({
    schedules: result.rows.map(mapMeterSchedule),
    total: result.rowCount ?? 0,
  })
}

export async function countMeterSchedules(req: Request, res: Response) {
  const trailStep =
    typeof req.query.trailStep === 'string' && req.query.trailStep.trim()
      ? req.query.trailStep.trim()
      : ENTRADA_TRAIL_STEP

  const result = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM meter_schedules WHERE trail_step = $1`,
    [trailStep],
  )

  res.json({ total: Number(result.rows[0]?.total ?? 0), trailStep })
}

export async function createMeterSchedule(req: Request, res: Response) {
  const {
    meter,
    installation,
    toi,
    note,
    csd,
    clientPresent,
    schedulingNotes,
  } = req.body as {
    meter?: string
    installation?: string
    toi?: string
    note?: string
    csd?: string
    clientPresent?: string
    schedulingNotes?: string
  }

  const normalized = {
    meter: meter?.trim() ?? '',
    installation: installation?.trim() ?? '',
    toi: toi?.trim() ?? '',
    note: note?.trim() ?? '',
    csd: csd?.trim() ?? '',
    clientPresent: clientPresent?.trim() ?? '',
    schedulingNotes: schedulingNotes?.trim() ?? '',
  }

  for (const [value, field] of [
    [normalized.meter, 'medidor'],
    [normalized.installation, 'instalacao'],
    [normalized.toi, 'toi'],
    [normalized.note, 'nota'],
  ] as const) {
    const error = validateScheduleNumericField(value, field)
    if (error) {
      res.status(400).json({ error })
      return
    }
  }

  if (!normalized.csd) {
    res.status(400).json({ error: 'Selecione um CSD.' })
    return
  }

  if (normalized.clientPresent !== 'sim' && normalized.clientPresent !== 'nao') {
    res.status(400).json({ error: 'Informe se o cliente está presente.' })
    return
  }

  const duplicate = await query<{ id: string }>(
    `SELECT id FROM meter_schedules
     WHERE meter = $1 AND trail_step = $2
     LIMIT 1`,
    [normalized.meter, ENTRADA_TRAIL_STEP],
  )

  if (duplicate.rows[0]) {
    res.status(409).json({
      error: `O medidor ${normalized.meter} já está agendado e aguardando entrada no laboratório.`,
    })
    return
  }

  const blocks = await query<{ blocked_date: string }>(
    `SELECT blocked_date::text FROM ensaios_manual_blocks`,
  )
  const manualBlocks = new Set(blocks.rows.map((block) => block.blocked_date.slice(0, 10)))
  const nextSlot = findNextAvailableSlot(manualBlocks)

  if (!nextSlot) {
    res.status(409).json({
      error: 'Não há datas disponíveis no calendário nos próximos meses.',
    })
    return
  }

  const id = `schedule-${Date.now()}-${normalized.meter}`

  const insert = await query<Omit<MeterScheduleRow, 'created_by_registration'>>(
    `INSERT INTO meter_schedules (
      id, meter, installation, toi, note, csd, client_present,
      scheduling_notes, scheduled_at, trail_step, source, created_by_user_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'field_team',$11)
    RETURNING *`,
    [
      id,
      normalized.meter,
      normalized.installation,
      normalized.toi,
      normalized.note,
      normalized.csd,
      normalized.clientPresent,
      normalized.schedulingNotes,
      nextSlot.toISOString(),
      ENTRADA_TRAIL_STEP,
      req.user?.id ?? null,
    ],
  )

  const schedule = mapMeterSchedule({
    ...insert.rows[0],
    created_by_registration: req.user?.registration ?? null,
  })

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'meter_schedule',
    entityId: schedule.id,
    summary: `Medidor ${schedule.meter} agendado para ${schedule.scheduledAtLabel}`,
    newData: schedule,
  })

  res.status(201).json({ schedule })
}
