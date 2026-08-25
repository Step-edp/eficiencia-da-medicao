import { query } from './db.js'

export const FILLING_DEVIATION_SPECS = [
  {
    flag: 'installation_wrong',
    previous: 'previous_installation',
    current: 'installation',
    kind: 'filling_installation',
    description: 'Instalação digitada errada',
    correctedAt: 'installation_corrected_at',
    correctedBy: 'installation_corrected_by_user_id',
  },
  {
    flag: 'toi_wrong',
    previous: 'previous_toi',
    current: 'toi',
    kind: 'filling_toi',
    description: 'TOI digitado errado',
    correctedAt: 'toi_corrected_at',
    correctedBy: 'toi_corrected_by_user_id',
  },
  {
    flag: 'note_wrong',
    previous: 'previous_note',
    current: 'note',
    kind: 'filling_note',
    description: 'Nota digitada errada',
    correctedAt: 'note_corrected_at',
    correctedBy: 'note_corrected_by_user_id',
  },
  {
    flag: 'csd_wrong',
    previous: 'previous_csd',
    current: 'csd',
    kind: 'filling_csd',
    description: 'CSD digitado errado',
    correctedAt: 'csd_corrected_at',
    correctedBy: 'csd_corrected_by_user_id',
  },
] as const

export async function ensureFillingDeviationsFromSchedules() {
  for (const item of FILLING_DEVIATION_SPECS) {
    await query(
      `INSERT INTO toi_schedule_deviations (
         id, meter_schedule_id, meter, kind, description,
         scheduled_label, document_label, previous_scheduled_at, adjusted_scheduled_at,
         collaborator1_name, collaborator1_registration,
         collaborator2_name, collaborator2_registration, created_by_user_id, created_at
       )
       SELECT
         $1 || ms.id,
         ms.id,
         ms.meter,
         $2,
         $3,
         COALESCE(NULLIF(TRIM(ms.${item.previous}), ''), ms.${item.current}),
         ms.${item.current},
         COALESCE(ms.${item.correctedAt}, ms.created_at, NOW()),
         COALESCE(ms.${item.correctedAt}, ms.created_at, NOW()),
         COALESCE(ms.toi_collaborator1_name, ''),
         COALESCE(ms.toi_collaborator1_registration, ''),
         COALESCE(ms.toi_collaborator2_name, ''),
         COALESCE(ms.toi_collaborator2_registration, ''),
         ms.${item.correctedBy},
         COALESCE(ms.${item.correctedAt}, NOW())
       FROM meter_schedules ms
       WHERE ms.${item.flag}
         AND NOT EXISTS (
           SELECT 1 FROM toi_schedule_deviations d
           WHERE d.meter_schedule_id = ms.id AND d.kind = $2
         )`,
      [`fill-${item.kind}-`, item.kind, item.description],
    )
  }
}
