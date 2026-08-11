import type { Request, Response } from 'express'
import { query } from '../db.js'
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

  const insert = await query<
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
