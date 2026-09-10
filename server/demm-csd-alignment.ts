import { query } from './db.js'
import { ENTRADA_TRAIL_STEP } from './lab-trail-status.js'
import { normalizeScheduleMeter } from './numeric-field-validation.js'

export const DEMM_CSD_WRONG_KIND = 'demm_csd_wrong'
export const DEMM_CSD_WRONG_DESCRIPTION = 'Medidor cadastrado no CSD errado'

const NORMALIZED_METER_SQL = `LPAD(RIGHT(REGEXP_REPLACE(meter, '[^0-9]', '', 'g'), 8), 8, '0')`

function metersFromExtracted(extracted: unknown): string[] {
  if (!Array.isArray(extracted)) return []
  return extracted
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object' && 'meter' in item) {
        return String((item as { meter?: unknown }).meter ?? '')
      }
      return ''
    })
    .filter((meter) => meter.trim() !== '')
}

function isToiTeamSchedule(row: {
  toi_collaborator1_registration: string
  toi_collaborator2_registration: string
  toi_team_reason: string
}) {
  return Boolean(
    row.toi_collaborator1_registration.trim() ||
      row.toi_collaborator2_registration.trim() ||
      row.toi_team_reason.trim(),
  )
}

function resolveDeviationCollaborators(row: {
  toi_collaborator1_name: string
  toi_collaborator1_registration: string
  toi_collaborator2_name: string
  toi_collaborator2_registration: string
  toi_team_reason: string
  partner_name: string
  partner_registration: string
  created_by_name: string | null
  created_by_registration: string | null
}) {
  if (isToiTeamSchedule(row)) {
    return {
      collaborator1Name: row.toi_collaborator1_name.trim() || (row.created_by_name ?? '').trim(),
      collaborator1Registration:
        row.toi_collaborator1_registration.trim() || (row.created_by_registration ?? '').trim(),
      collaborator2Name: row.toi_collaborator2_name.trim(),
      collaborator2Registration: row.toi_collaborator2_registration.trim(),
    }
  }

  return {
    collaborator1Name: (row.created_by_name ?? '').trim(),
    collaborator1Registration: (row.created_by_registration ?? '').trim(),
    collaborator2Name: row.partner_name.trim(),
    collaborator2Registration: row.partner_registration.trim(),
  }
}

export async function alignSchedulesCsdFromDemm(params: {
  meters: string[]
  demmCsdName: string
}): Promise<number> {
  const demmCsd = params.demmCsdName.trim()
  if (!demmCsd || !params.meters.length) return 0

  const normalizedMeters = [
    ...new Set(params.meters.map((meter) => normalizeScheduleMeter(meter)).filter(Boolean)),
  ]
  if (!normalizedMeters.length) return 0

  const schedules = await query<{
    id: string
    meter: string
    csd: string
    toi_collaborator1_name: string
    toi_collaborator1_registration: string
    toi_collaborator2_name: string
    toi_collaborator2_registration: string
    toi_team_reason: string
    partner_name: string
    partner_registration: string
    created_by_user_id: string | null
    created_by_name: string | null
    created_by_registration: string | null
  }>(
    `SELECT ms.id,
            ms.meter,
            ms.csd,
            COALESCE(ms.toi_collaborator1_name, '') AS toi_collaborator1_name,
            COALESCE(ms.toi_collaborator1_registration, '') AS toi_collaborator1_registration,
            COALESCE(ms.toi_collaborator2_name, '') AS toi_collaborator2_name,
            COALESCE(ms.toi_collaborator2_registration, '') AS toi_collaborator2_registration,
            COALESCE(ms.toi_team_reason, '') AS toi_team_reason,
            COALESCE(ms.partner_name, '') AS partner_name,
            COALESCE(ms.partner_registration, '') AS partner_registration,
            ms.created_by_user_id,
            u.name AS created_by_name,
            u.registration AS created_by_registration
     FROM meter_schedules ms
     LEFT JOIN users u ON u.id = ms.created_by_user_id
     WHERE ms.delay_dismissed_at IS NULL
       AND ms.trail_step = $2
       AND LPAD(RIGHT(REGEXP_REPLACE(ms.meter, '[^0-9]', '', 'g'), 8), 8, '0') = ANY($1::text[])
       AND UPPER(TRIM(ms.csd)) <> UPPER(TRIM($3))`,
    [normalizedMeters, ENTRADA_TRAIL_STEP, demmCsd],
  )

  let aligned = 0
  for (const row of schedules.rows) {
    const previousCsd = row.csd.trim()
    await query(`UPDATE meter_schedules SET csd = $2 WHERE id = $1`, [row.id, demmCsd])
    await query(
      `UPDATE meter_registry
       SET csd = $2
       WHERE ${NORMALIZED_METER_SQL} = $1
         AND UPPER(TRIM(csd)) <> UPPER(TRIM($2))`,
      [normalizeScheduleMeter(row.meter), demmCsd],
    )

    const people = resolveDeviationCollaborators(row)
    const existing = await query<{ id: string }>(
      `SELECT id FROM toi_schedule_deviations
       WHERE meter_schedule_id = $1 AND kind = $2
       LIMIT 1`,
      [row.id, DEMM_CSD_WRONG_KIND],
    )

    if (existing.rows[0]) {
      await query(
        `UPDATE toi_schedule_deviations
         SET scheduled_label = $2,
             document_label = $3,
             description = $4,
             collaborator1_name = $5,
             collaborator1_registration = $6,
             collaborator2_name = $7,
             collaborator2_registration = $8
         WHERE id = $1`,
        [
          existing.rows[0].id,
          previousCsd,
          demmCsd,
          DEMM_CSD_WRONG_DESCRIPTION,
          people.collaborator1Name,
          people.collaborator1Registration,
          people.collaborator2Name,
          people.collaborator2Registration,
        ],
      )
    } else {
      await query(
        `INSERT INTO toi_schedule_deviations (
           id, meter_schedule_id, meter, kind, description,
           scheduled_label, document_label, previous_scheduled_at, adjusted_scheduled_at,
           collaborator1_name, collaborator1_registration,
           collaborator2_name, collaborator2_registration, created_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW(),$8,$9,$10,$11,$12)`,
        [
          `demm-csd-${row.id}`,
          row.id,
          row.meter,
          DEMM_CSD_WRONG_KIND,
          DEMM_CSD_WRONG_DESCRIPTION,
          previousCsd,
          demmCsd,
          people.collaborator1Name,
          people.collaborator1Registration,
          people.collaborator2Name,
          people.collaborator2Registration,
          row.created_by_user_id,
        ],
      )
    }

    aligned += 1
  }

  return aligned
}

export async function alignSchedulesCsdFromExistingDemms() {
  const docs = await query<{ extracted_meters: unknown; csd_name: string }>(
    `SELECT d.extracted_meters, c.name AS csd_name
     FROM demm_documents d
     JOIN csds c ON c.id = d.csd_id
     WHERE TRIM(COALESCE(c.name, '')) <> ''`,
  )

  for (const row of docs.rows) {
    await alignSchedulesCsdFromDemm({
      meters: metersFromExtracted(row.extracted_meters),
      demmCsdName: row.csd_name,
    })
  }
}
