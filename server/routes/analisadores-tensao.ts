import type { Request, Response } from 'express'
import { query, pool } from '../db.js'
import { writeAuditLog } from '../audit.js'

export type AnalisadorModeloCatalogEntry = {
  modelo: string
  fabricante: string
  classe: string
  vn: string
  vmax: string
  instrumento: string
}

export const ANALISADOR_MODELO_CATALOG: AnalisadorModeloCatalogEntry[] = [
  { modelo: 'P300', fabricante: 'IMS', classe: '0,50%', vn: '70V', vmax: '300V', instrumento: 'MEDIDOR REGISTRADOR DE TENSÃO - MERT' },
  { modelo: 'P600', fabricante: 'IMS', classe: '0,50%', vn: '70V', vmax: '300V', instrumento: 'MEDIDOR REGISTRADOR DE TENSÃO - MERT' },
  { modelo: 'RE7000', fabricante: 'EMBRASUL', classe: '0,20%', vn: '70V', vmax: '500V', instrumento: 'MEDIDOR REGISTRADOR DE TENSÃO - MERT' },
  { modelo: 'RV4080', fabricante: 'EMBRASUL', classe: '0,20%', vn: '85V', vmax: '300V', instrumento: 'MEDIDOR REGISTRADOR DE TENSÃO - MERT' },
  { modelo: 'RV5', fabricante: 'EMBRASUL', classe: '0,50%', vn: '80V', vmax: '300V', instrumento: 'MEDIDOR REGISTRADOR DE TENSÃO - MERT' },
  { modelo: 'RE7080', fabricante: 'EMBRASUL', classe: '0,20%', vn: '70V', vmax: '300V', instrumento: 'MEDIDOR REGISTRADOR DE TENSÃO - MERT' },
  { modelo: 'P700', fabricante: 'IMS', classe: '0,20%', vn: '70V', vmax: '300V', instrumento: 'MEDIDOR REGISTRADOR DE TENSÃO - MERT' },
]

function findModeloCatalogEntry(modelo: string) {
  return ANALISADOR_MODELO_CATALOG.find(
    (entry) => entry.modelo.toLowerCase() === modelo.toLowerCase(),
  )
}

type AnalisadorTensaoRow = {
  id: string
  equipment_number: string
  numero_serie: string
  identificacao_laudo: string
  modelo: string
  fabricante: string
  classe: string
  vn: string
  vmax: string
  instrumento: string
  primeira_calibracao: boolean
  data_ultima_calibracao: string | null
  resultado_ultima_calibracao: 'Aprovado' | 'Reprovado' | null
  created_by_user_id: string | null
  created_by_name: string | null
  created_by_registration: string | null
  created_at: Date
}

function mapAnalisador(row: AnalisadorTensaoRow) {
  return {
    id: row.id,
    equipmentNumber: row.equipment_number,
    numeroSerie: row.numero_serie,
    identificacaoLaudo: row.identificacao_laudo,
    modelo: row.modelo,
    fabricante: row.fabricante,
    classe: row.classe,
    vn: row.vn,
    vmax: row.vmax,
    instrumento: row.instrumento,
    primeiraCalibracao: row.primeira_calibracao,
    dataUltimaCalibracao: row.data_ultima_calibracao,
    resultadoUltimaCalibracao: row.resultado_ultima_calibracao,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    createdByRegistration: row.created_by_registration,
    createdAt: row.created_at.toISOString(),
  }
}

async function nextEquipmentNumber() {
  const result = await query<{ n: string }>(
    `SELECT nextval('analisador_tensao_seq')::text AS n`,
  )
  return `AT-${String(result.rows[0].n).padStart(5, '0')}`
}

export async function listAnalisadorModelos(_req: Request, res: Response) {
  res.json({ modelos: ANALISADOR_MODELO_CATALOG })
}

export async function listAnalisadoresTensao(_req: Request, res: Response) {
  const result = await query<AnalisadorTensaoRow>(
    `SELECT a.id, a.equipment_number, a.numero_serie, a.identificacao_laudo, a.modelo,
            a.fabricante, a.classe, a.vn, a.vmax, a.instrumento, a.primeira_calibracao,
            a.data_ultima_calibracao::text AS data_ultima_calibracao,
            a.resultado_ultima_calibracao,
            a.created_by_user_id, a.created_at,
            u.name AS created_by_name,
            u.registration AS created_by_registration
     FROM analisadores_tensao a
     LEFT JOIN users u ON u.id = a.created_by_user_id
     ORDER BY a.created_at DESC`,
  )
  res.json({ analisadores: result.rows.map(mapAnalisador) })
}

export async function createAnalisadorTensao(req: Request, res: Response) {
  const user = req.user
  if (!user) {
    res.status(401).json({ error: 'Não autenticado.' })
    return
  }

  const numeroSerie =
    typeof req.body?.numeroSerie === 'string' ? req.body.numeroSerie.trim() : ''
  const identificacaoLaudo =
    typeof req.body?.identificacaoLaudo === 'string'
      ? req.body.identificacaoLaudo.trim()
      : ''
  const modelo = typeof req.body?.modelo === 'string' ? req.body.modelo.trim() : ''

  if (!numeroSerie || !identificacaoLaudo || !modelo) {
    res.status(400).json({ error: 'Informe número de série, identificação do laudo e modelo.' })
    return
  }

  const catalogEntry = findModeloCatalogEntry(modelo)
  if (!catalogEntry) {
    res.status(400).json({ error: 'Modelo não reconhecido.' })
    return
  }

  const existing = await query<{ id: string }>(
    `SELECT id FROM analisadores_tensao WHERE numero_serie = $1 LIMIT 1`,
    [numeroSerie],
  )
  if (existing.rows.length) {
    res.status(409).json({ error: 'Já existe um analisador cadastrado com esse número de série.' })
    return
  }

  const primeiraCalibracao = req.body?.primeiraCalibracao === true
  const dataUltimaCalibracaoRaw =
    typeof req.body?.dataUltimaCalibracao === 'string'
      ? req.body.dataUltimaCalibracao.trim()
      : ''

  const resultadoUltimaCalibracaoRaw =
    typeof req.body?.resultadoUltimaCalibracao === 'string'
      ? req.body.resultadoUltimaCalibracao.trim()
      : ''

  if (!primeiraCalibracao && !dataUltimaCalibracaoRaw) {
    res.status(400).json({
      error: 'Informe a data da última calibração ou marque primeira calibração.',
    })
    return
  }

  if (
    !primeiraCalibracao &&
    resultadoUltimaCalibracaoRaw !== 'Aprovado' &&
    resultadoUltimaCalibracaoRaw !== 'Reprovado'
  ) {
    res.status(400).json({
      error: 'Informe o resultado da última calibração (Aprovado ou Reprovado).',
    })
    return
  }

  const dataUltimaCalibracao = primeiraCalibracao ? null : dataUltimaCalibracaoRaw
  const resultadoUltimaCalibracao = primeiraCalibracao
    ? null
    : (resultadoUltimaCalibracaoRaw as 'Aprovado' | 'Reprovado')

  const id = `at-${Date.now()}`
  const equipmentNumber = await nextEquipmentNumber()

  let insert
  try {
    insert = await query<
      Omit<AnalisadorTensaoRow, 'created_by_name' | 'created_by_registration'>
    >(
      `INSERT INTO analisadores_tensao (
         id, equipment_number, numero_serie, identificacao_laudo, modelo, fabricante, classe,
         vn, vmax, instrumento, primeira_calibracao, data_ultima_calibracao,
         resultado_ultima_calibracao, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, equipment_number, numero_serie, identificacao_laudo, modelo, fabricante,
         classe, vn, vmax, instrumento, primeira_calibracao,
         data_ultima_calibracao::text AS data_ultima_calibracao, resultado_ultima_calibracao,
         created_by_user_id, created_at`,
      [
        id,
        equipmentNumber,
        numeroSerie,
        identificacaoLaudo,
        catalogEntry.modelo,
        catalogEntry.fabricante,
        catalogEntry.classe,
        catalogEntry.vn,
        catalogEntry.vmax,
        catalogEntry.instrumento,
        primeiraCalibracao,
        dataUltimaCalibracao,
        resultadoUltimaCalibracao,
        user.id,
      ],
    )
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      res
        .status(409)
        .json({ error: 'Já existe um analisador cadastrado com esse número de série.' })
      return
    }
    throw error
  }

  const analisador = mapAnalisador({
    ...insert.rows[0],
    created_by_name: null,
    created_by_registration: user.registration,
  })

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'analisador_tensao',
    entityId: analisador.id,
    summary: `Analisador de tensão ${analisador.equipmentNumber} cadastrado`,
    newData: analisador,
  })

  res.status(201).json({ analisador })
}

type EnsaioMedicaoRow = {
  analisadorId: string
  voltage: '127V' | '220V'
  testeNumero: number
  padraoFaseA: number
  padraoFaseB: number
  padraoFaseC: number
  equipamentoFaseA: number
  equipamentoFaseB: number
  equipamentoFaseC: number
}

function parseEnsaioRows(body: unknown): EnsaioMedicaoRow[] | null {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { rows?: unknown }).rows)) {
    return null
  }
  const rawRows = (body as { rows: unknown[] }).rows
  const rows: EnsaioMedicaoRow[] = []

  for (const raw of rawRows) {
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>

    const numericFields = [
      'padraoFaseA',
      'padraoFaseB',
      'padraoFaseC',
      'equipamentoFaseA',
      'equipamentoFaseB',
      'equipamentoFaseC',
    ] as const

    const parsedNumbers: Record<(typeof numericFields)[number], number> = {} as never
    for (const field of numericFields) {
      const value = typeof r[field] === 'number' ? r[field] : Number(r[field])
      if (typeof value !== 'number' || !Number.isFinite(value)) return null
      parsedNumbers[field] = value as number
    }

    if (typeof r.analisadorId !== 'string' || !r.analisadorId.trim()) return null
    if (r.voltage !== '127V' && r.voltage !== '220V') return null
    const testeNumero = Number(r.testeNumero)
    if (!Number.isInteger(testeNumero) || testeNumero < 1 || testeNumero > 5) return null

    rows.push({
      analisadorId: r.analisadorId,
      voltage: r.voltage,
      testeNumero,
      ...parsedNumbers,
    })
  }

  return rows
}

export async function registrarEnsaioAnalisadores(req: Request, res: Response) {
  const user = req.user
  if (!user) {
    res.status(401).json({ error: 'Não autenticado.' })
    return
  }

  const rows = parseEnsaioRows(req.body)
  if (!rows || !rows.length) {
    res.status(400).json({ error: 'Dados de ensaio inválidos.' })
    return
  }

  const analisadorIds = [...new Set(rows.map((row) => row.analisadorId))]

  const existing = await query<{ id: string }>(
    `SELECT id FROM analisadores_tensao WHERE id = ANY($1::text[])`,
    [analisadorIds],
  )
  const existingIds = new Set(existing.rows.map((row) => row.id))
  const missing = analisadorIds.filter((id) => !existingIds.has(id))
  if (missing.length) {
    res.status(404).json({ error: 'Um ou mais analisadores não foram encontrados.' })
    return
  }

  const ensaioId = `ens-${Date.now()}`

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const row of rows) {
      await client.query(
        `INSERT INTO analisador_tensao_ensaio_medicoes (
           ensaio_id, analisador_id, voltage, teste_numero,
           padrao_fase_a, padrao_fase_b, padrao_fase_c,
           equipamento_fase_a, equipamento_fase_b, equipamento_fase_c,
           created_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          ensaioId,
          row.analisadorId,
          row.voltage,
          row.testeNumero,
          row.padraoFaseA,
          row.padraoFaseB,
          row.padraoFaseC,
          row.equipamentoFaseA,
          row.equipamentoFaseB,
          row.equipamentoFaseC,
          user.id,
        ],
      )
    }

    await client.query(
      `UPDATE analisadores_tensao
       SET primeira_calibracao = FALSE,
           data_ultima_calibracao = CURRENT_DATE
       WHERE id = ANY($1::text[])`,
      [analisadorIds],
    )

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  const updated = await query<AnalisadorTensaoRow>(
    `SELECT a.id, a.equipment_number, a.numero_serie, a.identificacao_laudo, a.modelo,
            a.fabricante, a.classe, a.vn, a.vmax, a.instrumento, a.primeira_calibracao,
            a.data_ultima_calibracao::text AS data_ultima_calibracao,
            a.resultado_ultima_calibracao,
            a.created_by_user_id, a.created_at,
            u.name AS created_by_name,
            u.registration AS created_by_registration
     FROM analisadores_tensao a
     LEFT JOIN users u ON u.id = a.created_by_user_id
     WHERE a.id = ANY($1::text[])`,
    [analisadorIds],
  )

  const analisadores = updated.rows.map(mapAnalisador)

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'analisador_tensao',
    entityId: ensaioId,
    summary: `Ensaio registrado para ${analisadorIds.length} analisador(es) de tensão (127V e 220V, 5 testes cada)`,
    newData: { ensaioId, analisadorIds, rowCount: rows.length },
  })

  res.json({ analisadores })
}

type EnsaioMedicaoDbRow = {
  voltage: '127V' | '220V'
  teste_numero: number
  padrao_fase_a: string
  padrao_fase_b: string
  padrao_fase_c: string
  equipamento_fase_a: string
  equipamento_fase_b: string
  equipamento_fase_c: string
}

export async function getAnalisadorEnsaioMedicoes(req: Request, res: Response) {
  const id = typeof req.params.id === 'string' ? req.params.id : ''

  const analisador = await query<{ id: string }>(
    `SELECT id FROM analisadores_tensao WHERE id = $1`,
    [id],
  )
  if (!analisador.rows[0]) {
    res.status(404).json({ error: 'Analisador não encontrado.' })
    return
  }

  const latest = await query<{ ensaio_id: string }>(
    `SELECT ensaio_id FROM analisador_tensao_ensaio_medicoes
     WHERE analisador_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [id],
  )

  if (!latest.rows[0]) {
    res.json({ ensaioId: null, medicoes: [] })
    return
  }

  const ensaioId = latest.rows[0].ensaio_id

  const result = await query<EnsaioMedicaoDbRow>(
    `SELECT voltage, teste_numero, padrao_fase_a, padrao_fase_b, padrao_fase_c,
            equipamento_fase_a, equipamento_fase_b, equipamento_fase_c
     FROM analisador_tensao_ensaio_medicoes
     WHERE analisador_id = $1 AND ensaio_id = $2
     ORDER BY voltage ASC, teste_numero ASC`,
    [id, ensaioId],
  )

  res.json({
    ensaioId,
    medicoes: result.rows.map((row) => ({
      voltage: row.voltage,
      testeNumero: row.teste_numero,
      padraoFaseA: row.padrao_fase_a,
      padraoFaseB: row.padrao_fase_b,
      padraoFaseC: row.padrao_fase_c,
      equipamentoFaseA: row.equipamento_fase_a,
      equipamentoFaseB: row.equipamento_fase_b,
      equipamentoFaseC: row.equipamento_fase_c,
    })),
  })
}
