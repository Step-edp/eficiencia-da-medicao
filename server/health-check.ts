import { pool } from './db.js'

export type Fault = { at: string; code: string; message: string }

let lastFault: Fault | null = null

function errorCode(error: unknown, depth = 0): string {
  if (!error || typeof error !== 'object' || depth > 4) return ''
  if ('code' in error && (error as { code?: unknown }).code) {
    return String((error as { code?: unknown }).code)
  }
  if ('cause' in error) return errorCode((error as { cause?: unknown }).cause, depth + 1)
  return ''
}

export function describeFault(error: unknown): Fault {
  let message = error instanceof Error ? error.message : 'erro'
  message = message.split('\n')[0].replace(/\s+/g, ' ').slice(0, 240)
  if (/postgres:\/\//i.test(message)) message = 'falha de conexão'
  return { at: new Date().toISOString(), code: errorCode(error), message }
}

export function rememberFault(error: unknown) {
  lastFault = describeFault(error)
}

const READS: Array<[string, string]> = [
  ['db', 'SELECT 1'],
  [
    'schedules',
    `SELECT delay_dismissed_at, envelope_photo, partner_user_id, toi_team_reason, trail_step
     FROM meter_schedules WHERE false`,
  ],
  [
    'laudos',
    `SELECT approved_at, approved_by_user_id, revoked_at, status
     FROM ratm_laudos WHERE false`,
  ],
  ['registry', `SELECT status, trail_step FROM meter_registry WHERE false`],
  [
    'users',
    `SELECT id, work_area, work_subtype, access_areas, access_processes,
            password_plain, must_change_password
     FROM users WHERE false`,
  ],
]

export async function runHealthChecks() {
  const checks: Record<string, string> = {}
  const client = await pool.connect()
  try {
    await client.query("SET statement_timeout = '8s'")
    for (const [name, sql] of READS) {
      try {
        await client.query(sql)
        checks[name] = 'ok'
      } catch (error) {
        const fault = describeFault(error)
        checks[name] = [fault.code, fault.message].filter(Boolean).join(': ')
      }
    }
    try {
      await client.query('BEGIN')
      await client.query('CREATE TEMP TABLE health_disk_probe (n int) ON COMMIT DROP')
      await client.query('INSERT INTO health_disk_probe (n) VALUES (1)')
      await client.query('ROLLBACK')
      checks.write = 'ok'
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // a transação da sonda já foi encerrada
      }
      const fault = describeFault(error)
      checks.write = [fault.code, fault.message].filter(Boolean).join(': ')
    }
    try {
      const size = await client.query<{ bytes: string }>(
        `SELECT pg_database_size(current_database())::text AS bytes`,
      )
      checks.bytes = size.rows[0]?.bytes ?? ''
    } catch (error) {
      checks.bytes = describeFault(error).message
    }
  } finally {
    client.release()
  }

  return {
    ok: checks.db === 'ok' && checks.write === 'ok',
    commit: (process.env.RAILWAY_GIT_COMMIT_SHA ?? '').slice(0, 7),
    checks,
    lastFault,
  }
}
