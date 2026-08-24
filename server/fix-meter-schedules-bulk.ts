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
const csvArg = process.argv.find((arg) => arg.startsWith('--csv='))?.slice('--csv='.length)
const CSV_PATH = path.resolve(
  process.cwd(),
  csvArg || 'data/agendar-medidores-em-massa.csv',
)

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

async function fetchScheduleDetail(token: string, meter: string) {
  const response = await fetch(
    `${BASE}/api/meter-schedules?meter=${encodeURIComponent(meter)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!response.ok) throw new Error(`Consulta falhou: ${response.status}`)
  const data = (await response.json()) as {
    schedules?: Array<{ meter: string; csd?: string }>
  }
  return data.schedules?.find((item) => item.meter === meter) ?? null
}

async function fixCsdViaApi(token: string, csvContent: string) {
  const response = await fetch(`${BASE}/api/meter-schedules/bulk-fix-csd`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ csvContent }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Fix CSD falhou: ${response.status} ${text}`)
  return JSON.parse(text) as {
    updated: number
    unchanged: number
    changes: Array<{ meter: string; from: string; to: string }>
  }
}

async function fixNoteViaApi(token: string, csvContent: string) {
  const response = await fetch(`${BASE}/api/meter-schedules/bulk-fix-note`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ csvContent }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Fix nota falhou: ${response.status} ${text}`)
  return JSON.parse(text) as {
    updated: number
    unchanged: number
    changes: Array<{ meter: string; from: string; to: string }>
  }
}

async function fixCollaboratorsViaApi(token: string, csvContent: string) {
  const response = await fetch(`${BASE}/api/meter-schedules/bulk-fix-collaborators`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ csvContent }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Fix colaboradores falhou: ${response.status} ${text}`)
  return JSON.parse(text) as { updated: number; unchanged: number }
}

async function fixDigitsViaApi(token: string, csvContent: string) {
  const response = await fetch(`${BASE}/api/meter-schedules/bulk-fix-digits`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ csvContent }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Fix dígitos falhou: ${response.status} ${text}`)
  return JSON.parse(text) as {
    updated: number
    unchanged: number
    changes: Array<{
      meter: string
      from: { meter: string; installation: string; toi: string }
      to: { meter: string; installation: string; toi: string }
    }>
  }
}

async function fixUsersViaApi(token: string, csvContent: string) {
  const response = await fetch(`${BASE}/api/meter-schedules/bulk-fix-users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ csvContent }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Fix usuários falhou: ${response.status} ${text}`)
  return JSON.parse(text) as {
    updated: number
    unchanged: number
    unresolved: string[]
    changes: Array<{ meter: string; scheduledByName: string; userName: string }>
  }
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
  const fixCsd = process.argv.includes('--fix-csd')
  const fixNote = process.argv.includes('--fix-note')
  const fixDigits = process.argv.includes('--fix-digits')
  const fixCollaborators = process.argv.includes('--fix-collaborators')
  const fixUsers = process.argv.includes('--fix-users')
  const csvContent = readFileSync(CSV_PATH, 'latin1')
  const rows = parseMeterSchedulesCsv(csvContent)
  console.log(`CSV: ${CSV_PATH}`)
  console.log(`Linhas válidas: ${rows.length}`)
  const token = await login()
  const csds = await fetchCsds(token)

  if (fixDigits) {
    const result = await fixDigitsViaApi(token, csvContent)
    console.log(`Dígitos normalizados: ${result.updated}; sem alteração: ${result.unchanged}`)
    for (const change of result.changes) {
      console.log(
        `${change.to.meter}: medidor ${change.from.meter} -> ${change.to.meter}, instalação ${change.from.installation} -> ${change.to.installation}, toi ${change.from.toi} -> ${change.to.toi}`,
      )
    }
    return
  }

  if (fixUsers) {
    const result = await fixUsersViaApi(token, csvContent)
    console.log(
      `Usuários vinculados: ${result.updated}; sem alteração: ${result.unchanged}; sem match: ${result.unresolved.length}`,
    )
    for (const change of result.changes) {
      console.log(`${change.meter}: "${change.scheduledByName}" -> ${change.userName}`)
    }
    if (result.unresolved.length) {
      console.log(`Sem correspondência: ${result.unresolved.join(', ')}`)
    }
    return
  }

  if (fixCollaborators) {
    const result = await fixCollaboratorsViaApi(token, csvContent)
    console.log(`Colaboradores ajustados: ${result.updated}; sem alteração: ${result.unchanged}`)
    return
  }

  if (fixNote) {
    const result = await fixNoteViaApi(token, csvContent)
    console.log(`Notas corrigidas: ${result.updated}; sem alteração: ${result.unchanged}`)
    for (const change of result.changes) {
      console.log(`${change.meter}: "${change.from}" -> "${change.to}"`)
    }
    return
  }

  if (fixCsd) {
    const result = await fixCsdViaApi(token, csvContent)
    console.log(`CSD corrigidos: ${result.updated}; sem alteração: ${result.unchanged}`)
    for (const change of result.changes) {
      console.log(`${change.meter}: "${change.from}" -> "${change.to}"`)
    }
    return
  }

  const pending: typeof rows = []
  for (const row of rows) {
    if (!(await fetchScheduleDetail(token, row.meter))) pending.push(row)
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
    if (!(await fetchScheduleDetail(token, row.meter))) stillMissing.push(row.meter)
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
