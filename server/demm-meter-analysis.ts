import { query } from './db.js'
import { formatAvailableSlot } from './schedule-slots.js'

const ENTRADA_TRAIL_STEP = 'Entrada de medidores'

export type DemmMeterAnalysis = {
  meter: string
  scheduled: boolean
  scheduleId: string | null
  scheduledAtLabel: string | null
}

export async function analyzeDemmMeters(meters: string[]): Promise<DemmMeterAnalysis[]> {
  if (!meters.length) return []

  const schedules = await query<{
    id: string
    meter: string
    scheduled_at: Date
  }>(
    `SELECT id, meter, scheduled_at
     FROM meter_schedules
     WHERE meter = ANY($1::text[]) AND trail_step = $2`,
    [meters, ENTRADA_TRAIL_STEP],
  )

  const scheduleByMeter = new Map(
    schedules.rows.map((row) => [
      row.meter,
      {
        id: row.id,
        scheduledAtLabel: formatAvailableSlot(row.scheduled_at),
      },
    ]),
  )

  return meters.map((meter) => {
    const schedule = scheduleByMeter.get(meter)
    return {
      meter,
      scheduled: Boolean(schedule),
      scheduleId: schedule?.id ?? null,
      scheduledAtLabel: schedule?.scheduledAtLabel ?? null,
    }
  })
}
