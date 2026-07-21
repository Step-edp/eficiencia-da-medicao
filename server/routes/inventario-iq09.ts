import { spawn } from 'node:child_process'
import type { Request, Response } from 'express'
import { requireAuth } from '../auth.js'
import { writeAuditLog } from '../audit.js'

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const SCRIPT_TIMEOUT_MS = 120_000

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

export async function runIq09Script(req: Request, res: Response) {
  const monthKey =
    typeof req.body?.monthKey === 'string' ? req.body.monthKey.trim() : ''

  if (!MONTH_KEY_RE.test(monthKey)) {
    res.status(400).json({ error: 'Informe um mês válido no formato AAAA-MM.' })
    return
  }

  const commandTemplate = process.env.IQ09_SCRIPT_COMMAND?.trim() ?? ''

  if (!commandTemplate) {
    await writeAuditLog(req, {
      action: 'create',
      entityType: 'iq09_run',
      entityId: monthKey,
      summary: `Pedido IQ09 registrado para ${monthKey} (script ainda não configurado).`,
      newData: { monthKey, mode: 'accepted' },
    })

    res.json({
      ok: true,
      mode: 'accepted',
      message:
        'Pedido IQ09 registrado. Configure IQ09_SCRIPT_COMMAND no servidor para executar o script automaticamente.',
    })
    return
  }

  // monthKey já validado; substitui {month} ou acrescenta como argumento final.
  const commandLine = commandTemplate.includes('{month}')
    ? commandTemplate.replaceAll('{month}', monthKey)
    : `${commandTemplate} ${monthKey}`

  try {
    const result = await runShellCommand(commandLine)

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

    await writeAuditLog(req, {
      action: 'create',
      entityType: 'iq09_run',
      entityId: monthKey,
      summary: `Script IQ09 executado com sucesso para ${monthKey}.`,
      newData: {
        monthKey,
        mode: 'executed',
        code: result.code,
        stdout: result.stdout.slice(0, 2000),
      },
    })

    res.json({
      ok: true,
      mode: 'executed',
      message: `Script IQ09 executado com sucesso para ${monthKey}.`,
      output: result.stdout.slice(0, 4000),
    })
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
  }
}

export const inventarioIq09Routes = {
  run: [requireAuth, runIq09Script],
}
