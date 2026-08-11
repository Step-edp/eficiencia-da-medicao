import { query } from './db.js'
import { ANALISADOR_MODELO_CATALOG } from './routes/analisadores-tensao.js'

type BulkRow = {
  identificacaoLaudo: string
  numeroSerie: string
  modelo: string
  dataUltimaCalibracao: string
  resultadoUltimaCalibracao: 'Aprovado' | 'Reprovado'
}

const BULK_ROWS: BulkRow[] = [
  { identificacaoLaudo: 'VM2_2024/029', numeroSerie: '100036072', modelo: 'P300', dataUltimaCalibracao: '2024-06-14', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/079', numeroSerie: '100128047', modelo: 'P300', dataUltimaCalibracao: '2024-06-14', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM1_2024/196', numeroSerie: '100130028', modelo: 'P300', dataUltimaCalibracao: '2024-06-14', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/093', numeroSerie: '167856', modelo: 'P600', dataUltimaCalibracao: '2024-06-14', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/034', numeroSerie: '100130007', modelo: 'P300', dataUltimaCalibracao: '2024-06-14', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/001', numeroSerie: '100128037', modelo: 'P300', dataUltimaCalibracao: '2024-06-14', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/026', numeroSerie: '100036011', modelo: 'P600', dataUltimaCalibracao: '2024-06-14', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/078', numeroSerie: '100180000', modelo: 'P300', dataUltimaCalibracao: '2024-06-14', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2022/066', numeroSerie: '100128046', modelo: 'P300', dataUltimaCalibracao: '2024-08-19', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2022/064', numeroSerie: '100128002', modelo: 'P300', dataUltimaCalibracao: '2024-08-19', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2022/103', numeroSerie: '100128038', modelo: 'P300', dataUltimaCalibracao: '2024-08-19', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM1_2024/197', numeroSerie: '100098039', modelo: 'RV5', dataUltimaCalibracao: '2024-08-19', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM1_2024/198', numeroSerie: '100098060', modelo: 'RE7080', dataUltimaCalibracao: '2024-08-19', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2022/103', numeroSerie: '100128045', modelo: 'P300', dataUltimaCalibracao: '2024-08-19', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2022/103', numeroSerie: '60020', modelo: 'P700', dataUltimaCalibracao: '2024-08-19', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM1_2024/199', numeroSerie: '60017', modelo: 'P700', dataUltimaCalibracao: '2024-08-19', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM1_2024/200', numeroSerie: '100098047', modelo: 'RE7080', dataUltimaCalibracao: '2024-08-19', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/106', numeroSerie: '100130018', modelo: 'P300', dataUltimaCalibracao: '2024-08-23', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/071', numeroSerie: '100130042', modelo: 'P300', dataUltimaCalibracao: '2024-08-23', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/090', numeroSerie: '167857', modelo: 'P600', dataUltimaCalibracao: '2024-08-23', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/113', numeroSerie: '100128032', modelo: 'P300', dataUltimaCalibracao: '2024-08-23', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/046', numeroSerie: '100130021', modelo: 'P300', dataUltimaCalibracao: '2024-08-23', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/036', numeroSerie: '100130041', modelo: 'P300', dataUltimaCalibracao: '2024-08-23', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM1_2024/2001', numeroSerie: '100182000', modelo: 'P600', dataUltimaCalibracao: '2024-08-23', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/035', numeroSerie: '100130006', modelo: 'P300', dataUltimaCalibracao: '2024-08-23', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/091', numeroSerie: '167858', modelo: 'P600', dataUltimaCalibracao: '2024-08-23', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/092', numeroSerie: '167859', modelo: 'P600', dataUltimaCalibracao: '2024-08-23', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/070', numeroSerie: '100130037', modelo: 'P300', dataUltimaCalibracao: '2024-08-23', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/073', numeroSerie: '100128044', modelo: 'P300', dataUltimaCalibracao: '2024-08-23', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/003', numeroSerie: '100130012', modelo: 'P300', dataUltimaCalibracao: '2024-08-30', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/002', numeroSerie: '100128041', modelo: 'P300', dataUltimaCalibracao: '2024-08-30', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/010', numeroSerie: '100128003', modelo: 'P300', dataUltimaCalibracao: '2024-08-30', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/007', numeroSerie: '100128039', modelo: 'P300', dataUltimaCalibracao: '2024-08-30', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/008', numeroSerie: '100130029', modelo: 'P300', dataUltimaCalibracao: '2024-08-30', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/011', numeroSerie: '100130014', modelo: 'P300', dataUltimaCalibracao: '2024-08-30', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/004', numeroSerie: '100128011', modelo: 'P300', dataUltimaCalibracao: '2024-08-30', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/068', numeroSerie: '3111425', modelo: 'P300', dataUltimaCalibracao: '2024-08-30', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/102', numeroSerie: '100128043', modelo: 'P300', dataUltimaCalibracao: '2024-08-30', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/065', numeroSerie: '100130044', modelo: 'P300', dataUltimaCalibracao: '2024-08-30', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/012', numeroSerie: '100128027', modelo: 'P300', dataUltimaCalibracao: '2024-09-06', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/015', numeroSerie: '100122033', modelo: 'P300', dataUltimaCalibracao: '2024-09-06', resultadoUltimaCalibracao: 'Reprovado' },
  { identificacaoLaudo: 'VM2_2024/020', numeroSerie: '100130032', modelo: 'P300', dataUltimaCalibracao: '2024-09-06', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/014', numeroSerie: '100122032', modelo: 'P300', dataUltimaCalibracao: '2024-09-06', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/022', numeroSerie: '100130005', modelo: 'P300', dataUltimaCalibracao: '2024-09-06', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/016', numeroSerie: '100128000', modelo: 'P300', dataUltimaCalibracao: '2024-09-06', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/162', numeroSerie: '100130034', modelo: 'P300', dataUltimaCalibracao: '2024-09-06', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/019', numeroSerie: '100130003', modelo: 'P300', dataUltimaCalibracao: '2024-09-06', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/017', numeroSerie: '100130022', modelo: 'P300', dataUltimaCalibracao: '2024-09-06', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/018', numeroSerie: '100130026', modelo: 'P300', dataUltimaCalibracao: '2024-09-06', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/055', numeroSerie: '100130039', modelo: 'P300', dataUltimaCalibracao: '2024-09-16', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/058', numeroSerie: '100130013', modelo: 'P300', dataUltimaCalibracao: '2024-09-16', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/044', numeroSerie: '100130011', modelo: 'P300', dataUltimaCalibracao: '2024-09-16', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/082', numeroSerie: '100128035', modelo: 'P300', dataUltimaCalibracao: '2024-09-16', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/057', numeroSerie: '100128001', modelo: 'P300', dataUltimaCalibracao: '2024-09-16', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/021', numeroSerie: '100128016', modelo: 'P300', dataUltimaCalibracao: '2024-09-16', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/075', numeroSerie: '100128025', modelo: 'P300', dataUltimaCalibracao: '2024-09-16', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/060', numeroSerie: '100130038', modelo: 'P300', dataUltimaCalibracao: '2024-09-17', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/049', numeroSerie: '100130043', modelo: 'P300', dataUltimaCalibracao: '2024-09-17', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/051', numeroSerie: '100130008', modelo: 'P300', dataUltimaCalibracao: '2024-09-17', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/050', numeroSerie: '100128036', modelo: 'P300', dataUltimaCalibracao: '2024-09-17', resultadoUltimaCalibracao: 'Aprovado' },
  { identificacaoLaudo: 'VM2_2024/048', numeroSerie: '100128017', modelo: 'P300', dataUltimaCalibracao: '2024-09-17', resultadoUltimaCalibracao: 'Aprovado' },
]

async function nextEquipmentNumber() {
  const result = await query<{ n: string }>(`SELECT nextval('analisador_tensao_seq')::text AS n`)
  return `AT-${String(result.rows[0].n).padStart(5, '0')}`
}

export async function seedAnalisadoresTensaoBulkImport() {
  const existing = await query<{ numero_serie: string }>(
    `SELECT numero_serie FROM analisadores_tensao WHERE numero_serie = ANY($1::text[])`,
    [BULK_ROWS.map((row) => row.numeroSerie)],
  )
  const existingSet = new Set(existing.rows.map((row) => row.numero_serie))
  const pending = BULK_ROWS.filter((row) => !existingSet.has(row.numeroSerie))

  if (!pending.length) return

  const userResult = await query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    ['stephanieps.amorim@gmail.com'],
  )
  const userId = userResult.rows[0]?.id ?? null

  let created = 0
  for (const row of pending) {
    const catalogEntry = ANALISADOR_MODELO_CATALOG.find((entry) => entry.modelo === row.modelo)
    if (!catalogEntry) {
      console.error(`Bulk import: modelo desconhecido "${row.modelo}" (série ${row.numeroSerie}), pulando.`)
      continue
    }

    const id = `at-bulk-${row.numeroSerie}`
    const equipmentNumber = await nextEquipmentNumber()

    await query(
      `INSERT INTO analisadores_tensao (
         id, equipment_number, numero_serie, identificacao_laudo, modelo, fabricante, classe,
         vn, vmax, instrumento, primeira_calibracao, data_ultima_calibracao,
         resultado_ultima_calibracao, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, $11, $12, $13)
       ON CONFLICT (numero_serie) DO NOTHING`,
      [
        id,
        equipmentNumber,
        row.numeroSerie,
        row.identificacaoLaudo,
        catalogEntry.modelo,
        catalogEntry.fabricante,
        catalogEntry.classe,
        catalogEntry.vn,
        catalogEntry.vmax,
        catalogEntry.instrumento,
        row.dataUltimaCalibracao,
        row.resultadoUltimaCalibracao,
        userId,
      ],
    )
    created += 1
  }

  await query(
    `INSERT INTO audit_logs (
       user_id, user_registration, user_role, action, entity_type, entity_id,
       summary, metadata
     ) VALUES ($1, NULL, NULL, 'create', 'analisador_tensao', NULL, $2, $3::jsonb)`,
    [
      userId,
      `Importação em massa de ${created} analisador(es) de tensão`,
      JSON.stringify({ bulkImport: true, count: created }),
    ],
  )

  console.log(`Bulk import de analisadores de tensão: ${created} registro(s) criado(s).`)
}
