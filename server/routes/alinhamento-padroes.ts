import type { Request, Response } from 'express'
import { pool, query } from '../db.js'

const MESES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
const UMA_POSICAO = new Set(['49093', '49107'])

type ReferenciaRow = {
  id: string
  fabricante: string
  modelo: string
  classe: string
  tensao_nominal: string
  corrente_nominal: string
  frequencia: string
  kh_ke: string
  portaria_inmetro: string
  numero_serie: string
  updated_at: Date
}

type EquipamentoRow = {
  id: string
  identificacao: string
  codigo: string
  created_at: Date
}

type MedicaoRow = {
  id: string
  equipamento_id: string
  ano: number
  mes: number
  em_manutencao: boolean
}

type PosicaoRow = {
  medicao_id: string
  posicao: number
  nominal: string
  indutiva: string
  pequena: string
}

function mapReferencia(row: ReferenciaRow) {
  return {
    id: row.id,
    fabricante: row.fabricante,
    modelo: row.modelo,
    classe: row.classe,
    tensaoNominal: row.tensao_nominal,
    correnteNominal: row.corrente_nominal,
    frequencia: row.frequencia,
    khKe: row.kh_ke,
    portariaInmetro: row.portaria_inmetro,
    numeroSerie: row.numero_serie,
    updatedAt: row.updated_at.toISOString(),
  }
}

function textField(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseErro(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(',', '.')
  if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export async function getAlinhamentoPadroes(_req: Request, res: Response) {
  const [referencia, equipamentos, medicoes, posicoes] = await Promise.all([
    query<ReferenciaRow>(
      `SELECT id, fabricante, modelo, classe, tensao_nominal, corrente_nominal,
              frequencia, kh_ke, portaria_inmetro, numero_serie, updated_at
       FROM alinhamento_medidor_referencia
       ORDER BY updated_at DESC
       LIMIT 1`,
    ),
    query<EquipamentoRow>(
      `SELECT id, identificacao, codigo, created_at
       FROM alinhamento_equipamentos
       ORDER BY created_at ASC, codigo ASC`,
    ),
    query<MedicaoRow>(
      `SELECT id, equipamento_id, ano, mes, em_manutencao
       FROM alinhamento_medicoes
       ORDER BY ano, mes`,
    ),
    query<PosicaoRow>(
      `SELECT medicao_id, posicao, nominal::text AS nominal, indutiva::text AS indutiva,
              pequena::text AS pequena
       FROM alinhamento_medicao_posicoes
       ORDER BY medicao_id, posicao`,
    ),
  ])

  const posicoesByMedicao = new Map<string, PosicaoRow[]>()
  for (const row of posicoes.rows) {
    const list = posicoesByMedicao.get(row.medicao_id) ?? []
    list.push(row)
    posicoesByMedicao.set(row.medicao_id, list)
  }

  res.json({
    referencia: referencia.rows[0] ? mapReferencia(referencia.rows[0]) : null,
    equipamentos: equipamentos.rows.map((row) => ({
      id: row.id,
      identificacao: row.identificacao,
      codigo: row.codigo,
      createdAt: row.created_at.toISOString(),
    })),
    medicoes: medicoes.rows.map((row) => ({
      id: row.id,
      equipamentoId: row.equipamento_id,
      ano: row.ano,
      mes: row.mes,
      emManutencao: row.em_manutencao,
      posicoes: (posicoesByMedicao.get(row.id) ?? []).map((posicao) => ({
        posicao: posicao.posicao,
        nominal: posicao.nominal,
        indutiva: posicao.indutiva,
        pequena: posicao.pequena,
      })),
    })),
  })
}

export async function saveAlinhamentoReferencia(req: Request, res: Response) {
  const numeroSerie = textField(req.body?.numeroSerie)
  if (!numeroSerie) {
    res.status(400).json({ error: 'Informe o número de série do medidor referência.' })
    return
  }

  const fields = {
    fabricante: textField(req.body?.fabricante),
    modelo: textField(req.body?.modelo),
    classe: textField(req.body?.classe),
    tensaoNominal: textField(req.body?.tensaoNominal),
    correnteNominal: textField(req.body?.correnteNominal),
    frequencia: textField(req.body?.frequencia),
    khKe: textField(req.body?.khKe),
    portariaInmetro: textField(req.body?.portariaInmetro),
    numeroSerie,
  }

  const current = await query<{ id: string }>(
    `SELECT id FROM alinhamento_medidor_referencia ORDER BY updated_at DESC LIMIT 1`,
  )
  const id = current.rows[0]?.id ?? `alinh-ref-${Date.now()}`
  const saved = await query<ReferenciaRow>(
    `INSERT INTO alinhamento_medidor_referencia (
       id, fabricante, modelo, classe, tensao_nominal, corrente_nominal,
       frequencia, kh_ke, portaria_inmetro, numero_serie, updated_by_user_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO UPDATE SET
       fabricante = EXCLUDED.fabricante,
       modelo = EXCLUDED.modelo,
       classe = EXCLUDED.classe,
       tensao_nominal = EXCLUDED.tensao_nominal,
       corrente_nominal = EXCLUDED.corrente_nominal,
       frequencia = EXCLUDED.frequencia,
       kh_ke = EXCLUDED.kh_ke,
       portaria_inmetro = EXCLUDED.portaria_inmetro,
       numero_serie = EXCLUDED.numero_serie,
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       updated_at = NOW()
     RETURNING id, fabricante, modelo, classe, tensao_nominal, corrente_nominal,
               frequencia, kh_ke, portaria_inmetro, numero_serie, updated_at`,
    [
      id,
      fields.fabricante,
      fields.modelo,
      fields.classe,
      fields.tensaoNominal,
      fields.correnteNominal,
      fields.frequencia,
      fields.khKe,
      fields.portariaInmetro,
      fields.numeroSerie,
      req.user?.id ?? null,
    ],
  )

  res.json({ referencia: mapReferencia(saved.rows[0]) })
}

export async function createAlinhamentoEquipamento(req: Request, res: Response) {
  const identificacao = textField(req.body?.identificacao)
  const codigo = textField(req.body?.codigo)
  if (!identificacao || !codigo) {
    res.status(400).json({ error: 'Informe a identificação e o código do equipamento.' })
    return
  }

  const duplicate = await query<{ id: string }>(
    `SELECT id FROM alinhamento_equipamentos WHERE codigo = $1`,
    [codigo],
  )
  if (duplicate.rows[0]) {
    res.status(409).json({ error: 'Já existe um equipamento com esse código.' })
    return
  }

  const created = await query<EquipamentoRow>(
    `INSERT INTO alinhamento_equipamentos (id, identificacao, codigo, created_by_user_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, identificacao, codigo, created_at`,
    [`alinh-eq-${Date.now()}`, identificacao, codigo, req.user?.id ?? null],
  )
  const row = created.rows[0]
  res.status(201).json({
    equipamento: {
      id: row.id,
      identificacao: row.identificacao,
      codigo: row.codigo,
      createdAt: row.created_at.toISOString(),
    },
  })
}

export async function deleteAlinhamentoEquipamento(req: Request, res: Response) {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const removed = await query<{ id: string }>(
    `DELETE FROM alinhamento_equipamentos WHERE id = $1 RETURNING id`,
    [id],
  )
  if (!removed.rows[0]) {
    res.status(404).json({ error: 'Equipamento não encontrado.' })
    return
  }
  res.json({ ok: true, id })
}

type MedicaoInput = {
  equipamentoId: string
  emManutencao: boolean
  posicoes: Array<{ posicao: number; nominal: number; indutiva: number; pequena: number }>
}

function readMedicaoItens(value: unknown): MedicaoInput[] | null {
  if (!Array.isArray(value)) return null
  const itens: MedicaoInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const equipamentoId = textField((item as { equipamentoId?: unknown }).equipamentoId)
    if (!equipamentoId) return null
    const emManutencao = (item as { emManutencao?: unknown }).emManutencao === true
    const rawPosicoes = (item as { posicoes?: unknown }).posicoes
    const posicoes: MedicaoInput['posicoes'] = []
    if (!emManutencao) {
      if (!Array.isArray(rawPosicoes)) return null
      const seen = new Set<number>()
      for (const raw of rawPosicoes) {
        if (!raw || typeof raw !== 'object') return null
        const posicao = Number((raw as { posicao?: unknown }).posicao)
        if (!Number.isInteger(posicao) || posicao < 1 || posicao > 10 || seen.has(posicao)) {
          return null
        }
        const nominal = parseErro((raw as { nominal?: unknown }).nominal)
        const indutiva = parseErro((raw as { indutiva?: unknown }).indutiva)
        const pequena = parseErro((raw as { pequena?: unknown }).pequena)
        if (nominal == null || indutiva == null || pequena == null) return null
        seen.add(posicao)
        posicoes.push({ posicao, nominal, indutiva, pequena })
      }
      if (!posicoes.length) return null
    }
    itens.push({ equipamentoId, emManutencao, posicoes })
  }
  return itens
}

export async function saveAlinhamentoMedicoes(req: Request, res: Response) {
  const ano = Number(req.body?.ano)
  const mes = Number(req.body?.mes)
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100 || !MESES.has(mes)) {
    res.status(400).json({ error: 'Informe o ano e o mês da medição.' })
    return
  }
  const itens = readMedicaoItens(req.body?.itens)
  if (!itens?.length) {
    res.status(400).json({ error: 'Informe as medições do mês ou marque o equipamento em manutenção.' })
    return
  }

  const equipamentos = await query<{ id: string; codigo: string }>(
    `SELECT id, codigo FROM alinhamento_equipamentos WHERE id = ANY($1::text[])`,
    [itens.map((item) => item.equipamentoId)],
  )
  if (equipamentos.rows.length !== new Set(itens.map((item) => item.equipamentoId)).size) {
    res.status(400).json({ error: 'Há equipamento não cadastrado na medição.' })
    return
  }
  const codigoById = new Map(equipamentos.rows.map((row) => [row.id, row.codigo.trim()]))
  for (const item of itens) {
    const codigo = codigoById.get(item.equipamentoId) ?? ''
    if (
      !item.emManutencao &&
      UMA_POSICAO.has(codigo) &&
      (item.posicoes.length !== 1 || item.posicoes[0]?.posicao !== 1)
    ) {
      res.status(400).json({ error: `O equipamento ${codigo} registra apenas uma posição.` })
      return
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const item of itens) {
      const id = `alinh-med-${item.equipamentoId}-${ano}-${mes}`
      await client.query(
        `INSERT INTO alinhamento_medicoes (
           id, equipamento_id, ano, mes, em_manutencao, updated_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (equipamento_id, ano, mes) DO UPDATE SET
           em_manutencao = EXCLUDED.em_manutencao,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = NOW()`,
        [id, item.equipamentoId, ano, mes, item.emManutencao, req.user?.id ?? null],
      )
      await client.query(`DELETE FROM alinhamento_medicao_posicoes WHERE medicao_id = $1`, [id])
      for (const posicao of item.posicoes) {
        await client.query(
          `INSERT INTO alinhamento_medicao_posicoes (medicao_id, posicao, nominal, indutiva, pequena)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, posicao.posicao, posicao.nominal, posicao.indutiva, posicao.pequena],
        )
      }
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  await getAlinhamentoPadroes(req, res)
}
