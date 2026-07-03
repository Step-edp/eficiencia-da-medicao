import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { query } from './db.js'
import { mapMeterStatusToTrailStep } from './lab-trail-status.js'

const REGISTRY_FILE = path.resolve(process.cwd(), 'data/base-medidores-comentada.xlsx')

const COL = {
  legacyId: 0,
  availableAt: 1,
  status: 3,
  receivedAt: 5,
  deliveredBy: 7,
  csd: 8,
  scheduledAt: 11,
  ratmNumber: 15,
  client: 16,
  installation: 17,
  meter: 18,
  toi: 20,
  manufacturer: 22,
  model: 23,
  note: 52,
  schedulingNotes: 56,
} as const

type ParsedRegistryRow = {
  legacyId: number
  meter: string
  installation: string
  toi: string
  note: string
  csd: string
  client: string
  status: string
  trailStep: string
  manufacturer: string
  model: string
  ratmNumber: string | null
  deliveredBy: string | null
  schedulingNotes: string
  availableAt: string | null
  scheduledAt: string | null
  receivedAt: string | null
}

function sanitizeDigits(value: unknown, maxLength?: number): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return maxLength ? digits.slice(0, maxLength) : digits
}

function parseText(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

function parseExcelDate(value: unknown): string | null {
  if (value == null || value === '') return null

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      return new Date(
        parsed.y,
        parsed.m - 1,
        parsed.d,
        parsed.H,
        parsed.M,
        Math.floor(parsed.S),
      ).toISOString()
    }
  }

  const text = String(value).trim()
  if (/^\d{13}$/.test(text)) {
    const date = new Date(Number(text))
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/)
  if (brMatch) {
    const [, day, month, year, hour = '0', minute = '0'] = brMatch
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    )
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  const generic = new Date(text)
  return Number.isNaN(generic.getTime()) ? null : generic.toISOString()
}

function mapTrailStep(status: string): string {
  return mapMeterStatusToTrailStep(status)
}

function parseWorksheetRows(rows: unknown[][]): ParsedRegistryRow[] {
  const byMeter = new Map<string, ParsedRegistryRow>()

  for (let index = 2; index < rows.length; index += 1) {
    const row = rows[index]
    if (!row?.length) continue

    const meter = sanitizeDigits(row[COL.meter], 8)
    if (!meter) continue

    const legacyId = Number(row[COL.legacyId])
    if (!Number.isFinite(legacyId)) continue

    const status = parseText(row[COL.status])
    const parsed: ParsedRegistryRow = {
      legacyId,
      meter,
      installation: sanitizeDigits(row[COL.installation], 9),
      toi: sanitizeDigits(row[COL.toi], 7),
      note: sanitizeDigits(row[COL.note], 11),
      csd: parseText(row[COL.csd]),
      client: parseText(row[COL.client]),
      status,
      trailStep: mapTrailStep(status),
      manufacturer: parseText(row[COL.manufacturer]),
      model: parseText(row[COL.model]),
      ratmNumber: parseText(row[COL.ratmNumber]) || null,
      deliveredBy: parseText(row[COL.deliveredBy]) || null,
      schedulingNotes: parseText(row[COL.schedulingNotes]),
      availableAt: parseExcelDate(row[COL.availableAt]),
      scheduledAt: parseExcelDate(row[COL.scheduledAt]),
      receivedAt: parseExcelDate(row[COL.receivedAt]),
    }

    const existing = byMeter.get(meter)
    if (!existing || parsed.legacyId > existing.legacyId) {
      byMeter.set(meter, parsed)
    }
  }

  return [...byMeter.values()].sort((left, right) => left.legacyId - right.legacyId)
}

export function loadMeterRegistryRowsFromFile(filePath = REGISTRY_FILE): ParsedRegistryRow[] {
  const workbook = XLSX.read(readFileSync(filePath), { type: 'buffer', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  })
  return parseWorksheetRows(rows)
}

export async function importMeterRegistry(filePath = REGISTRY_FILE): Promise<number> {
  const rows = loadMeterRegistryRowsFromFile(filePath)
  const batchSize = 250

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize)
    const values: unknown[] = []
    const placeholders: string[] = []

    batch.forEach((row, index) => {
      const base = index * 18
      placeholders.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16},$${base + 17},$${base + 18})`,
      )
      values.push(
        `registry-${row.legacyId}`,
        row.legacyId,
        row.meter,
        row.installation,
        row.toi,
        row.note,
        row.csd,
        row.client,
        row.status,
        row.trailStep,
        row.manufacturer,
        row.model,
        row.ratmNumber,
        row.deliveredBy,
        row.schedulingNotes,
        row.availableAt,
        row.scheduledAt,
        row.receivedAt,
      )
    })

    await query(
      `INSERT INTO meter_registry (
        id, legacy_id, meter, installation, toi, note, csd, client, status, trail_step,
        manufacturer, model, ratm_number, delivered_by, scheduling_notes,
        available_at, scheduled_at, received_at
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (meter) DO UPDATE SET
        legacy_id = EXCLUDED.legacy_id,
        installation = EXCLUDED.installation,
        toi = EXCLUDED.toi,
        note = EXCLUDED.note,
        csd = EXCLUDED.csd,
        client = EXCLUDED.client,
        status = EXCLUDED.status,
        trail_step = EXCLUDED.trail_step,
        manufacturer = EXCLUDED.manufacturer,
        model = EXCLUDED.model,
        ratm_number = EXCLUDED.ratm_number,
        delivered_by = EXCLUDED.delivered_by,
        scheduling_notes = EXCLUDED.scheduling_notes,
        available_at = EXCLUDED.available_at,
        scheduled_at = EXCLUDED.scheduled_at,
        received_at = EXCLUDED.received_at`,
      values,
    )
  }

  return rows.length
}

export async function ensureMeterRegistryImported(): Promise<number> {
  const result = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM meter_registry')
  const currentCount = Number(result.rows[0]?.count ?? 0)
  if (currentCount > 0) return currentCount
  return importMeterRegistry()
}

async function runImportCli() {
  const { migrate } = await import('./migrate.js')
  await migrate()
  const total = await importMeterRegistry()
  console.log(`Base de medidores importada: ${total} registro(s).`)
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  runImportCli()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Falha ao importar base de medidores:', error)
      process.exit(1)
    })
}
