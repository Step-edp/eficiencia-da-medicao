import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { query } from './db.js'
import { ENTRADA_TRAIL_STEP } from './routes/meter-schedules.js'
import {
  formatScheduleNumericField,
  normalizeScheduleMeter,
  normalizeScheduleNote,
} from './numeric-field-validation.js'

const DEFAULT_CSV = path.resolve(
  process.cwd(),
  'data/agendar-medidores-em-massa.csv',
)

type ParsedScheduleRow = {
  meter: string
  scheduledAt: Date
  installation: string
  toi: string
  note: string
  schedulingNotes: string
  csdRaw: string
  scheduledByName: string
  schedulingAt: Date
}

type ImportResult = {
  created: number
  skippedDuplicates: string[]
  skippedInvalid: Array<{ meter: string; reason: string }>
  userLinked: number
  userPending: number
  csdUnresolved: string[]
}

function sanitizeDigits(value: unknown, maxLength?: number): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return maxLength ? digits.slice(0, maxLength) : digits
}

export { normalizeScheduleNote } from './numeric-field-validation.js'

function parseText(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

function parseSemicolonCsv(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]
    const next = content[index + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ';') {
      row.push(field)
      field = ''
      continue
    }

    if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') index += 1
      row.push(field)
      field = ''
      if (row.some((cell) => cell.trim())) rows.push(row)
      row = []
      continue
    }

    field += char
  }

  if (field || row.length) {
    row.push(field)
    if (row.some((cell) => cell.trim())) rows.push(row)
  }

  return rows
}

function parseBrazilianDateTime(value: string): Date | null {
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/)
  if (!match) return null

  const [, day, month, year, hour = '0', minute = '0'] = match
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
  )
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeLookupKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normalizeCsdKey(value: string): string {
  return normalizeLookupKey(value).replace(/\s+/g, '')
}

function stripCsdPrefix(name: string): string {
  return name.replace(/^csd\s*[-–]\s*/i, '').trim()
}

type CsdRecord = {
  name: string
  cities: string[]
}

export type { CsdRecord }

function resolveCsdName(raw: string, csds: CsdRecord[]): string | null {
  const key = normalizeCsdKey(raw)
  if (!key) return null

  for (const csd of csds) {
    for (const city of csd.cities) {
      if (normalizeCsdKey(city) === key) return csd.name
    }
  }

  for (const csd of csds) {
    const candidates = [csd.name, stripCsdPrefix(csd.name)]
    if (candidates.some((name) => normalizeCsdKey(name) === key)) return csd.name
  }

  for (const csd of csds) {
    const csdKey = normalizeCsdKey(stripCsdPrefix(csd.name))
    if (csdKey.startsWith(key) || key.startsWith(csdKey)) return csd.name
  }

  const aliasMap: Record<string, string> = {
    taubat: 'Taubaté',
    po: 'Poá',
    jacare: 'Jacareí',
    guaratinguet: 'Guaratinguetá',
    litoral: 'Litoral',
    guarulhos: 'Guarulhos',
    suzano: 'Suzano',
    mogi: 'Mogi das Cruzes',
  }

  for (const [prefix, canonical] of Object.entries(aliasMap)) {
    if (!key.startsWith(prefix)) continue

    for (const csd of csds) {
      if (csd.cities.some((city) => normalizeCsdKey(city) === normalizeCsdKey(canonical))) {
        return csd.name
      }
      if (normalizeCsdKey(stripCsdPrefix(csd.name)) === normalizeCsdKey(canonical)) {
        return csd.name
      }
    }
  }

  if (key === 'litoral') {
    const coastal = csds.find(
      (csd) => normalizeCsdKey(stripCsdPrefix(csd.name)) === 'caraguatatuba',
    )
    if (coastal) return coastal.name
  }

  return null
}

function parseCsvRows(content: string): ParsedScheduleRow[] {
  const rows = parseSemicolonCsv(content)
  if (rows.length < 2) return []

  const parsed: ParsedScheduleRow[] = []

  for (const cells of rows.slice(1)) {
    if (cells.length < 9) continue

    const meter = sanitizeDigits(cells[0])
    if (!meter) continue

    const scheduledAt = parseBrazilianDateTime(cells[1] ?? '')
    const schedulingAt = parseBrazilianDateTime(cells[8] ?? '')
    if (!scheduledAt || !schedulingAt) continue

    parsed.push({
      meter: formatScheduleNumericField(cells[0], 'medidor'),
      scheduledAt,
      installation: formatScheduleNumericField(cells[2], 'instalacao'),
      toi: formatScheduleNumericField(cells[3], 'toi'),
      note: normalizeScheduleNote(cells[4]),
      schedulingNotes: parseText(cells[5]),
      csdRaw: parseText(cells[6]),
      scheduledByName: parseText(cells[7]),
      schedulingAt,
    })
  }

  return parsed
}

export function parseMeterSchedulesCsv(content: string): ParsedScheduleRow[] {
  return parseCsvRows(content)
}

export function resolveCsdNameForImport(raw: string, csds: CsdRecord[]): string | null {
  return resolveCsdName(raw, csds)
}

export async function importMeterSchedulesFromCsv(content: string, sourceLabel = 'bulk'): Promise<ImportResult> {
  const rows = parseCsvRows(content)

  if (!rows.length) {
    throw new Error('Nenhuma linha válida encontrada no CSV.')
  }

  const [scheduleExisting, registryExisting, csdResult] = await Promise.all([
    query<{ meter: string }>(
      `SELECT DISTINCT meter FROM meter_schedules WHERE meter = ANY($1::text[])`,
      [rows.map((row) => row.meter)],
    ),
    query<{ meter: string }>(
      `SELECT meter FROM meter_registry WHERE meter = ANY($1::text[])`,
      [rows.map((row) => row.meter)],
    ),
    query<{ name: string; cities: string[] | null }>(
      `SELECT name, cities FROM csds ORDER BY name ASC`,
    ),
  ])

  const duplicateSet = new Set([
    ...scheduleExisting.rows.map((row) => row.meter),
    ...registryExisting.rows.map((row) => row.meter),
  ])
  const csds = csdResult.rows.map((row) => ({
    name: row.name,
    cities: Array.isArray(row.cities) ? row.cities.map(String) : [],
  }))

  const result: ImportResult = {
    created: 0,
    skippedDuplicates: [],
    skippedInvalid: [],
    userLinked: 0,
    userPending: 0,
    csdUnresolved: [],
  }

  for (const row of rows) {
    if (duplicateSet.has(row.meter)) {
      result.skippedDuplicates.push(row.meter)
      continue
    }

    const csd = resolveCsdName(row.csdRaw, csds)
    if (!csd) {
      result.skippedInvalid.push({
        meter: row.meter,
        reason: `CSD não reconhecido: "${row.csdRaw}"`,
      })
      result.csdUnresolved.push(row.csdRaw)
      continue
    }

    if (!row.installation || !row.toi || !row.note) {
      result.skippedInvalid.push({
        meter: row.meter,
        reason: 'Instalação, TOI ou nota ausente.',
      })
      continue
    }

    const createdByUserId = null

    const id = `schedule-bulk-${row.meter}-${Date.now()}`
    const schedulingDate = row.schedulingAt.toISOString().slice(0, 10)

    await query(
      `INSERT INTO meter_schedules (
        id, meter, installation, toi, note, csd, client_present,
        scheduling_notes, scheduled_by_name, scheduling_date,
        scheduled_at, trail_step, source, created_by_user_id, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,'nao',$7,$8,$9,$10,$11,'bulk_import',$12,$13)`,
      [
        id,
        row.meter,
        row.installation,
        row.toi,
        row.note,
        csd,
        row.schedulingNotes,
        row.scheduledByName,
        schedulingDate,
        row.scheduledAt.toISOString(),
        ENTRADA_TRAIL_STEP,
        createdByUserId,
        row.schedulingAt.toISOString(),
      ],
    )

    duplicateSet.add(row.meter)
    result.created += 1
    if (row.scheduledByName.trim()) {
      result.userPending += 1
    }
  }

  await query(
    `INSERT INTO audit_logs (
       user_id, user_registration, user_role, action, entity_type, entity_id,
       summary, metadata
     ) VALUES (NULL, NULL, NULL, 'create', 'meter_schedule', NULL, $1, $2::jsonb)`,
    [
      `Importação em massa de ${result.created} agendamento(s) de medidor`,
      JSON.stringify({
        bulkImport: true,
        sourceLabel,
        created: result.created,
        skippedDuplicates: result.skippedDuplicates.length,
        skippedInvalid: result.skippedInvalid.length,
        userLinked: result.userLinked,
        userPending: result.userPending,
      }),
    ],
  )

  return result
}

export async function importMeterSchedulesBulk(csvPath = DEFAULT_CSV): Promise<ImportResult> {
  const absolutePath = path.resolve(csvPath)
  const content = readFileSync(absolutePath, 'latin1')
  return importMeterSchedulesFromCsv(content, absolutePath)
}

type FixCsdResult = {
  updated: number
  unchanged: number
  missing: string[]
  unresolved: Array<{ meter: string; csdRaw: string }>
  changes: Array<{ meter: string; from: string; to: string }>
}

export async function fixBulkScheduleCsdFromCsv(content: string): Promise<FixCsdResult> {
  const rows = parseCsvRows(content)
  const csdResult = await query<{ name: string; cities: string[] | null }>(
    `SELECT name, cities FROM csds ORDER BY name ASC`,
  )
  const csds = csdResult.rows.map((row) => ({
    name: row.name,
    cities: Array.isArray(row.cities) ? row.cities.map(String) : [],
  }))

  const result: FixCsdResult = {
    updated: 0,
    unchanged: 0,
    missing: [],
    unresolved: [],
    changes: [],
  }

  for (const row of rows) {
    const targetCsd = resolveCsdName(row.csdRaw, csds)
    if (!targetCsd) {
      result.unresolved.push({ meter: row.meter, csdRaw: row.csdRaw })
      continue
    }

    const existing = await query<{ id: string; csd: string }>(
      `SELECT id, csd
       FROM meter_schedules
       WHERE meter = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [row.meter],
    )
    const schedule = existing.rows[0]
    if (!schedule) {
      result.missing.push(row.meter)
      continue
    }

    if (schedule.csd === targetCsd) {
      result.unchanged += 1
      continue
    }

    await query(`UPDATE meter_schedules SET csd = $1 WHERE id = $2`, [
      targetCsd,
      schedule.id,
    ])

    result.changes.push({ meter: row.meter, from: schedule.csd, to: targetCsd })
    result.updated += 1
  }

  if (result.updated > 0) {
    await query(
      `INSERT INTO audit_logs (
         user_id, user_registration, user_role, action, entity_type, entity_id,
         summary, metadata
       ) VALUES (NULL, NULL, NULL, 'update', 'meter_schedule', NULL, $1, $2::jsonb)`,
      [
        `Correção de CSD em ${result.updated} agendamento(s) importado(s) em massa`,
        JSON.stringify({ bulkCsdFix: true, updated: result.updated, changes: result.changes }),
      ],
    )
  }

  return result
}

type FixNoteResult = {
  updated: number
  unchanged: number
  missing: string[]
  changes: Array<{ meter: string; from: string; to: string }>
}

export async function fixBulkScheduleNotesFromCsv(content: string): Promise<FixNoteResult> {
  const rows = parseCsvRows(content)
  const result: FixNoteResult = {
    updated: 0,
    unchanged: 0,
    missing: [],
    changes: [],
  }

  for (const row of rows) {
    const existing = await query<{ id: string; note: string }>(
      `SELECT id, note
       FROM meter_schedules
       WHERE meter = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [row.meter],
    )
    const schedule = existing.rows[0]
    if (!schedule) {
      result.missing.push(row.meter)
      continue
    }

    const targetNote = row.note
    if (schedule.note === targetNote) {
      result.unchanged += 1
      continue
    }

    await query(`UPDATE meter_schedules SET note = $1 WHERE id = $2`, [
      targetNote,
      schedule.id,
    ])

    result.changes.push({ meter: row.meter, from: schedule.note, to: targetNote })
    result.updated += 1
  }

  if (result.updated > 0) {
    await query(
      `INSERT INTO audit_logs (
         user_id, user_registration, user_role, action, entity_type, entity_id,
         summary, metadata
       ) VALUES (NULL, NULL, NULL, 'update', 'meter_schedule', NULL, $1, $2::jsonb)`,
      [
        `Nota sem zero à esquerda em ${result.updated} agendamento(s) importado(s) em massa`,
        JSON.stringify({ bulkNoteFix: true, updated: result.updated, changes: result.changes }),
      ],
    )
  }

  return result
}

type FixCollaboratorsResult = {
  updated: number
  unchanged: number
  missing: string[]
}

export async function fixBulkScheduleCollaboratorsFromCsv(
  content: string,
): Promise<FixCollaboratorsResult> {
  const rows = parseCsvRows(content)
  const result: FixCollaboratorsResult = {
    updated: 0,
    unchanged: 0,
    missing: [],
  }

  for (const row of rows) {
    const existing = await query<{ id: string; source: string; created_by_user_id: string | null }>(
      `SELECT id, source, created_by_user_id
       FROM meter_schedules
       WHERE meter = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [row.meter],
    )
    const schedule = existing.rows[0]
    if (!schedule) {
      result.missing.push(row.meter)
      continue
    }

    const needsUpdate =
      schedule.source !== 'bulk_import' ||
      schedule.created_by_user_id !== null

    if (!needsUpdate) {
      result.unchanged += 1
      continue
    }

    await query(
      `UPDATE meter_schedules
       SET source = 'bulk_import',
           created_by_user_id = NULL,
           toi_collaborator1_name = '',
           toi_collaborator1_registration = '',
           toi_collaborator2_name = '',
           toi_collaborator2_registration = '',
           toi_team_reason = '',
           partner_user_id = NULL,
           partner_name = '',
           partner_registration = ''
       WHERE id = $1`,
      [schedule.id],
    )

    result.updated += 1
  }

  if (result.updated > 0) {
    await query(
      `INSERT INTO audit_logs (
         user_id, user_registration, user_role, action, entity_type, entity_id,
         summary, metadata
       ) VALUES (NULL, NULL, NULL, 'update', 'meter_schedule', NULL, $1, $2::jsonb)`,
      [
        `Colaboradores em branco em ${result.updated} agendamento(s) importado(s) em massa`,
        JSON.stringify({ bulkCollaboratorFix: true, updated: result.updated }),
      ],
    )
  }

  return result
}

type FixDigitsResult = {
  updated: number
  unchanged: number
  missing: string[]
  changes: Array<{
    meter: string
    from: { meter: string; installation: string; toi: string }
    to: { meter: string; installation: string; toi: string }
  }>
}

export async function fixBulkScheduleDigitsFromCsv(content: string): Promise<FixDigitsResult> {
  const rows = parseCsvRows(content)
  const normalizedTargets = new Set(rows.map((row) => normalizeScheduleMeter(row.meter)))
  const allSchedules = await query<{
    id: string
    meter: string
    installation: string
    toi: string
  }>(`SELECT id, meter, installation, toi FROM meter_schedules`)

  const scheduleByNormalizedMeter = new Map<
    string,
    { id: string; meter: string; installation: string; toi: string }
  >()
  for (const schedule of allSchedules.rows) {
    const key = normalizeScheduleMeter(schedule.meter)
    if (normalizedTargets.has(key)) {
      scheduleByNormalizedMeter.set(key, schedule)
    }
  }

  const result: FixDigitsResult = {
    updated: 0,
    unchanged: 0,
    missing: [],
    changes: [],
  }

  for (const row of rows) {
    const schedule = scheduleByNormalizedMeter.get(normalizeScheduleMeter(row.meter))
    if (!schedule) {
      result.missing.push(row.meter)
      continue
    }

    const target = {
      meter: row.meter,
      installation: row.installation,
      toi: row.toi,
    }

    if (
      schedule.meter === target.meter &&
      schedule.installation === target.installation &&
      schedule.toi === target.toi
    ) {
      result.unchanged += 1
      continue
    }

    const duplicate = await query<{ id: string }>(
      `SELECT id FROM meter_schedules
       WHERE meter = $1 AND id <> $2
       LIMIT 1`,
      [target.meter, schedule.id],
    )
    if (duplicate.rows[0]) {
      result.missing.push(row.meter)
      continue
    }

    await query(
      `UPDATE meter_schedules
       SET meter = $1, installation = $2, toi = $3
       WHERE id = $4`,
      [target.meter, target.installation, target.toi, schedule.id],
    )

    result.changes.push({
      meter: target.meter,
      from: {
        meter: schedule.meter,
        installation: schedule.installation,
        toi: schedule.toi,
      },
      to: target,
    })
    result.updated += 1
    scheduleByNormalizedMeter.set(normalizeScheduleMeter(target.meter), {
      ...schedule,
      ...target,
    })
  }

  if (result.updated > 0) {
    await query(
      `INSERT INTO audit_logs (
         user_id, user_registration, user_role, action, entity_type, entity_id,
         summary, metadata
       ) VALUES (NULL, NULL, NULL, 'update', 'meter_schedule', NULL, $1, $2::jsonb)`,
      [
        `Dígitos normalizados em ${result.updated} agendamento(s) importado(s) em massa`,
        JSON.stringify({ bulkDigitsFix: true, updated: result.updated, changes: result.changes }),
      ],
    )
  }

  return result
}

const BULK_IMPORT_FLAG = 'meter_schedules_bulk_import_v1'

export async function seedMeterSchedulesBulkImportOnce() {
  const flag = await query<{ key: string }>(
    `SELECT key FROM app_runtime_flags WHERE key = $1`,
    [BULK_IMPORT_FLAG],
  )
  if (flag.rows[0]) return null

  if (!existsSync(DEFAULT_CSV)) {
    console.log('Importação em massa de agendamentos: CSV não encontrado, pulando.')
    return null
  }

  const result = await importMeterSchedulesBulk(DEFAULT_CSV)
  await query(`INSERT INTO app_runtime_flags (key) VALUES ($1)`, [BULK_IMPORT_FLAG])
  console.log(
    `Importação em massa de agendamentos: ${result.created} criado(s), ${result.skippedDuplicates.length} ignorado(s) (duplicados), ${result.userLinked} usuário(s) vinculado(s), ${result.userPending} pendente(s).`,
  )
  return result
}

async function main() {
  const csvPath = process.argv[2] ?? DEFAULT_CSV
  const dryRun = process.argv.includes('--dry-run')

  if (dryRun) {
    const content = readFileSync(path.resolve(csvPath), 'latin1')
    const rows = parseCsvRows(content)
    console.log(`Linhas válidas no CSV: ${rows.length}`)
    for (const row of rows) {
      console.log(`${row.meter} | ${row.scheduledAt.toISOString()} | ${row.csdRaw} | ${row.scheduledByName}`)
    }
    process.exit(0)
  }

  const result = await importMeterSchedulesBulk(csvPath)

  console.log(`Importação concluída: ${result.created} agendamento(s) criado(s).`)
  console.log(`Usuário vinculado: ${result.userLinked}; pendente: ${result.userPending}.`)

  if (result.skippedDuplicates.length) {
    console.log(`Ignorados (já na base): ${result.skippedDuplicates.length}`)
    console.log(result.skippedDuplicates.join(', '))
  }

  if (result.skippedInvalid.length) {
    console.log(`Ignorados (inválidos): ${result.skippedInvalid.length}`)
    for (const item of result.skippedInvalid) {
      console.log(`- ${item.meter}: ${item.reason}`)
    }
  }

  await query('SELECT 1')
  process.exit(0)
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  main().catch((error) => {
    console.error('Falha na importação em massa de agendamentos:', error)
    process.exit(1)
  })
}
