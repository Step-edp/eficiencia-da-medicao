import { spawn } from 'node:child_process'
import type { Request, Response } from 'express'
import { requireAuth } from '../auth.js'
import { writeAuditLog } from '../audit.js'
import { query } from '../db.js'
import {
  parseIq09ExportFile,
  resolveIq09ExportPath,
  type Iq09Column,
  type Iq09Row,
} from '../iq09-export.js'

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const SCRIPT_TIMEOUT_MS = 120_000

type Iq09ExportRow = {
  month_key: string
  columns_json: Iq09Column[]
  rows_json: Iq09Row[]
  source_file: string
  updated_at: Date
}

function runShellCommand(commandLine: string): Promise<{
  code: number
  stdout: string
  stderr: string
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(commandLine, {
      shell: true,
      windowsHide: true,
      env: process.env,
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error('Tempo limite excedido ao executar o script IQ09.'))
    }, SCRIPT_TIMEOUT_MS)

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk)
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

async function saveIq09Export(params: {
  monthKey: string
  columns: Iq09Column[]
  rows: Iq09Row[]
  sourceFile: string
  userId: string | null
}) {
  await query(
    `INSERT INTO iq09_exports (
       month_key, columns_json, rows_json, source_file, created_by_user_id, updated_at
     ) VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, NOW())
     ON CONFLICT (month_key) DO UPDATE SET
       columns_json = EXCLUDED.columns_json,
       rows_json = EXCLUDED.rows_json,
       source_file = EXCLUDED.source_file,
       created_by_user_id = COALESCE(EXCLUDED.created_by_user_id, iq09_exports.created_by_user_id),
       updated_at = NOW()`,
    [
      params.monthKey,
      JSON.stringify(params.columns),
      JSON.stringify(params.rows),
      params.sourceFile,
      params.userId,
    ],
  )
}

export async function getIq09Export(req: Request, res: Response) {
  const monthKey =
    typeof req.params.monthKey === 'string' ? req.params.monthKey.trim() : ''

  if (!MONTH_KEY_RE.test(monthKey)) {
    res.status(400).json({ error: 'Informe um mês válido no formato AAAA-MM.' })
    return
  }

  const result = await query<Iq09ExportRow>(
    `SELECT month_key, columns_json, rows_json, source_file, updated_at
     FROM iq09_exports
     WHERE month_key = $1`,
    [monthKey],
  )

  const row = result.rows[0]
  if (!row) {
    res.json({
      monthKey,
      columns: [],
      rows: [],
      sourceFile: '',
      updatedAt: null,
    })
    return
  }

  res.json({
    monthKey: row.month_key,
    columns: row.columns_json ?? [],
    rows: row.rows_json ?? [],
    sourceFile: row.source_file ?? '',
    updatedAt: row.updated_at?.toISOString?.() ?? null,
  })
}

export async function runIq09Script(req: Request, res: Response) {
  const monthKey =
    typeof req.body?.monthKey === 'string' ? req.body.monthKey.trim() : ''

  if (!MONTH_KEY_RE.test(monthKey)) {
    res.status(400).json({ error: 'Informe um mês válido no formato AAAA-MM.' })
    return
  }

  const commandTemplate = process.env.IQ09_SCRIPT_COMMAND?.trim() ?? ''
  let scriptOutput = ''

  if (commandTemplate) {
    const commandLine = commandTemplate.includes('{month}')
      ? commandTemplate.replaceAll('{month}', monthKey)
      : `${commandTemplate} ${monthKey}`

    try {
      const result = await runShellCommand(commandLine)
      scriptOutput = result.stdout

      if (result.code !== 0) {
        await writeAuditLog(req, {
          action: 'create',
          entityType: 'iq09_run',
          entityId: monthKey,
          summary: `Falha ao executar script IQ09 para ${monthKey}.`,
          newData: {
            monthKey,
            mode: 'executed',
            code: result.code,
            stderr: result.stderr.slice(0, 2000),
          },
        })

        res.status(500).json({
          error:
            result.stderr ||
            `O script IQ09 terminou com código ${result.code}.`,
        })
        return
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha ao executar o script IQ09.'

      await writeAuditLog(req, {
        action: 'create',
        entityType: 'iq09_run',
        entityId: monthKey,
        summary: `Erro ao executar script IQ09 para ${monthKey}.`,
        newData: { monthKey, mode: 'error', error: message },
      })

      res.status(500).json({ error: message })
      return
    }
  }

  const exportPath = resolveIq09ExportPath(monthKey)
  if (!exportPath) {
    res.status(400).json({
      error:
        'Configure IQ09_EXPORT_PATH (caminho da planilha gerada) ou disponibilize data/iq09-export-sample.xlsx.',
    })
    return
  }

  try {
    const parsed = parseIq09ExportFile(exportPath)
    await saveIq09Export({
      monthKey,
      columns: parsed.columns,
      rows: parsed.rows,
      sourceFile: exportPath,
      userId: req.user?.id ?? null,
    })

    const mode = commandTemplate ? 'executed' : 'imported'
    const message = commandTemplate
      ? `Script IQ09 executado. ${parsed.rows.length} registro(s) carregado(s).`
      : `Planilha IQ09 importada com ${parsed.rows.length} registro(s).`

    await writeAuditLog(req, {
      action: 'create',
      entityType: 'iq09_run',
      entityId: monthKey,
      summary: message,
      newData: {
        monthKey,
        mode,
        rowCount: parsed.rows.length,
        sourceFile: exportPath,
      },
    })

    res.json({
      ok: true,
      mode,
      message,
      output: scriptOutput.slice(0, 4000),
      monthKey,
      columns: parsed.columns,
      rows: parsed.rows,
      sourceFile: exportPath,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Não foi possível ler a planilha IQ09.'

    await writeAuditLog(req, {
      action: 'create',
      entityType: 'iq09_run',
      entityId: monthKey,
      summary: `Falha ao importar planilha IQ09 para ${monthKey}.`,
      newData: { monthKey, mode: 'error', error: message },
    })

    res.status(500).json({ error: message })
  }
}

export const inventarioIq09Routes = {
  get: [requireAuth, getIq09Export],
  run: [requireAuth, runIq09Script],
}
