import { query } from './db.js'
import { alinhamentoPadroes2026 } from './alinhamento-padroes-2026.js'

type SeedPosicao = {
  posicao: number
  nominal: number
  indutiva: number
  pequena: number
}

type SeedMedicao = {
  equipamentoId: string
  ano: number
  mes: number
  emManutencao: boolean
  posicoes: SeedPosicao[]
}

const seed = alinhamentoPadroes2026 as {
  referencia: {
    id: string
    fabricante: string
    modelo: string
    classe: string
    tensaoNominal: string
    correnteNominal: string
    frequencia: string
    khKe: string
    portariaInmetro: string
    numeroSerie: string
  }
  equipamentos: Array<{ id: string; identificacao: string; codigo: string }>
  medicoes: SeedMedicao[]
}

export async function seedAlinhamentoPadroes() {
  const existing = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM alinhamento_equipamentos`,
  )
  if (Number(existing.rows[0]?.total ?? 0) > 0) return

  const referencia = seed.referencia
  await query(
    `INSERT INTO alinhamento_medidor_referencia (
       id, fabricante, modelo, classe, tensao_nominal, corrente_nominal,
       frequencia, kh_ke, portaria_inmetro, numero_serie
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO NOTHING`,
    [
      referencia.id,
      referencia.fabricante,
      referencia.modelo,
      referencia.classe,
      referencia.tensaoNominal,
      referencia.correnteNominal,
      referencia.frequencia,
      referencia.khKe,
      referencia.portariaInmetro,
      referencia.numeroSerie,
    ],
  )

  for (const equipamento of seed.equipamentos) {
    await query(
      `INSERT INTO alinhamento_equipamentos (id, identificacao, codigo)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [equipamento.id, equipamento.identificacao, equipamento.codigo],
    )
  }

  for (const medicao of seed.medicoes) {
    const id = `alinh-med-${medicao.equipamentoId}-${medicao.ano}-${medicao.mes}`
    await query(
      `INSERT INTO alinhamento_medicoes (id, equipamento_id, ano, mes, em_manutencao)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (equipamento_id, ano, mes) DO NOTHING`,
      [id, medicao.equipamentoId, medicao.ano, medicao.mes, medicao.emManutencao],
    )
    for (const posicao of medicao.posicoes) {
      await query(
        `INSERT INTO alinhamento_medicao_posicoes (medicao_id, posicao, nominal, indutiva, pequena)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (medicao_id, posicao) DO NOTHING`,
        [id, posicao.posicao, posicao.nominal, posicao.indutiva, posicao.pequena],
      )
    }
  }
}
