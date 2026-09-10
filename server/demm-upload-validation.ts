import { query } from './db.js'
import { ENTRADA_TRAIL_STEP, getStatusAvailabilityLabel, hasMeterEntradaGiven } from './lab-trail-status.js'
import { NORMALIZED_METER_SQL } from './demm-meter-analysis.js'
import { normalizeScheduleMeter } from './numeric-field-validation.js'
import { loadInspectionAnalysisStatusByMeter } from './routes/meter-inspection-documents.js'

export type DemmUploadConflict = {
  meter: string
  reason: 'demm_registered' | 'entrada_given'
  detail: string
}

export type DemmReplacementPlan = {
  deleteIds: string[]
  strip: Array<{ demmId: string; remainingMeters: unknown[] }>
}

export type DemmUploadValidationResult =
  | { ok: true; replacement: DemmReplacementPlan }
  | { ok: false; conflicts: DemmUploadConflict[]; error: string }

function emptyReplacement(): DemmReplacementPlan {
  return { deleteIds: [], strip: [] }
}

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

function extractedMeterValue(item: unknown): string {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object' && 'meter' in item) {
    return String((item as { meter?: unknown }).meter ?? '')
  }
  return ''
}

function metersFromExtracted(extracted: unknown): string[] {
  if (!Array.isArray(extracted)) return []
  return extracted.map(extractedMeterValue).filter((meter) => meter.trim() !== '')
}

async function demmHasEntradaGiven(meters: string[]): Promise<boolean> {
  if (!meters.length) return false
  const uniqueMeters = [...new Set(meters)]
  const [pastEntrada, ratmMeters, registeredMeters] = await Promise.all([
    query<{ meter: string }>(
      `SELECT meter FROM meter_schedules
       WHERE meter = ANY($1::text[]) AND trail_step <> $2
       LIMIT 1`,
      [uniqueMeters, ENTRADA_TRAIL_STEP],
    ),
    query<{ meter: string }>(
      `SELECT meter FROM ratm_laudos WHERE meter = ANY($1::text[]) LIMIT 1`,
      [uniqueMeters],
    ),
    query<{ meter: string; status: string }>(
      `SELECT meter, status FROM meter_registry WHERE meter = ANY($1::text[])`,
      [uniqueMeters],
    ),
  ])
  if (pastEntrada.rows[0] || ratmMeters.rows[0]) return true
  return registeredMeters.rows.some((row) => hasMeterEntradaGiven(row.status))
}

async function demmHasBlockedMeters(meters: string[]): Promise<boolean> {
  if (!meters.length) return false
  const normalizedMeters = [...new Set(meters.map((meter) => normalizeScheduleMeter(meter)).filter(Boolean))]
  const [status, scheduled] = await Promise.all([
    loadInspectionAnalysisStatusByMeter(meters),
    query<{ norm: string }>(
      `SELECT DISTINCT ${NORMALIZED_METER_SQL} AS norm
       FROM meter_schedules
       WHERE delay_dismissed_at IS NULL
         AND ${NORMALIZED_METER_SQL} = ANY($1::text[])`,
      [normalizedMeters],
    ),
  ])
  const scheduledNorms = new Set(scheduled.rows.map((row) => row.norm))
  return meters.some((meter) => {
    const norm = normalizeScheduleMeter(meter)
    return scheduledNorms.has(norm) && status.get(norm)?.blocked === true
  })
}

export async function applyDemmReplacements(plan: DemmReplacementPlan) {
  for (const id of plan.deleteIds) {
    await query(`DELETE FROM demm_documents WHERE id = $1`, [id])
  }
  for (const item of plan.strip) {
    await query(`UPDATE demm_documents SET extracted_meters = $2::jsonb WHERE id = $1`, [
      item.demmId,
      JSON.stringify(item.remainingMeters),
    ])
  }
}

export async function validateDemmUploadMeters(
  meters: string[],
  options?: { csdId?: string },
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
  const entradaMeters = new Set<string>()

  const pastEntrada = await query<{ meter: string; trail_step: string }>(
    `SELECT meter, trail_step
     FROM meter_schedules
     WHERE meter = ANY($1::text[]) AND trail_step <> $2`,
    [uniqueMeters, ENTRADA_TRAIL_STEP],
  )

  for (const row of pastEntrada.rows) {
    entradaMeters.add(row.meter)
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
    entradaMeters.add(row.meter)
    if (conflicts.has(row.meter)) continue
    conflicts.set(row.meter, {
      meter: row.meter,
      reason: 'entrada_given',
      detail: 'RATM',
    })
  }

  const registeredMeters = await query<{ meter: string; status: string }>(
    `SELECT meter, status FROM meter_registry WHERE meter = ANY($1::text[])`,
    [uniqueMeters],
  )

  for (const row of registeredMeters.rows) {
    if (!hasMeterEntradaGiven(row.status)) continue
    entradaMeters.add(row.meter)
    if (conflicts.has(row.meter)) continue
    conflicts.set(row.meter, {
      meter: row.meter,
      reason: 'entrada_given',
      detail: getStatusAvailabilityLabel(row.status),
    })
  }

  const existingDemm = await query<{
    id: string
    csd_id: string | null
    meter: string
    file_name: string
    document_number: string | null
    extracted_meters: unknown
  }>(
    `SELECT d.id, d.csd_id, elem->>'meter' AS meter, d.file_name, d.document_number, d.extracted_meters
     FROM demm_documents d
     CROSS JOIN LATERAL jsonb_array_elements(d.extracted_meters) AS elem
     WHERE elem->>'meter' = ANY($1::text[])`,
    [uniqueMeters],
  )

  const demms = new Map<
    string,
    {
      id: string
      csdId: string | null
      fileName: string
      documentNumber: string | null
      extractedMeters: unknown
      overlappingMeters: string[]
    }
  >()

  for (const row of existingDemm.rows) {
    if (!row.meter) continue
    let current = demms.get(row.id)
    if (!current) {
      current = {
        id: row.id,
        csdId: row.csd_id,
        fileName: row.file_name,
        documentNumber: row.document_number,
        extractedMeters: row.extracted_meters,
        overlappingMeters: [],
      }
      demms.set(row.id, current)
    }
    if (!current.overlappingMeters.includes(row.meter)) {
      current.overlappingMeters.push(row.meter)
    }
  }

  const replacement = emptyReplacement()
  const replaceableMeters = new Set<string>()

  for (const demm of demms.values()) {
    const pendingOverlap = demm.overlappingMeters.filter((meter) => !entradaMeters.has(meter))
    if (!pendingOverlap.length) continue

    const hasBlocked = await demmHasBlockedMeters(metersFromExtracted(demm.extractedMeters))
    if (!hasBlocked) {
      const label = demm.documentNumber?.trim() || demm.fileName
      for (const meter of pendingOverlap) {
        if (conflicts.has(meter) || replaceableMeters.has(meter)) continue
        conflicts.set(meter, {
          meter,
          reason: 'demm_registered',
          detail: label,
        })
      }
      continue
    }

    for (const meter of pendingOverlap) {
      replaceableMeters.add(meter)
      if (conflicts.get(meter)?.reason === 'demm_registered') {
        conflicts.delete(meter)
      }
    }

    const sameCsd = Boolean(options?.csdId && demm.csdId === options.csdId)
    const demmMeters = metersFromExtracted(demm.extractedMeters)
    const demmHasOtherEntrada = sameCsd
      ? await demmHasEntradaGiven(demmMeters.filter((meter) => !pendingOverlap.includes(meter)))
      : false

    if (sameCsd && !demmHasOtherEntrada) {
      replacement.deleteIds.push(demm.id)
      continue
    }

    const remaining = Array.isArray(demm.extractedMeters)
      ? demm.extractedMeters.filter((item) => !pendingOverlap.includes(extractedMeterValue(item)))
      : []
    if (!remaining.length) {
      replacement.deleteIds.push(demm.id)
    } else {
      replacement.strip.push({ demmId: demm.id, remainingMeters: remaining })
    }
  }

  if (conflicts.size) {
    const conflictList = [...conflicts.values()]
    return {
      ok: false,
      conflicts: conflictList,
      error: buildValidationError(conflictList),
    }
  }

  return { ok: true, replacement }
}
