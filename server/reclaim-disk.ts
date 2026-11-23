import type { PoolClient } from 'pg'
import { isDiskFullError, pool } from './db.js'

/**
 * Libera espaço devolvendo tabelas inteiras ao sistema (TRUNCATE).
 * Só roda quando o Postgres recusa gravação por disco cheio.
 * Não altera usuários, agendamentos, laudos, inspeções nem DEMM.
 * Softwares só são esvaziados se a auditoria e o IQ09 não bastarem.
 */

const STEPS = [
  { label: 'histórico de auditoria', sql: 'TRUNCATE TABLE audit_logs' },
  { label: 'exportações do IQ09', sql: 'TRUNCATE TABLE iq09_exports' },
  { label: 'arquivos de softwares', sql: 'TRUNCATE TABLE softwares RESTART IDENTITY' },
]

async function probeWritable(client: PoolClient): Promise<boolean> {
  try {
    await client.query('BEGIN')
    await client.query('CREATE TEMP TABLE disk_probe_row (n int) ON COMMIT DROP')
    await client.query('INSERT INTO disk_probe_row (n) VALUES (1)')
    await client.query('ROLLBACK')
    return true
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // a transação da sonda já foi encerrada
    }
    if (isDiskFullError(error)) return false
    console.warn('Não foi possível medir o espaço em disco:', error)
    return false
  }
}

async function reclaimNow(): Promise<boolean> {
  const client = await pool.connect()
  try {
    await client.query("SET lock_timeout = '4s'")
    for (const step of STEPS) {
      try {
        await client.query(step.sql)
        console.warn(`Espaço liberado (${step.label}).`)
      } catch (error) {
        console.warn(`Não foi possível liberar ${step.label}:`, error)
      }
      if (await probeWritable(client)) return true
    }
    return false
  } catch (error) {
    console.error('Falha ao liberar espaço em disco:', error)
    return false
  } finally {
    client.release()
  }
}

let inFlight: Promise<boolean> | null = null

/** Uma tentativa por processo, compartilhada entre as requisições. */
export function reclaimDiskOnce(): Promise<boolean> {
  if (!inFlight) {
    inFlight = reclaimNow()
  }
  return inFlight
}
