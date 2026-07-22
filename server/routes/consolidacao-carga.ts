import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { writeAuditLog } from '../audit.js'

const NINE_DIGITS = 9
const MIN_DATE_GAP_DAYS = 180
const MS_PER_DAY = 24 * 60 * 60 * 1000
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_BULK_ROWS = 200

type ConsolidacaoClienteMapped = {
  id: number
  nomeCliente: string
  instalacao: string
  dataDenuncia: string
  dataPrevistaMigracao: string
  nota: string
  createdAt: string
  createdByUserId: string | null
  createdByName: string
  createdByRegistration: string
}

type ClientPayload = {
  nomeCliente: string
  instalacao: string
  dataDenuncia: string
  dataPrevistaMigracao: string
  nota: string
}

function onlyDigits(value: string, max: number) {
  return value.replace(/\D/g, '').slice(0, max)
}

function daysBetween(dateA: string, dateB: string): number | null {
  const a = new Date(`${dateA}T00:00:00`)
  const b = new Date(`${dateB}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.abs(Math.round((b.getTime() - a.getTime()) / MS_PER_DAY))
}

function toDateString(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10)
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  const day = String(value.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function mapCliente(row: {
  id: number
  nome_cliente: string
  instalacao: string
  data_denuncia: string | Date
  data_prevista_migracao: string | Date
  nota: string
  created_at: Date
  created_by_user_id: string | null
  created_by_name?: string | null
  created_by_registration?: string | null
}): ConsolidacaoClienteMapped {
  return {
    id: row.id,
    nomeCliente: row.nome_cliente,
    instalacao: row.instalacao,
    dataDenuncia: toDateString(row.data_denuncia),
    dataPrevistaMigracao: toDateString(row.data_prevista_migracao),
    nota: row.nota,
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name || '',
    createdByRegistration: row.created_by_registration || '',
  }
}

function normalizePayload(raw: Record<string, unknown>): ClientPayload | { error: string } {
  const nomeCliente =
    typeof raw.nomeCliente === 'string' ? raw.nomeCliente.trim() : ''
  const instalacaoDigits =
    typeof raw.instalacao === 'string' ? onlyDigits(raw.instalacao, NINE_DIGITS) : ''
  const dataDenuncia =
    typeof raw.dataDenuncia === 'string' ? raw.dataDenuncia.trim().slice(0, 10) : ''
  const dataPrevistaMigracao =
    typeof raw.dataPrevistaMigracao === 'string'
      ? raw.dataPrevistaMigracao.trim().slice(0, 10)
      : ''
  const nota = typeof raw.nota === 'string' ? onlyDigits(raw.nota, NINE_DIGITS) : ''

  if (!nomeCliente) {
    return { error: 'Informe o nome do cliente.' }
  }
  if (!instalacaoDigits) {
    return {
      error: 'Informe a Instalação (até 9 dígitos).',
    }
  }
  if (!ISO_DATE_RE.test(dataDenuncia) || !ISO_DATE_RE.test(dataPrevistaMigracao)) {
    return {
      error: 'Informe Data denúncia e Data prevista para migração válidas.',
    }
  }
  const gapDays = daysBetween(dataDenuncia, dataPrevistaMigracao)
  if (gapDays === null || gapDays < MIN_DATE_GAP_DAYS) {
    return {
      error:
        'A Data denúncia e a Data prevista para migração devem ter pelo menos 180 dias de diferença.',
    }
  }
  if (nota.length !== NINE_DIGITS) {
    return {
      error: `O campo Nota deve ter exatamente ${NINE_DIGITS} dígitos.`,
    }
  }

  return {
    nomeCliente,
    instalacao: instalacaoDigits.padStart(NINE_DIGITS, '0'),
    dataDenuncia,
    dataPrevistaMigracao,
    nota,
  }
}

async function insertCliente(
  payload: ClientPayload,
  userId: string | null,
  registration: string,
) {
  const result = await query<{
    id: number
    nome_cliente: string
    instalacao: string
    data_denuncia: string | Date
    data_prevista_migracao: string | Date
    nota: string
    created_at: Date
    created_by_user_id: string | null
  }>(
    `INSERT INTO consolidacao_carga_clientes
       (nome_cliente, instalacao, data_denuncia, data_prevista_migracao, nota, created_by_user_id)
     VALUES ($1, $2, $3::date, $4::date, $5, $6)
     RETURNING id, nome_cliente, instalacao,
               data_denuncia::text AS data_denuncia,
               data_prevista_migracao::text AS data_prevista_migracao,
               nota, created_at, created_by_user_id`,
    [
      payload.nomeCliente,
      payload.instalacao,
      payload.dataDenuncia,
      payload.dataPrevistaMigracao,
      payload.nota,
      userId,
    ],
  )

  return mapCliente({
    ...result.rows[0],
    created_by_name: '',
    created_by_registration: registration,
  })
}

export async function listConsolidacaoCargaClientes(_req: Request, res: Response) {
  const result = await query<{
    id: number
    nome_cliente: string
    instalacao: string
    data_denuncia: string | Date
    data_prevista_migracao: string | Date
    nota: string
    created_at: Date
    created_by_user_id: string | null
    created_by_name: string | null
    created_by_registration: string | null
  }>(
    `SELECT c.id, c.nome_cliente, c.instalacao,
            c.data_denuncia::text AS data_denuncia,
            c.data_prevista_migracao::text AS data_prevista_migracao,
            c.nota, c.created_at, c.created_by_user_id,
            u.name AS created_by_name,
            u.registration AS created_by_registration
     FROM consolidacao_carga_clientes c
     LEFT JOIN users u ON u.id = c.created_by_user_id
     ORDER BY c.created_at DESC, c.id DESC`,
  )

  res.json({
    clients: result.rows.map((row) => mapCliente(row)),
  })
}

export async function createConsolidacaoCargaCliente(req: Request, res: Response) {
  const normalized = normalizePayload(req.body as Record<string, unknown>)
  if ('error' in normalized) {
    res.status(400).json({ error: normalized.error })
    return
  }

  const created = await insertCliente(
    normalized,
    req.user?.id ?? null,
    req.user?.registration ?? '',
  )

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'consolidacao_carga_cliente',
    entityId: String(created.id),
    summary: `Cliente consolidação ${created.nomeCliente}`,
    newData: created,
  })

  res.status(201).json({ client: created })
}

export async function createConsolidacaoCargaClientesBulk(
  req: Request,
  res: Response,
) {
  const body = req.body as { clients?: unknown }
  if (!Array.isArray(body.clients)) {
    res.status(400).json({ error: 'Envie a lista de clientes em clients.' })
    return
  }

  if (body.clients.length === 0) {
    res.status(400).json({ error: 'Nenhum cliente para cadastrar.' })
    return
  }

  if (body.clients.length > MAX_BULK_ROWS) {
    res.status(400).json({
      error: `É possível cadastrar no máximo ${MAX_BULK_ROWS} clientes por vez.`,
    })
    return
  }

  const created: ConsolidacaoClienteMapped[] = []
  const errors: { index: number; error: string }[] = []

  for (let index = 0; index < body.clients.length; index += 1) {
    const raw = body.clients[index]
    if (!raw || typeof raw !== 'object') {
      errors.push({ index, error: 'Linha inválida.' })
      continue
    }

    const normalized = normalizePayload(raw as Record<string, unknown>)
    if ('error' in normalized) {
      errors.push({ index, error: normalized.error })
      continue
    }

    try {
      const client = await insertCliente(
        normalized,
        req.user?.id ?? null,
        req.user?.registration ?? '',
      )
      created.push(client)
      await writeAuditLog(req, {
        action: 'create',
        entityType: 'consolidacao_carga_cliente',
        entityId: String(client.id),
        summary: `Cliente consolidação ${client.nomeCliente}`,
        newData: client,
      })
    } catch {
      errors.push({ index, error: 'Falha ao salvar esta linha.' })
    }
  }

  res.status(created.length > 0 ? 201 : 400).json({
    clients: created,
    createdCount: created.length,
    errorCount: errors.length,
    errors,
  })
}

export const consolidacaoCargaRoutes = {
  list: [requireAuth, listConsolidacaoCargaClientes],
  create: [requireAuth, createConsolidacaoCargaCliente],
  createBulk: [requireAuth, createConsolidacaoCargaClientesBulk],
}
