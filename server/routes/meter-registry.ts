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
