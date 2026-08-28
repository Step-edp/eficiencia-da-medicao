import { query } from './db.js'
import { formatAvailableSlot } from './schedule-slots.js'
import { normalizeScheduleMeter } from './numeric-field-validation.js'
import { ENTRADA_TRAIL_STEP, hasMeterEntradaGiven } from './lab-trail-status.js'

export const NORMALIZED_METER_SQL = `LPAD(RIGHT(REGEXP_REPLACE(meter, '[^0-9]', '', 'g'), 8), 8, '0')`

export type DemmMeterAppStatus = 'nao_agendado' | 'agendado' | 'recebido' | 'ensaiado' | 'aprovado'

export type DemmMeterAnalysis = {
  meter: string
  scheduled: boolean
  scheduleId: string | null
  scheduledAtLabel: string | null
  appStatus: DemmMeterAppStatus
}

function resolveDemmMeterAppStatus(
  schedule: { trail_step: string } | undefined,
  registryStatus: string | null | undefined,
): DemmMeterAppStatus {
  if (!schedule) return 'nao_agendado'

  const status = registryStatus?.trim()
  if (status === 'Aprovado') return 'aprovado'
  if (status === 'Ensaiado') return 'ensaiado'
  if (status === 'Recebido' || hasMeterEntradaGiven(status ?? '')) return 'recebido'
  if (schedule.trail_step.trim() !== ENTRADA_TRAIL_STEP) return 'recebido'
  return 'agendado'
}

export async function analyzeDemmMeters(meters: string[]): Promise<DemmMeterAnalysis[]> {
  if (!meters.length) return []

  const normalizedMeters = [...new Set(meters.map((meter) => normalizeScheduleMeter(meter)))]

  const [schedules, registryRows] = await Promise.all([
    query<{
      id: string
      meter: string
      scheduled_at: Date
      trail_step: string
    }>(
      `SELECT DISTINCT ON (${NORMALIZED_METER_SQL}) id, meter, scheduled_at, trail_step
       FROM meter_schedules
       WHERE delay_dismissed_at IS NULL
         AND ${NORMALIZED_METER_SQL} = ANY($1::text[])
       ORDER BY ${NORMALIZED_METER_SQL}, created_at DESC`,
      [normalizedMeters],
    ),
    query<{ norm: string; status: string }>(
      `SELECT ${NORMALIZED_METER_SQL} AS norm, status
       FROM meter_registry
       WHERE ${NORMALIZED_METER_SQL} = ANY($1::text[])`,
      [normalizedMeters],
    ),
  ])

  const scheduleByMeter = new Map(
    schedules.rows.map((row) => [
      normalizeScheduleMeter(row.meter),
      {
        id: row.id,
        trailStep: row.trail_step,
        scheduledAtLabel: formatAvailableSlot(row.scheduled_at),
      },
    ]),
  )
  const registryByMeter = new Map(registryRows.rows.map((row) => [row.norm, row.status]))

  return meters.map((meter) => {
    const norm = normalizeScheduleMeter(meter)
    const schedule = scheduleByMeter.get(norm)
    const appStatus = resolveDemmMeterAppStatus(
      schedule ? { trail_step: schedule.trailStep } : undefined,
      registryByMeter.get(norm),
    )

    return {
      meter,
      scheduled: appStatus !== 'nao_agendado',
      scheduleId: schedule?.id ?? null,
      scheduledAtLabel: schedule?.scheduledAtLabel ?? null,
      appStatus,
    }
  })
}
