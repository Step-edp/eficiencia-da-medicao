import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { writeAuditLog } from '../audit.js'

const NINE_DIGITS = 9
const MIN_DATE_GAP_DAYS = 180
const MS_PER_DAY = 24 * 60 * 60 * 1000
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type ConsolidacaoClienteRow = {
  id: number
  nome_cliente: string
  instalacao: string
  data_denuncia: string
  data_prevista_migracao: string
  nota: string
  created_at: Date
  created_by_user_id: string | null
  created_by_name: string | null
  created_by_registration: string | null
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

function mapCliente(
  row: Omit<ConsolidacaoClienteRow, 'created_by_name' | 'created_by_registration'> & {
    created_by_name?: string | null
    created_by_registration?: string | null
    data_denuncia: string | Date
    data_prevista_migracao: string | Date
  },
) {
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
  const { nomeCliente, instalacao, dataDenuncia, dataPrevistaMigracao, nota } =
    req.body as Record<string, string | undefined>

  const nome = typeof nomeCliente === 'string' ? nomeCliente.trim() : ''
  const instalacaoDigits =
    typeof instalacao === 'string' ? onlyDigits(instalacao, NINE_DIGITS) : ''
  const denuncia =
    typeof dataDenuncia === 'string' ? dataDenuncia.trim().slice(0, 10) : ''
  const migracao =
    typeof dataPrevistaMigracao === 'string'
      ? dataPrevistaMigracao.trim().slice(0, 10)
      : ''
  const notaDigits = typeof nota === 'string' ? onlyDigits(nota, NINE_DIGITS) : ''

  if (!nome) {
    res.status(400).json({ error: 'Informe o nome do cliente.' })
    return
  }

  if (instalacaoDigits.length !== NINE_DIGITS) {
    res.status(400).json({
      error: `O campo Instalação deve ter exatamente ${NINE_DIGITS} dígitos.`,
    })
    return
  }

  if (!ISO_DATE_RE.test(denuncia) || !ISO_DATE_RE.test(migracao)) {
    res.status(400).json({
      error: 'Informe Data denúncia e Data prevista para migração válidas.',
    })
    return
  }

  const gapDays = daysBetween(denuncia, migracao)
  if (gapDays === null || gapDays < MIN_DATE_GAP_DAYS) {
    res.status(400).json({
      error:
        'A Data denúncia e a Data prevista para migração devem ter pelo menos 180 dias de diferença.',
    })
    return
  }

  if (notaDigits.length !== NINE_DIGITS) {
    res.status(400).json({
      error: `O campo Nota deve ter exatamente ${NINE_DIGITS} dígitos.`,
    })
    return
  }

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
    [nome, instalacaoDigits, denuncia, migracao, notaDigits, req.user?.id ?? null],
  )

  const created = mapCliente({
    ...result.rows[0],
    created_by_name: req.user?.name ?? '',
    created_by_registration: req.user?.registration ?? '',
  })

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'consolidacao_carga_cliente',
    entityId: String(created.id),
    summary: `Cliente consolidação ${created.nomeCliente}`,
    newData: created,
  })

  res.status(201).json({ client: created })
}

export const consolidacaoCargaRoutes = {
  list: [requireAuth, listConsolidacaoCargaClientes],
  create: [requireAuth, createConsolidacaoCargaCliente],
}
