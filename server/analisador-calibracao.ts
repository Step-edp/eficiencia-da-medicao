/**
 * Réplica das fórmulas de Calibração Analisadores 2026.xlsm
 * (DADOS ENTRADA, INCERTEZA e CERTIFICADO) para 127 V e 220 V.
 *
 * Padrão vigente na planilha: 45079_2024. Em 127 V e 220 V, as três fases
 * usam o erro médio e a incerteza de neutro (CN) desse certificado.
 * O limite de aprovação é ±1%, como nas colunas R–W do certificado.
 */

export const PADRAO_CALIBRACAO = {
  id: '45079_2024',
  serie: '45079',
  modelo: 'STE10/ SPE120.3 / SRS121.3',
  fabricante: 'MET',
  instrumento: 'MEDIDOR DE ENERGIA',
  certificado: '03451/24',
  classe: 0.0005,
  resolucao: 0.0001,
  erroMedio: 0.00003,
  incerteza: 0.00014,
  calibradoEm: '2024-06-04',
  proximaCalibracao: '2027-06-04',
  limite: 0.01,
  realizadoPor: 'Carlos Eduardo Bruni Alves',
  aprovadoPor: 'Acácio Moreira Junior',
} as const

export type TensaoCalibracao = '127V' | '220V'
export type FaseCalibracao = 'a' | 'b' | 'c'

export type MedicaoCalibracao = {
  voltage: TensaoCalibracao
  testeNumero: number
  padraoFaseA: number
  padraoFaseB: number
  padraoFaseC: number
  equipamentoFaseA: number
  equipamentoFaseB: number
  equipamentoFaseC: number
}

export type ResultadoFase = {
  ump: number
  ust: number
  erro: number
  incerteza: number
  k: number
  veff: number
  aprovado: boolean
}

export type ResultadoTensao = {
  voltage: TensaoCalibracao
  fases: Record<FaseCalibracao, ResultadoFase>
  aprovado: boolean
}

export type CertificadoCalibracao = {
  tensoes: ResultadoTensao[]
  resultado: 'Aprovado' | 'Reprovado'
}

const TENSOES: TensaoCalibracao[] = ['127V', '220V']
const FASES: FaseCalibracao[] = ['a', 'b', 'c']

const FASE_FIELDS: Record<
  FaseCalibracao,
  { padrao: keyof MedicaoCalibracao; equipamento: keyof MedicaoCalibracao }
> = {
  a: { padrao: 'padraoFaseA', equipamento: 'equipamentoFaseA' },
  b: { padrao: 'padraoFaseB', equipamento: 'equipamentoFaseB' },
  c: { padrao: 'padraoFaseC', equipamento: 'equipamentoFaseC' },
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sampleStdev(values: number[]) {
  const mean = average(values)
  const sum = values.reduce((total, value) => total + (value - mean) ** 2, 0)
  return Math.sqrt(sum / (values.length - 1))
}

function maxAbsError(errors: number[]) {
  let best = errors[0] ?? 0
  let bestAbs = Math.abs(best)
  for (const error of errors) {
    const abs = Math.abs(error)
    if (abs > bestAbs) {
      best = error
      bestAbs = abs
    }
  }
  return best
}

const LGAMMA_C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843696540789e-6,
  1.5056327351493116e-7,
]

function logGamma(value: number): number {
  if (value < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * value)) - logGamma(1 - value)
  }
  const z = value - 1
  let x = LGAMMA_C[0]
  for (let i = 1; i < LGAMMA_C.length; i += 1) x += LGAMMA_C[i] / (z + i)
  const t = z + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

function betacf(a: number, b: number, x: number) {
  const maxIterations = 200
  const epsilon = 3e-14
  const min = 1e-30
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < min) d = min
  d = 1 / d
  let h = d
  for (let m = 1; m <= maxIterations; m += 1) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < min) d = min
    c = 1 + aa / c
    if (Math.abs(c) < min) c = min
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < min) d = min
    c = 1 + aa / c
    if (Math.abs(c) < min) c = min
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < epsilon) break
  }
  return h
}

function regularizedBeta(x: number, a: number, b: number) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const ln =
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  const front = Math.exp(ln)
  if (x < (a + 1) / (a + b + 2)) return (front * betacf(a, b, x)) / a
  return 1 - (front * betacf(b, a, 1 - x)) / b
}

function studentTCdf(t: number, df: number) {
  const x = df / (df + t * t)
  const tail = 0.5 * regularizedBeta(x, df / 2, 0.5)
  return t >= 0 ? 1 - tail : tail
}

function studentTPdf(t: number, df: number) {
  const ln =
    logGamma((df + 1) / 2) -
    logGamma(df / 2) -
    0.5 * Math.log(df * Math.PI) -
    ((df + 1) / 2) * Math.log(1 + (t * t) / df)
  return Math.exp(ln)
}

/** T.INV.2T(probability, degFreedom), igual ao Excel. */
export function tInv2T(probability: number, degFreedom: number) {
  if (!(degFreedom > 0) || !(probability > 0) || probability >= 1) return 1.959963984540054
  const target = 1 - probability / 2
  let t = degFreedom > 2 ? 1.96 : 2.5
  for (let i = 0; i < 40; i += 1) {
    const pdf = studentTPdf(t, degFreedom)
    if (!(pdf > 0)) break
    const delta = (studentTCdf(t, degFreedom) - target) / pdf
    t -= delta
    if (!Number.isFinite(t) || t <= 0) return 1.959963984540054
    if (Math.abs(delta) < 1e-12) break
  }
  return t
}

function dentroDoLimite(value: number) {
  if (value < 0) return value >= -PADRAO_CALIBRACAO.limite
  return value <= PADRAO_CALIBRACAO.limite
}

function expandedUncertainty(stdev: number) {
  const sqrt3 = Math.sqrt(3)
  const estimado = [
    stdev / sqrt3,
    PADRAO_CALIBRACAO.erroMedio / sqrt3,
    PADRAO_CALIBRACAO.classe / sqrt3,
    PADRAO_CALIBRACAO.incerteza / 2,
    PADRAO_CALIBRACAO.resolucao / 2,
  ]
  const combinada = Math.sqrt(estimado.reduce((sum, value) => sum + value ** 2, 0))
  const veffDenominator =
    estimado[0] ** 4 / 4 +
    estimado.slice(1).reduce((sum, value) => sum + value ** 4 / 100000, 0)
  const veff = veffDenominator > 0 ? combinada ** 4 / veffDenominator : Number.POSITIVE_INFINITY
  // O Excel trunca os graus de liberdade de T.INV.2T para inteiro.
  const k = tInv2T(0.05, Math.max(1, Math.trunc(veff)))
  return { incerteza: combinada * k, k, veff }
}

function avaliarFase(leituras: Array<{ padrao: number; equipamento: number }>): ResultadoFase | null {
  if (leituras.length !== 5) return null
  if (leituras.some((item) => !Number.isFinite(item.padrao) || item.padrao === 0)) return null
  if (leituras.some((item) => !Number.isFinite(item.equipamento))) return null

  const errors = leituras.map((item) => (item.equipamento - item.padrao) / item.padrao)
  const erro = maxAbsError(errors)
  const { incerteza, k, veff } = expandedUncertainty(sampleStdev(errors))
  const aprovado = dentroDoLimite(erro + incerteza) && dentroDoLimite(erro - incerteza)

  return {
    ump: average(leituras.map((item) => item.padrao)),
    ust: average(leituras.map((item) => item.equipamento)),
    erro,
    incerteza,
    k,
    veff,
    aprovado,
  }
}

function toNumber(value: number | string) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : Number.NaN
}

export function buildCertificado(
  medicoes: Array<{
    voltage: string
    testeNumero: number | string
    padraoFaseA: number | string
    padraoFaseB: number | string
    padraoFaseC: number | string
    equipamentoFaseA: number | string
    equipamentoFaseB: number | string
    equipamentoFaseC: number | string
  }>,
): CertificadoCalibracao | null {
  const rows: MedicaoCalibracao[] = medicoes.map((row) => ({
    voltage: row.voltage === '220V' ? '220V' : '127V',
    testeNumero: Number(row.testeNumero),
    padraoFaseA: toNumber(row.padraoFaseA),
    padraoFaseB: toNumber(row.padraoFaseB),
    padraoFaseC: toNumber(row.padraoFaseC),
    equipamentoFaseA: toNumber(row.equipamentoFaseA),
    equipamentoFaseB: toNumber(row.equipamentoFaseB),
    equipamentoFaseC: toNumber(row.equipamentoFaseC),
  }))

  const tensoes: ResultadoTensao[] = []
  for (const voltage of TENSOES) {
    const fases = {} as Record<FaseCalibracao, ResultadoFase>
    for (const fase of FASES) {
      const fields = FASE_FIELDS[fase]
      const leituras = rows
        .filter((row) => row.voltage === voltage)
        .sort((a, b) => a.testeNumero - b.testeNumero)
        .map((row) => ({
          padrao: Number(row[fields.padrao]),
          equipamento: Number(row[fields.equipamento]),
        }))
      const resultado = avaliarFase(leituras)
      if (!resultado) return null
      fases[fase] = resultado
    }
    tensoes.push({
      voltage,
      fases,
      aprovado: FASES.every((fase) => fases[fase].aprovado),
    })
  }

  return {
    tensoes,
    resultado: tensoes.every((tensao) => tensao.aprovado) ? 'Aprovado' : 'Reprovado',
  }
}

export function formatVolt(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

export function formatErroPercent(value: number) {
  return `${(value * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })}%`
}

export function formatClassePadrao(value: number) {
  return `${(value * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`
}

export function formatIsoDate(value: string | null | undefined) {
  if (!value) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value
  return `${match[3]}/${match[2]}/${match[1]}`
}
