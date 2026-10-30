import { query } from './db.js'
import { normalizedMeterColumnSql } from './lab-trail-status.js'

const NORM = `LPAD(RIGHT(REGEXP_REPLACE(meter, '[^0-9]', '', 'g'), 8), 8, '0')`

const STATUS_SQL = `
  CASE
    WHEN trail_step IN ('Sucata', 'Pesquisa de satisfação') THEN 'Aprovado'
    WHEN trail_step = 'Aprovação de RATM' THEN 'Ensaiado'
    WHEN received_at IS NOT NULL THEN 'Recebido'
    ELSE 'Agendado'
  END
`

/**
 * Cria a linha de cadastro a partir do agendamento quando o medidor
 * nunca entrou na base importada. O recebimento só atualiza essa base
 * se a linha já existir.
 */
export async function ensureMeterRegistryFromSchedules(meterKey?: string) {
  const params = meterKey ? [meterKey] : []
  const meterFilter = meterKey ? `AND ${NORM} = $1` : ''

  await query(
    `INSERT INTO meter_registry (
       id, legacy_id, meter, installation, toi, note, csd, status, trail_step,
       scheduling_notes, scheduled_at, received_at
     )
     SELECT
       'registry-' || picked.id,
       -picked.n,
       picked.meter,
       picked.installation,
       picked.toi,
       picked.note,
       picked.csd,
       picked.status,
       picked.trail_step,
       COALESCE(picked.scheduling_notes, ''),
       picked.scheduled_at,
       picked.received_at
     FROM (
       SELECT
         ms.id,
         ms.meter,
         ms.installation,
         ms.toi,
         ms.note,
         ms.csd,
         ms.trail_step,
         ms.scheduling_notes,
         ms.scheduled_at,
         ms.received_at,
         ROW_NUMBER() OVER (ORDER BY ms.created_at, ms.id) AS n,
         ${STATUS_SQL} AS status
       FROM (
         SELECT DISTINCT ON (${NORM})
           id, meter, installation, toi, note, csd, trail_step, scheduling_notes,
           scheduled_at, received_at, created_at
         FROM meter_schedules
         WHERE delay_dismissed_at IS NULL
           AND BTRIM(COALESCE(meter, '')) <> ''
           ${meterFilter}
         ORDER BY ${NORM}, received_at DESC NULLS LAST, scheduled_at DESC NULLS LAST, created_at DESC
       ) ms
     ) picked
     WHERE NOT EXISTS (
       SELECT 1
       FROM meter_registry mr
       WHERE ${normalizedMeterColumnSql('mr')} = LPAD(RIGHT(REGEXP_REPLACE(picked.meter, '[^0-9]', '', 'g'), 8), 8, '0')
     )
     ON CONFLICT (meter) DO NOTHING`,
    params,
  )
}
