import { query } from './db.js'

const ENTRADA_TRAIL_STEP = 'Entrada de medidores'

export type DemmUploadConflict = {
  meter: string
  reason: 'demm_registered' | 'entrada_given'
  detail: string
}

export type DemmUploadValidationResult =
  | { ok: true }
  | { ok: false; conflicts: DemmUploadConflict[]; error: string }

function buildValidationError(conflicts: DemmUploadConflict[]): string {
  const inDemm = conflicts.filter((item) => item.reason === 'demm_registered')
  const withEntrada = conflicts.filter((item) => item.reason === 'entrada_given')

  const parts: string[] = []

  if (inDemm.length) {
    const meters = inDemm.map((item) => item.meter).join(', ')
    parts.push(`medidor(es) ${meters} já consta(m) em outra DEMM`)
  }

  if (withEntrada.length) {
    const meters = withEntrada.map((item) => item.meter).join(', ')
    parts.push(`medidor(es) ${meters} já teve(ram) entrada no laboratório`)
  }

  return `A DEMM não pode ser cadastrada: ${parts.join('; ')}.`
}

export async function validateDemmUploadMeters(
  meters: string[],
): Promise<DemmUploadValidationResult> {
  if (!meters.length) {
    return {
      ok: false,
      conflicts: [],
      error: 'Nenhum medidor foi identificado no PDF da DEMM.',
    }
  }

  const uniqueMeters = [...new Set(meters)]
  const conflicts = new Map<string, DemmUploadConflict>()

  const existingDemm = await query<{ meter: string; file_name: string; document_number: string | null }>(
    `SELECT DISTINCT elem->>'meter' AS meter, d.file_name, d.document_number
     FROM demm_documents d
     CROSS JOIN LATERAL jsonb_array_elements(d.extracted_meters) AS elem
     WHERE elem->>'meter' = ANY($1::text[])`,
    [uniqueMeters],
  )

  for (const row of existingDemm.rows) {
    if (!row.meter || conflicts.has(row.meter)) continue
    const label = row.document_number?.trim() || row.file_name
    conflicts.set(row.meter, {
      meter: row.meter,
      reason: 'demm_registered',
      detail: label,
    })
  }

  const pastEntrada = await query<{ meter: string; trail_step: string }>(
    `SELECT meter, trail_step
     FROM meter_schedules
     WHERE meter = ANY($1::text[]) AND trail_step <> $2`,
    [uniqueMeters, ENTRADA_TRAIL_STEP],
  )

  for (const row of pastEntrada.rows) {
    if (conflicts.has(row.meter)) continue
    conflicts.set(row.meter, {
      meter: row.meter,
      reason: 'entrada_given',
      detail: row.trail_step,
    })
  }

  const ratmMeters = await query<{ meter: string }>(
    `SELECT DISTINCT meter FROM ratm_laudos WHERE meter = ANY($1::text[])`,
    [uniqueMeters],
  )

  for (const row of ratmMeters.rows) {
    if (conflicts.has(row.meter)) continue
    conflicts.set(row.meter, {
      meter: row.meter,
      reason: 'entrada_given',
      detail: 'RATM',
    })
  }

  if (!conflicts.size) {
    return { ok: true }
  }

  const conflictList = [...conflicts.values()]
  return {
    ok: false,
    conflicts: conflictList,
    error: buildValidationError(conflictList),
  }
}
