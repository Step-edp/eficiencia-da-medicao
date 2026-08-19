import { query } from './db.js'
import { formatAvailableSlot } from './schedule-slots.js'
import { normalizeScheduleMeter } from './numeric-field-validation.js'

const ENTRADA_TRAIL_STEP = 'Entrada de medidores'

export type DemmMeterAnalysis = {
  meter: string
  scheduled: boolean
  scheduleId: string | null
  scheduledAtLabel: string | null
}

const NORMALIZED_METER_SQL = `LPAD(RIGHT(REGEXP_REPLACE(meter, '[^0-9]', '', 'g'), 8), 8, '0')`

export async function analyzeDemmMeters(meters: string[]): Promise<DemmMeterAnalysis[]> {
  if (!meters.length) return []

  const normalizedMeters = [...new Set(meters.map((meter) => normalizeScheduleMeter(meter)))]

  const schedules = await query<{
    id: string
    meter: string
    scheduled_at: Date
  }>(
    `SELECT id, meter, scheduled_at
     FROM meter_schedules
     WHERE trail_step = $2
       AND ${NORMALIZED_METER_SQL} = ANY($1::text[])`,
    [normalizedMeters, ENTRADA_TRAIL_STEP],
  )

  const scheduleByMeter = new Map(
    schedules.rows.map((row) => [
      normalizeScheduleMeter(row.meter),
      {
        id: row.id,
        scheduledAtLabel: formatAvailableSlot(row.scheduled_at),
      },
    ]),
  )

  return meters.map((meter) => {
    const schedule = scheduleByMeter.get(normalizeScheduleMeter(meter))
    return {
      meter,
      scheduled: Boolean(schedule),
      scheduleId: schedule?.id ?? null,
      scheduledAtLabel: schedule?.scheduledAtLabel ?? null,
    }
  })
}
