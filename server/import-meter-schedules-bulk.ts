import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { query } from './db.js'
import { ENTRADA_TRAIL_STEP } from './routes/meter-schedules.js'

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

function normalizePersonKey(value: string): string {
  return normalizeLookupKey(value)
    .replace(/\b(engeserv|externo|enge serv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeCsdKey(value: string): string {
  return normalizeLookupKey(value).replace(/\s+/g, '')
}

function resolveCsdName(raw: string, csdNames: string[]): string | null {
  const key = normalizeCsdKey(raw)
  if (!key) return null

  for (const name of csdNames) {
    if (normalizeCsdKey(name) === key) return name
  }

  for (const name of csdNames) {
    const csdKey = normalizeCsdKey(name)
    if (csdKey.startsWith(key) || key.startsWith(csdKey)) return name
  }

  const aliasMap: Record<string, string> = {
    taubat: 'Taubaté',
    po: 'Poá',
    jacare: 'Jacareí',
    guaratinguet: 'Guaratinguetá',
    litoral: 'Litoral',
  }

  for (const [prefix, canonical] of Object.entries(aliasMap)) {
    if (key.startsWith(prefix)) {
      const match = csdNames.find((name) => normalizeCsdKey(name) === normalizeCsdKey(canonical))
      if (match) return match
      return canonical
    }
  }

  return null
}

function resolveUserId(
  scheduledByName: string,
  users: Array<{ id: string; name: string }>,
): string | null {
  const key = normalizePersonKey(scheduledByName)
  if (!key) return null

  const exact = users.find((user) => normalizePersonKey(user.name) === key)
  if (exact) return exact.id

  const parts = key.split(' ').filter((part) => part.length > 2)
  if (parts.length < 2) return null

  const candidates = users.filter((user) => {
    const userKey = normalizePersonKey(user.name)
    return parts.every((part) => userKey.includes(part))
  })

  if (candidates.length === 1) return candidates[0].id
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
      meter,
      scheduledAt,
      installation: sanitizeDigits(cells[2]),
      toi: sanitizeDigits(cells[3]),
      note: sanitizeDigits(cells[4]),
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

export async function importMeterSchedulesFromCsv(content: string, sourceLabel = 'bulk'): Promise<ImportResult> {
  const rows = parseCsvRows(content)

  if (!rows.length) {
    throw new Error('Nenhuma linha válida encontrada no CSV.')
  }

  const [scheduleExisting, registryExisting, csdResult, userResult] = await Promise.all([
    query<{ meter: string }>(
      `SELECT DISTINCT meter FROM meter_schedules WHERE meter = ANY($1::text[])`,
      [rows.map((row) => row.meter)],
    ),
    query<{ meter: string }>(
      `SELECT meter FROM meter_registry WHERE meter = ANY($1::text[])`,
      [rows.map((row) => row.meter)],
    ),
    query<{ name: string }>(`SELECT name FROM csds ORDER BY name ASC`),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM users WHERE approval_status = 'approved' ORDER BY name ASC`,
    ),
  ])

  const duplicateSet = new Set([
    ...scheduleExisting.rows.map((row) => row.meter),
    ...registryExisting.rows.map((row) => row.meter),
  ])
  const csdNames = csdResult.rows.map((row) => row.name)
  const users = userResult.rows

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

    const csd = resolveCsdName(row.csdRaw, csdNames)
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

    const createdByUserId = resolveUserId(row.scheduledByName, users)
    if (createdByUserId) {
      result.userLinked += 1
    } else {
      result.userPending += 1
    }

    const id = `schedule-bulk-${row.meter}-${Date.now()}`
    const schedulingDate = row.schedulingAt.toISOString().slice(0, 10)

    await query(
      `INSERT INTO meter_schedules (
        id, meter, installation, toi, note, csd, client_present,
        scheduling_notes, scheduled_by_name, scheduling_date,
        scheduled_at, trail_step, source, created_by_user_id, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,'nao',$7,$8,$9,$10,$11,'passivo',$12,$13)`,
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
