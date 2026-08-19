import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseMeterSchedulesCsv } from './import-meter-schedules-bulk.js'

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

async function fetchSchedule(token: string, meter: string) {
  const response = await fetch(
    `${BASE}/api/meter-schedules?meter=${encodeURIComponent(meter)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!response.ok) throw new Error(`Consulta falhou: ${response.status}`)
  const data = (await response.json()) as { schedules?: Array<{ meter: string }> }
  return data.schedules?.some((item) => item.meter === meter) ?? false
}

async function bulkImport(token: string, csvContent: string) {
  const response = await fetch(`${BASE}/api/meter-schedules/bulk-import`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ csvContent }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Bulk import falhou: ${response.status} ${text}`)
  return JSON.parse(text) as {
    created: number
    skippedDuplicates: string[]
    skippedInvalid: Array<{ meter: string; reason: string }>
  }
}

async function main() {
  const importMissingOnly = process.argv.includes('--import-missing')
  const csvContent = readFileSync(CSV_PATH, 'latin1')
  const rows = parseMeterSchedulesCsv(csvContent)
  const token = await login()

  const missing: string[] = []
  for (const row of rows) {
    const exists = await fetchSchedule(token, row.meter)
    if (!exists) missing.push(row.meter)
  }

  console.log(`Pendentes: ${missing.length}/${rows.length}`)
  if (missing.length) console.log(missing.join(', '))

  if (!importMissingOnly || !missing.length) return

  const result = await bulkImport(token, csvContent)
  console.log('Resultado reimportação:', JSON.stringify(result, null, 2))

  const stillMissing: string[] = []
  for (const meter of missing) {
    const exists = await fetchSchedule(token, meter)
    if (!exists) stillMissing.push(meter)
  }
  console.log(`Após reimportação, ainda pendentes: ${stillMissing.length}`)
  if (stillMissing.length) console.log(stillMissing.join(', '))
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
