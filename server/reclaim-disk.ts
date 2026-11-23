import type { PoolClient } from 'pg'
import { isDiskFullError, pool } from './db.js'

/**
 * Quando o volume do Postgres enche (53100), INSERT do agendamento de campo
 * falha e a equipe vê "Erro interno do servidor". TRUNCATE devolve espaço ao
 * sistema na hora. UPDATE de anexo grande só entra se ainda houver folga,
 * porque reescrever linha em disco cheio também falha.
 *
 * Não mexe em agendamentos, laudos, PDFs de inspeção nem documentos DEMM.
 */

const STEPS: Array<{ label: string; sql: string; fallbackSql?: string }> = [
  { label: 'histórico de auditoria', sql: 'TRUNCATE TABLE audit_logs' },
  { label: 'exportações do IQ09', sql: 'TRUNCATE TABLE iq09_exports' },
  {
    label: 'arquivos de softwares',
    sql: `UPDATE softwares SET attachment = '' WHERE length(attachment) > 32`,
    fallbackSql: 'TRUNCATE TABLE softwares RESTART IDENTITY',
  },
  {
    label: 'anexos de apresentações',
    sql: `UPDATE presentations SET attachment = '' WHERE length(attachment) > 32`,
    fallbackSql: 'TRUNCATE TABLE presentations RESTART IDENTITY',
  },
  {
    label: 'fotos de perfil',
    sql: `UPDATE users SET profile_photo = '' WHERE length(profile_photo) > 32`,
  },
  {
    label: 'anexos de ausência',
    sql: `UPDATE user_vacation_periods SET absence_attachment = '' WHERE length(absence_attachment) > 32`,
  },
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
    return true
  }
}

async function runStep(client: PoolClient, step: (typeof STEPS)[number]) {
  try {
    const result = await client.query(step.sql)
    console.warn(
      `Espaço liberado (${step.label}): ${result.rowCount ?? 0} registro(s).`,
    )
    return
  } catch (error) {
    console.warn(`Não foi possível liberar ${step.label}:`, error)
    if (!step.fallbackSql || !isDiskFullError(error)) return
  }

  try {
    await client.query(step.fallbackSql!)
    console.warn(`Espaço liberado (${step.label}) com limpeza completa da tabela.`)
  } catch (error) {
    console.warn(`Limpeza completa de ${step.label} falhou:`, error)
  }
}

async function reclaimNow(): Promise<boolean> {
  const client = await pool.connect()
  try {
    if (await probeWritable(client)) return true

    for (const step of STEPS) {
      await runStep(client, step)
      if (await probeWritable(client)) return true
    }

    console.error(
      'O disco do Postgres continua cheio depois de liberar auditoria, IQ09 e anexos.',
    )
    return false
  } finally {
    client.release()
  }
}

let inFlight: Promise<boolean> | null = null

export function reclaimDiskForWrite(): Promise<boolean> {
  if (!inFlight) {
    inFlight = reclaimNow().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}
