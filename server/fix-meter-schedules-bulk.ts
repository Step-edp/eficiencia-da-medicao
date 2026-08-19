import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  parseMeterSchedulesCsv,
  resolveCsdNameForImport,
  type CsdRecord,
} from './import-meter-schedules-bulk.js'

const BASE =
  process.env.API_BASE_URL ?? 'https://eficiencia-da-medicao-production.up.railway.app'
const CSV_PATH = path.resolve(process.cwd(), 'data/agendar-medidores-em-massa.csv')

async function login(): Promise<string> {
  const registration = process.env.ADMIN_REGISTRATION ?? 'adm@edp'
  const password = process.env.ADMIN_PASSWORD ?? 'Mel@8025'
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registration, password }),
  })
  if (!response.ok) throw new Error(`Login falhou: ${response.status}`)
  const data = (await response.json()) as { token?: string }
  if (!data.token) throw new Error('Token ausente.')
  return data.token
}

async function fetchCsds(token: string): Promise<CsdRecord[]> {
  const response = await fetch(`${BASE}/api/csds`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`CSDs falhou: ${response.status}`)
  const data = (await response.json()) as { csds: Array<{ name: string; cities: string[] }> }
  return data.csds.map((csd) => ({ name: csd.name, cities: csd.cities ?? [] }))
}

async function fetchSchedule(token: string, meter: string) {
  const response = await fetch(
    `${BASE}/api/meter-schedules?meter=${encodeURIComponent(meter)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!response.ok) throw new Error(`Consulta falhou: ${response.status}`)
  const data = (await response.json()) as { schedules?: Array<{ meter: string }> }
  return data.schedules?.some((item) => item.meter === meter) ?? false
}

async function createPassiveSchedule(
  token: string,
  row: ReturnType<typeof parseMeterSchedulesCsv>[number],
  csd: string,
) {
  const response = await fetch(`${BASE}/api/meter-schedules/passivo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      meter: row.meter,
      installation: row.installation,
      toi: row.toi,
      note: row.note,
      csd,
      schedulingNotes: row.schedulingNotes,
      scheduledByName: row.scheduledByName,
      schedulingDate: row.schedulingAt.toISOString().slice(0, 10),
      scheduledAt: row.scheduledAt.toISOString(),
    }),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Passivo ${row.meter}: ${response.status} ${text}`)
  }
}

async function main() {
  const importPassivo = process.argv.includes('--import-passivo')
  const csvContent = readFileSync(CSV_PATH, 'latin1')
  const rows = parseMeterSchedulesCsv(csvContent)
  const token = await login()
  const csds = await fetchCsds(token)

  const pending: typeof rows = []
  for (const row of rows) {
    if (!(await fetchSchedule(token, row.meter))) pending.push(row)
  }

  console.log(`Pendentes: ${pending.length}/${rows.length}`)
  if (pending.length) console.log(pending.map((row) => row.meter).join(', '))

  if (!importPassivo || !pending.length) return

  let created = 0
  const failed: Array<{ meter: string; reason: string }> = []

  for (const row of pending) {
    const csd = resolveCsdNameForImport(row.csdRaw, csds)
    if (!csd) {
      failed.push({ meter: row.meter, reason: `CSD não reconhecido: ${row.csdRaw}` })
      continue
    }
    try {
      await createPassiveSchedule(token, row, csd)
      created += 1
      console.log(`OK ${row.meter} -> ${csd}`)
    } catch (error) {
      failed.push({
        meter: row.meter,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  console.log(`Criados: ${created}`)
  if (failed.length) {
    console.log('Falhas:')
    for (const item of failed) console.log(`- ${item.meter}: ${item.reason}`)
  }

  const stillMissing: string[] = []
  for (const row of pending) {
    if (!(await fetchSchedule(token, row.meter))) stillMissing.push(row.meter)
  }
  console.log(`Ainda pendentes: ${stillMissing.length}`)
  if (stillMissing.length) console.log(stillMissing.join(', '))
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
