import { readFileSync } from 'node:fs'
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

  if (!response.ok) {
    throw new Error(`Login falhou: ${response.status} ${await response.text()}`)
  }

  const data = (await response.json()) as { token?: string }
  if (!data.token) throw new Error('Token ausente na resposta de login.')
  return data.token
}

async function fetchSchedule(token: string, meter: string) {
  const response = await fetch(
    `${BASE}/api/meter-schedules?meter=${encodeURIComponent(meter)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!response.ok) {
    throw new Error(`Consulta falhou para ${meter}: ${response.status}`)
  }
  const data = (await response.json()) as {
    schedules?: Array<{ meter: string; id: string; source: string; trailStep: string }>
  }
  return data.schedules?.find((item) => item.meter === meter) ?? null
}

async function fetchRegistry(token: string, meter: string) {
  const response = await fetch(
    `${BASE}/api/meter-registry?meter=${encodeURIComponent(meter)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!response.ok) return null
  const data = (await response.json()) as {
    registry?: { meter: string; status: string; trailStep: string }
  }
  return data.registry ?? null
}

async function main() {
  const content = readFileSync(CSV_PATH, 'latin1')
  const rows = parseMeterSchedulesCsv(content)
  const token = await login()

  const imported: string[] = []
  const missing: string[] = []
  const blockedInRegistry: Array<{ meter: string; status: string; trailStep: string }> = []

  for (const row of rows) {
    const schedule = await fetchSchedule(token, row.meter)
    if (schedule) {
      imported.push(row.meter)
      continue
    }

    missing.push(row.meter)
    const registry = await fetchRegistry(token, row.meter)
    if (registry) {
      blockedInRegistry.push({
        meter: row.meter,
        status: registry.status,
        trailStep: registry.trailStep,
      })
    }
  }

  console.log(`CSV: ${rows.length} medidor(es)`)
  console.log(`Importados (agendamento encontrado): ${imported.length}`)
  console.log(`Não importados: ${missing.length}`)

  if (missing.length) {
    console.log('\nMedidores sem agendamento:')
    for (const meter of missing) {
      const registry = blockedInRegistry.find((item) => item.meter === meter)
      if (registry) {
        console.log(`- ${meter} (já na base: status=${registry.status}, etapa=${registry.trailStep})`)
      } else {
        console.log(`- ${meter} (motivo desconhecido — não está na base nem agendado)`)
      }
    }
  } else {
    console.log('Todos os medidores do CSV foram importados.')
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
