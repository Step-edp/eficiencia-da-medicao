import type { Request, Response } from 'express'
import { query } from '../db.js'
import {
  ENTRADA_TRAIL_STEP,
  ENSAIAR_TRAIL_STEP,
  APROVACAO_TRAIL_STEP,
  SUCATA_TRAIL_STEP,
} from '../lab-trail-status.js'

const TRAIL_STEPS = [
  ENTRADA_TRAIL_STEP,
  ENSAIAR_TRAIL_STEP,
  APROVACAO_TRAIL_STEP,
  'Pesquisa de satisfação',
  SUCATA_TRAIL_STEP,
  'Agendar',
]

export async function getMeterRegistryTrailCounts(_req: Request, res: Response) {
  const registryCounts = await query<{ trail_step: string; total: string }>(
    `SELECT trail_step, COUNT(*)::text AS total
     FROM meter_registry
     GROUP BY trail_step`,
  )

  const scheduleCounts = await query<{ trail_step: string; total: string }>(
    `SELECT trail_step, COUNT(*)::text AS total
     FROM meter_schedules
     WHERE delay_dismissed_at IS NULL
     GROUP BY trail_step`,
  )

  const counts: Record<string, number> = Object.fromEntries(TRAIL_STEPS.map((step) => [step, 0]))

  for (const row of registryCounts.rows) {
    counts[row.trail_step] = (counts[row.trail_step] ?? 0) + Number(row.total ?? 0)
  }

  for (const row of scheduleCounts.rows) {
    counts[row.trail_step] = (counts[row.trail_step] ?? 0) + Number(row.total ?? 0)
  }

  res.json({ counts })
}

export async function syncMeterRegistryTrailSteps(): Promise<number> {
  const result = await query<{ count: string }>(
    `WITH updated AS (
       UPDATE meter_registry
       SET trail_step = CASE status
         WHEN 'Agendado' THEN $1
         WHEN 'Recebido' THEN $2
         WHEN 'Ensaiado' THEN $3
         WHEN 'Aprovado' THEN $4
         ELSE trail_step
       END
       RETURNING 1
     )
     SELECT COUNT(*)::text AS count FROM updated`,
    [ENTRADA_TRAIL_STEP, ENSAIAR_TRAIL_STEP, APROVACAO_TRAIL_STEP, SUCATA_TRAIL_STEP],
  )

  return Number(result.rows[0]?.count ?? 0)
}

type MeterRegistryRow = {
  meter: string
  installation: string
  toi: string
  note: string
  csd: string
  client: string
  status: string
  trail_step: string
  manufacturer: string
  model: string
  ratm_number: string | null
  delivered_by: string | null
  scheduling_notes: string
  available_at: Date | null
  scheduled_at: Date | null
  received_at: Date | null
}

function mapMeterRegistry(row: MeterRegistryRow) {
  return {
    meter: row.meter,
    installation: row.installation,
    toi: row.toi,
    note: row.note,
    csd: row.csd,
    client: row.client,
    status: row.status,
    trailStep: row.trail_step,
    manufacturer: row.manufacturer,
    model: row.model,
    ratmNumber: row.ratm_number,
    deliveredBy: row.delivered_by,
    schedulingNotes: row.scheduling_notes,
    availableAt: row.available_at?.toISOString() ?? null,
    scheduledAt: row.scheduled_at?.toISOString() ?? null,
    receivedAt: row.received_at?.toISOString() ?? null,
  }
}

export async function getMeterRegistry(req: Request, res: Response) {
  const meter =
    typeof req.query.meter === 'string' && req.query.meter.trim()
      ? req.query.meter.trim()
      : ''

  if (!meter) {
    res.status(400).json({ error: 'Informe o número do medidor.' })
    return
  }

  const result = await query<MeterRegistryRow>(
    `SELECT meter, installation, toi, note, csd, client, status, trail_step,
            manufacturer, model, ratm_number, delivered_by, scheduling_notes,
            available_at, scheduled_at, received_at
     FROM meter_registry
     WHERE meter = $1`,
    [meter],
  )

  res.json({
    meter,
    registry: result.rows[0] ? mapMeterRegistry(result.rows[0]) : null,
  })
}
