/**
 * O que o botão ORDENA do 002. Modelador faz, e a comparação com a conta do SAP.
 *
 * O texto de cada tela do Hemera entra no primeiro quadradinho: consumo em A2,
 * demanda em I2 e fator de potência em R2. A rotina recorta a tabela de 15
 * minutos e monta a aba MÊS_ANO a partir da linha 3.
 */

export const COLUNAS = [
  'Data',
  'Dia',
  'Postos horários',
  'kWh fornecido',
  'kVArh indutivo',
  'kVArh capacitivo',
  'kW fornecido',
  'kVAr indutivo',
  'kVAr capacitivo',
  'UFER',
  'DMCR',
  'Fator',
  'Tipo',
  'Segmentos reativos',
] as const

export type NomeColuna = (typeof COLUNAS)[number]

export const COLUNAS_NUMERO = new Set<NomeColuna>([
  'kWh fornecido',
  'kVArh indutivo',
  'kVArh capacitivo',
  'kW fornecido',
  'kVAr indutivo',
  'kVAr capacitivo',
  'UFER',
  'DMCR',
  'Fator',
])

const CONSUMO_ORIGEM = { linha: 2, coluna: 1 }
const DEMANDA_ORIGEM = { linha: 2, coluna: 9 }
const FP_ORIGEM = { linha: 2, coluna: 18 }
const LINHA_MES_ANO = 3
const COL_CONSUMO = 1
const COL_DEMANDA = 7
const COL_FP = 12
const COL_SEGMENTO = 14

const POSTOS = ['Ponta', 'Reservado', 'Fora Ponta'] as const
export const LIMITE_DIFERENCA = 1

export type LinhaMemoria = Record<NomeColuna, string | null>

export type MedicaoSap = {
  grandeza: string
  medido: string
  medidor?: string
}

export type ComparacaoItem = {
  grupo: string
  posto: string
  sap: string
  hemera: number | null
  sapMedido: number | null
  diferenca: number | null
  impede: boolean
}

export type ResumoMemoria = {
  Consumo: Record<(typeof POSTOS)[number], number>
  Demanda: Record<(typeof POSTOS)[number], number | null>
  UFER: Record<(typeof POSTOS)[number], number>
  DRE: Record<(typeof POSTOS)[number], number | null>
  EneReatCap: { Reservado: number }
  'kVArh indutivo': Record<(typeof POSTOS)[number], number>
}

export type ResultadoModelador = {
  linhas: LinhaMemoria[]
  erros: string[]
  disponibilidade: { consumo: string; demanda: string; fp: string }
  demandaContratada: string | null
  resumo: ResumoMemoria
  comparacao: ComparacaoItem[]
  impedimentos: ComparacaoItem[]
  podeAvancar: boolean
  medidorTitulo: string
  inicioTitulo: string
  fimTitulo: string
}

type Pos = { linha: number; coluna: number }

class Grade {
  private cells = new Map<string, string>()

  private id(linha: number, coluna: number) {
    return `${linha}:${coluna}`
  }

  set(linha: number, coluna: number, valor: string) {
    this.cells.set(this.id(linha, coluna), valor)
  }

  get(linha: number, coluna: number): string | undefined {
    return this.cells.get(this.id(linha, coluna))
  }

  has(linha: number, coluna: number) {
    return this.cells.has(this.id(linha, coluna))
  }

  delete(linha: number, coluna: number) {
    this.cells.delete(this.id(linha, coluna))
  }

  posicoes(): Pos[] {
    const lista: Pos[] = []
    for (const id of this.cells.keys()) {
      const [linha, coluna] = id.split(':').map(Number)
      lista.push({ linha, coluna })
    }
    lista.sort((a, b) => a.linha - b.linha || a.coluna - b.coluna)
    return lista
  }

  ultimaLinha() {
    let maxima = 0
    for (const { linha } of this.posicoes()) {
      if (linha > maxima) maxima = linha
    }
    return maxima
  }
}

export function numeroBr(texto: unknown): number | null {
  if (texto == null) return null
  const bruto = String(texto).trim().replace(/\u00a0/g, '')
  if (bruto === '' || bruto === '-' || bruto === '–') return null
  if (bruto.endsWith('%')) return null
  let limpo = bruto.replace(/ /g, '')
  if (limpo.includes(',') && limpo.includes('.')) {
    limpo = limpo.replace(/\./g, '').replace(',', '.')
  } else if (limpo.includes(',')) {
    limpo = limpo.replace(',', '.')
  }
  const numero = Number(limpo)
  return Number.isFinite(numero) ? numero : null
}

function arredondar(valor: number) {
  return Math.round(valor * 10000) / 10000
}

function colar(grade: Grade, texto: string, origem: Pos) {
  const linhas = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  linhas.forEach((linha, i) => {
    linha.split('\t').forEach((celula, j) => {
      if (celula !== '') {
        grade.set(origem.linha + i, origem.coluna + j, celula)
      }
    })
  })
}

function encontrar(grade: Grade, trecho: string, depois: Pos): Pos | null {
  const alvo = trecho.toLowerCase()
  const ordenadas = grade.posicoes()
  const seguintes = ordenadas.filter(
    (pos) =>
      pos.linha > depois.linha ||
      (pos.linha === depois.linha && pos.coluna > depois.coluna),
  )
  for (const pos of [...seguintes, ...ordenadas]) {
    const valor = grade.get(pos.linha, pos.coluna) ?? ''
    if (valor.toLowerCase().includes(alvo)) return pos
  }
  return null
}

function cheia(grade: Grade, linha: number, coluna: number) {
  if (!grade.has(linha, coluna)) return false
  return (grade.get(linha, coluna) ?? '').trim() !== ''
}

function fim(grade: Grade, linha: number, coluna: number, passoLinha: number, passoColuna: number): Pos {
  const vizinha = { linha: linha + passoLinha, coluna: coluna + passoColuna }
  if (cheia(grade, vizinha.linha, vizinha.coluna)) {
    let atual = vizinha
    while (cheia(grade, atual.linha + passoLinha, atual.coluna + passoColuna)) {
      atual = { linha: atual.linha + passoLinha, coluna: atual.coluna + passoColuna }
    }
    return atual
  }
  let atual = vizinha
  while (atual.linha >= 1 && atual.linha <= 20000 && atual.coluna >= 1 && atual.coluna <= 100) {
    if (cheia(grade, atual.linha, atual.coluna)) return atual
    atual = { linha: atual.linha + passoLinha, coluna: atual.coluna + passoColuna }
  }
  return { linha, coluna }
}

function ultimaPelaData(grade: Grade, linha: number, coluna: number) {
  let colunaData: number | null = null
  for (let candidata = coluna; candidata >= 1; candidata -= 1) {
    const texto = grade.get(linha, candidata) ?? ''
    if (/^\d{2}\/\d{2}\/\d{4}/.test(texto)) {
      colunaData = candidata
      break
    }
  }
  if (colunaData == null) return fim(grade, linha, coluna, 1, 0).linha
  let ultima = linha
  let atual = linha + 1
  while (atual <= 20000 && /^\d{2}\/\d{2}\/\d{4}/.test(grade.get(atual, colunaData) ?? '')) {
    ultima = atual
    atual += 1
  }
  return ultima
}

function retangulo(grade: Grade, ancora: Pos, direcao: 'esquerda' | 'direita') {
  const ultimaLinha = ultimaPelaData(grade, ancora.linha, ancora.coluna)
  if (direcao === 'esquerda') {
    const primeiraColuna = fim(grade, ancora.linha, ancora.coluna, 0, -1).coluna
    return { linha0: ancora.linha, linha1: ultimaLinha, coluna0: primeiraColuna, coluna1: ancora.coluna }
  }
  const ultimaColuna = fim(grade, ancora.linha, ancora.coluna, 0, 1).coluna
  return { linha0: ancora.linha, linha1: ultimaLinha, coluna0: ancora.coluna, coluna1: ultimaColuna }
}

function copiar(
  grade: Grade,
  bounds: { linha0: number; linha1: number; coluna0: number; coluna1: number },
  destinoLinha: number,
  destinoColuna: number,
  saida: Grade,
) {
  for (let i = 0, linha = bounds.linha0; linha <= bounds.linha1; i += 1, linha += 1) {
    for (let j = 0, coluna = bounds.coluna0; coluna <= bounds.coluna1; j += 1, coluna += 1) {
      const valor = grade.get(linha, coluna)
      if (valor != null) saida.set(destinoLinha + i, destinoColuna + j, valor)
    }
  }
}

function corrigirSegmentos(saida: Grade) {
  const linha = LINHA_MES_ANO
  if (!saida.has(linha, COL_SEGMENTO)) return
  let ultimo = fim(saida, linha, COL_SEGMENTO, 1, 0).linha
  saida.delete(ultimo, COL_SEGMENTO)
  if (!saida.has(linha, COL_SEGMENTO)) return
  ultimo = fim(saida, linha, COL_SEGMENTO, 1, 0).linha
  const bloco: { i: number; valor: string | undefined }[] = []
  for (let i = linha; i <= ultimo; i += 1) {
    bloco.push({ i, valor: saida.get(i, COL_SEGMENTO) })
  }
  for (const item of bloco) {
    if (item.valor == null) saida.delete(item.i + 1, COL_SEGMENTO)
    else saida.set(item.i + 1, COL_SEGMENTO, item.valor)
  }
}

function disponibilidade(grade: Grade, coluna: number) {
  for (let linha = 2; linha <= 4000; linha += 1) {
    const texto = grade.get(linha, coluna) ?? ''
    if (texto.includes('Disponibilidade de Dados:')) {
      return texto.replace(/\u00a0/g, ' ').trim()
    }
  }
  return 'VERIFICAR Disponibilidade de Dados: Inferior a 100%'
}

function demandaContratada(grade: Grade) {
  for (const pos of grade.posicoes()) {
    if (pos.coluna === 9 && (grade.get(pos.linha, pos.coluna) ?? '').trim().toLowerCase() === 'total') {
      return grade.get(pos.linha, pos.coluna + 1) ?? null
    }
  }
  return null
}

function materializar(saida: Grade): LinhaMemoria[] {
  const ultima = saida.ultimaLinha()
  if (!ultima) return []
  const linhas: LinhaMemoria[] = []
  for (let linha = LINHA_MES_ANO; linha <= ultima; linha += 1) {
    const registro = {} as LinhaMemoria
    let vazio = true
    COLUNAS.forEach((nome, indice) => {
      const valor = saida.get(linha, indice + 1)
      if (valor != null) vazio = false
      registro[nome] = valor ?? null
    })
    if (!vazio) linhas.push(registro)
  }
  return linhas
}

function agregar(linhas: LinhaMemoria[]): ResumoMemoria {
  const soma = (posto: string, coluna: NomeColuna) => {
    let total = 0
    for (const linha of linhas) {
      if (linha['Postos horários'] === posto) {
        const valor = numeroBr(linha[coluna])
        if (valor != null) total += valor
      }
    }
    return arredondar(total)
  }

  const maximo = (posto: string, coluna: NomeColuna) => {
    const valores: number[] = []
    for (const linha of linhas) {
      if (linha['Postos horários'] === posto) {
        const valor = numeroBr(linha[coluna])
        if (valor != null) valores.push(valor)
      }
    }
    return valores.length ? arredondar(Math.max(...valores)) : null
  }

  return {
    Consumo: {
      Ponta: soma('Ponta', 'kWh fornecido'),
      Reservado: soma('Reservado', 'kWh fornecido'),
      'Fora Ponta': soma('Fora Ponta', 'kWh fornecido'),
    },
    Demanda: {
      Ponta: maximo('Ponta', 'kW fornecido'),
      Reservado: maximo('Reservado', 'kW fornecido'),
      'Fora Ponta': maximo('Fora Ponta', 'kW fornecido'),
    },
    UFER: {
      Ponta: soma('Ponta', 'UFER'),
      Reservado: soma('Reservado', 'UFER'),
      'Fora Ponta': soma('Fora Ponta', 'UFER'),
    },
    DRE: {
      Ponta: maximo('Ponta', 'DMCR'),
      Reservado: maximo('Reservado', 'DMCR'),
      'Fora Ponta': maximo('Fora Ponta', 'DMCR'),
    },
    EneReatCap: { Reservado: soma('Reservado', 'kVArh capacitivo') },
    'kVArh indutivo': {
      Ponta: soma('Ponta', 'kVArh indutivo'),
      Reservado: soma('Reservado', 'kVArh indutivo'),
      'Fora Ponta': soma('Fora Ponta', 'kVArh indutivo'),
    },
  }
}

function impede(diferenca: number | null) {
  return diferenca != null && diferenca > LIMITE_DIFERENCA
}

export function compararSap(
  resumo: ResumoMemoria,
  medicoes: MedicaoSap[],
  injetadaHemera: number | null,
  demandaContratadaHemera: string | null,
): ComparacaoItem[] {
  const porNome = new Map<string, number | null>()
  for (const item of medicoes) {
    porNome.set(item.grandeza, numeroBr(item.medido))
  }

  const pares: [keyof ResumoMemoria, string, string][] = [
    ['Consumo', 'Ponta', 'Energia Ativa Ponta'],
    ['Consumo', 'Reservado', 'Energia Ativa Reservado'],
    ['Consumo', 'Fora Ponta', 'Energia Ativa F Ponta'],
    ['Demanda', 'Ponta', 'Demanda Máx Ponta'],
    ['Demanda', 'Reservado', 'Demanda Máx FPonta Cap.'],
    ['Demanda', 'Fora Ponta', 'Demanda Máx FPonta Ind.'],
    ['UFER', 'Ponta', 'ERE Ponta'],
    ['UFER', 'Reservado', 'ERE Fora Ponta Capacitiva'],
    ['UFER', 'Fora Ponta', 'ERE Fora Ponta Indutiva'],
    ['DRE', 'Ponta', 'DMCR Ponta'],
    ['DRE', 'Reservado', 'DMCR Fora Ponta Capacitiva'],
    ['DRE', 'Fora Ponta', 'DMCR Fora Ponta Indutiva'],
    ['kVArh indutivo', 'Ponta', 'Energia Reativa Ponta'],
    ['kVArh indutivo', 'Fora Ponta', 'Energia Reativa FPonta'],
    ['EneReatCap', 'Reservado', 'Energia Reativa FPonta Cap.'],
  ]

  const saida: ComparacaoItem[] = []
  for (const [grupo, posto, grandeza] of pares) {
    const bloco = resumo[grupo] as Record<string, number | null>
    const hemera = bloco[posto] ?? null
    const sap = porNome.has(grandeza) ? (porNome.get(grandeza) ?? null) : null
    const diferenca = hemera == null || sap == null ? null : arredondar(sap - hemera)
    saida.push({
      grupo,
      posto,
      sap: grandeza,
      hemera,
      sapMedido: sap,
      diferenca,
      impede: impede(diferenca),
    })
  }

  const nomesConsumo = ['Energia Ativa Ponta', 'Energia Ativa Reservado', 'Energia Ativa F Ponta']
  if (
    porNome.get('Ativo') != null &&
    nomesConsumo.every((nome) => porNome.get(nome) == null)
  ) {
    const presentes = (['Ponta', 'Reservado', 'Fora Ponta'] as const)
      .map((posto) => resumo.Consumo[posto])
      .filter((valor): valor is number => valor != null)
    const hemera = presentes.length ? arredondar(presentes.reduce((a, b) => a + b, 0)) : null
    const sap = porNome.get('Ativo') ?? null
    const diferenca = hemera == null || sap == null ? null : arredondar(sap - hemera)
    saida.push({
      grupo: 'Consumo',
      posto: 'Único',
      sap: 'Ativo',
      hemera,
      sapMedido: sap,
      diferenca,
      impede: impede(diferenca),
    })
    const injetado = porNome.get('Ativo injetado')
    if (injetado != null) {
      const diferencaInjetada =
        injetadaHemera == null ? null : arredondar(injetado - injetadaHemera)
      saida.push({
        grupo: 'Consumo',
        posto: 'Injetada',
        sap: 'Ativo injetado',
        hemera: injetadaHemera,
        sapMedido: injetado,
        diferenca: diferencaInjetada,
        impede: impede(diferencaInjetada),
      })
    }
  }

  const contratadaSap = porNome.has('Demanda Contratada') ? (porNome.get('Demanda Contratada') ?? null) : null
  const hemeraContratada = demandaContratadaHemera
    ? numeroBr(String(demandaContratadaHemera).split(/\s+/)[0])
    : null
  const diferencaContratada =
    hemeraContratada != null && contratadaSap != null
      ? arredondar(contratadaSap - hemeraContratada)
      : null
  saida.push({
    grupo: 'Demanda contratada',
    posto: '',
    sap: 'Demanda Contratada',
    hemera: hemeraContratada,
    sapMedido: contratadaSap,
    diferenca: diferencaContratada,
    impede: impede(diferencaContratada),
  })
  return saida
}

const LINHA_CONTA = new RegExp(
  '^(?<grandeza>.+?)\\s+(?:(?<medidor>\\d{5,})\\s+)?(?<anterior>[\\d.]+)\\s+(?<atual>[\\d.]+)\\s+(?<constante>\\d,\\d{5})\\s*(?<medido>[\\d.]+,\\d+)\\s*(?<unidade>[A-Z]+)\\s*$',
)
const GRUPO_B = /^(?<grandeza>Ativo(?: injetado)?)\s+(?<medidor>\d{5,})\s+[\d.]+\s+[\d.]+\s+\d+,\d+\s+(?<medido>[\d.]+,\d+)\s*$/
const COLADO_ATIVO =
  /^(?<medidor>\d{5,})Energia Ativa - kWh\S*nico\d{1,3}(?:\.\d{3})+\d{1,3}(?:\.\d{3})+\d+,\d+\s+(?<medido>[\d.]+)\s*$/
const COLADO_INJETADO =
  /^(?<medidor>\d{5,})Energia Injetada\b.*?\d+,\d{5}\s+(?<medido>[\d.]+)\s*$/

function guardar(medicoes: MedicaoSap[], grandeza: string, medidor: string, medido: string) {
  const existente = medicoes.find((item) => item.grandeza === grandeza && (item.medidor ?? '') === medidor)
  if (existente) {
    const anterior = numeroBr(existente.medido) ?? 0
    const novo = numeroBr(medido) ?? 0
    existente.medido = (anterior + novo).toFixed(4)
    return
  }
  medicoes.push({ grandeza, medidor, medido })
}

/** Lê o texto colado da conta (ES32 / conta impressa) ou uma tabela grandeza + medido. */
export function lerContaSap(texto: string): { medicoes: MedicaoSap[]; medidores: string[] } {
  const bruto = texto.replace(/^\uFEFF/, '').trim()
  if (!bruto) return { medicoes: [], medidores: [] }

  if (bruto.startsWith('{') || bruto.startsWith('[')) {
    try {
      const json = JSON.parse(bruto) as
        | MedicaoSap[]
        | { medicoes?: MedicaoSap[] }
      const lista = Array.isArray(json) ? json : (json.medicoes ?? [])
      const medicoes = lista
        .filter((item) => item && item.grandeza)
        .map((item) => ({
          grandeza: String(item.grandeza).replace(/\s+/g, ' ').trim(),
          medido: String(item.medido ?? ''),
          medidor: item.medidor ? String(item.medidor) : '',
        }))
      const medidores: string[] = []
      for (const item of medicoes) {
        if (item.medidor && !medidores.includes(item.medidor)) medidores.push(item.medidor)
      }
      return { medicoes, medidores }
    } catch {
      return { medicoes: [], medidores: [] }
    }
  }

  const medicoes: MedicaoSap[] = []
  const medidores: string[] = []
  const lembrar = (medidor: string) => {
    if (medidor && !medidores.includes(medidor)) medidores.push(medidor)
  }

  for (const bruta of bruto.split(/\r?\n/)) {
    const linha = bruta.trim()
    if (!linha) continue
    const conta = linha.match(LINHA_CONTA)
    if (conta?.groups) {
      const grandeza = conta.groups.grandeza.replace(/\s+/g, ' ').trim()
      const medidor = conta.groups.medidor ?? ''
      medicoes.push({ grandeza, medido: conta.groups.medido, medidor })
      lembrar(medidor)
      continue
    }
    const grupoB = linha.match(GRUPO_B)
    if (grupoB?.groups) {
      guardar(medicoes, grupoB.groups.grandeza, grupoB.groups.medidor, grupoB.groups.medido)
      lembrar(grupoB.groups.medidor)
      continue
    }
    const ativo = linha.match(COLADO_ATIVO)
    if (ativo?.groups) {
      guardar(medicoes, 'Ativo', ativo.groups.medidor, ativo.groups.medido)
      lembrar(ativo.groups.medidor)
      continue
    }
    const injetado = linha.match(COLADO_INJETADO)
    if (injetado?.groups) {
      guardar(medicoes, 'Ativo injetado', injetado.groups.medidor, injetado.groups.medido)
      lembrar(injetado.groups.medidor)
      continue
    }

    const celulas = (linha.includes('\t') ? linha.split('\t') : linha.split(';')).map((c) => c.trim())
    if (celulas.length >= 2) {
      const grandeza = celulas[0].replace(/\s+/g, ' ')
      const medido = celulas[celulas.length - 1]
      const primeira = grandeza.toLowerCase()
      if (primeira === 'grandeza' || primeira === 'nota' || numeroBr(medido) == null) continue
      if (/^\d{2}\/\d{2}\/\d{4}/.test(grandeza)) continue
      const medidor = celulas.find((celula, indice) => indice > 0 && indice < celulas.length - 1 && /^\d{5,}$/.test(celula)) ?? ''
      medicoes.push({ grandeza, medido, medidor })
      lembrar(medidor)
    }
  }

  return { medicoes, medidores }
}

export function identidadeHemera(texto: string) {
  const medidor = texto.match(/-\s*(\d{5,})\s*\(/)?.[1] ?? ''
  const periodo = texto.match(/(\d{2}\/\d{2}\/\d{4}).{0,80}?até\s+(\d{2}\/\d{2}\/\d{4})/i)
  return {
    medidor,
    inicio: periodo?.[1] ?? '',
    fim: periodo?.[2] ?? '',
  }
}

function ordenarBlocos(consumo: string, demanda: string, fator: string) {
  const grade = new Grade()
  const erros: string[] = []
  if (consumo.trim()) colar(grade, consumo, CONSUMO_ORIGEM)
  if (demanda.trim()) colar(grade, demanda, DEMANDA_ORIGEM)
  if (fator.trim()) colar(grade, fator, FP_ORIGEM)

  const saida = new Grade()
  const tituloConsumo = consumo.trim() ? encontrar(grade, 'Consumo - ', CONSUMO_ORIGEM) : null
  const tituloDemanda = demanda.trim() ? encontrar(grade, 'Demanda - ', DEMANDA_ORIGEM) : null
  const tituloFp = fator.trim() ? encontrar(grade, 'Fator de Potência - ', FP_ORIGEM) : null

  if (consumo.trim() && !tituloConsumo) erros.push("Não achei 'Consumo - ' na área colada.")
  if (demanda.trim() && !tituloDemanda) erros.push("Não achei 'Demanda - ' na área colada.")
  if (fator.trim() && !tituloFp) erros.push("Não achei 'Fator de Potência - ' na área colada.")

  if (tituloConsumo) {
    copiar(
      grade,
      retangulo(grade, { linha: tituloConsumo.linha + 2, coluna: tituloConsumo.coluna + 5 }, 'esquerda'),
      LINHA_MES_ANO,
      COL_CONSUMO,
      saida,
    )
  }
  if (tituloDemanda) {
    copiar(
      grade,
      retangulo(grade, { linha: tituloDemanda.linha + 2, coluna: tituloDemanda.coluna + 3 }, 'direita'),
      LINHA_MES_ANO,
      COL_DEMANDA,
      saida,
    )
  }
  if (tituloFp) {
    copiar(
      grade,
      retangulo(grade, { linha: tituloFp.linha + 2, coluna: tituloFp.coluna + 3 }, 'direita'),
      LINHA_MES_ANO,
      COL_FP,
      saida,
    )
    corrigirSegmentos(saida)
  }

  return {
    linhas: materializar(saida),
    erros,
    disponibilidade: {
      consumo: consumo.trim()
        ? disponibilidade(grade, 1)
        : 'VERIFICAR Disponibilidade de Dados: Inferior a 100%',
      demanda: demanda.trim()
        ? disponibilidade(grade, 9)
        : 'VERIFICAR Disponibilidade de Dados: Inferior a 100%',
      fp: fator.trim()
        ? disponibilidade(grade, 18)
        : 'VERIFICAR Disponibilidade de Dados: Inferior a 100%',
    },
    demandaContratada: demandaContratada(grade),
  }
}

export function executar(entrada: {
  consumo: string
  demanda: string
  fator: string
  medicoes?: MedicaoSap[]
  injetadaHemera?: number | null
}): ResultadoModelador {
  const ordenado = ordenarBlocos(entrada.consumo, entrada.demanda, entrada.fator)
  const resumo = agregar(ordenado.linhas)
  const medicoes = entrada.medicoes ?? []
  const comparacao = medicoes.length
    ? compararSap(resumo, medicoes, entrada.injetadaHemera ?? null, ordenado.demandaContratada)
    : []
  const impedimentos = comparacao.filter((item) => item.impede)
  const identidade = identidadeHemera(`${entrada.consumo}\n${entrada.demanda}\n${entrada.fator}`)
  return {
    linhas: ordenado.linhas,
    erros: ordenado.erros,
    disponibilidade: ordenado.disponibilidade,
    demandaContratada: ordenado.demandaContratada,
    resumo,
    comparacao,
    impedimentos,
    podeAvancar: impedimentos.length === 0,
    medidorTitulo: identidade.medidor,
    inicioTitulo: identidade.inicio,
    fimTitulo: identidade.fim,
  }
}

export function planilhaParaTsv(linhas: LinhaMemoria[]) {
  const cabecalho = COLUNAS.join('\t')
  const corpo = linhas.map((linha) => COLUNAS.map((nome) => linha[nome] ?? '').join('\t'))
  return [cabecalho, ...corpo].join('\n')
}

export function dataNome(data: string) {
  const [dia, mes, anoBruto] = data.trim().replace(/\//g, '.').split('.')
  const ano = anoBruto.length === 2 ? `20${anoBruto}` : anoBruto
  return `${Number(dia).toString().padStart(2, '0')}.${Number(mes).toString().padStart(2, '0')}.${ano}`
}

export function nomeArquivoEnvio(opcoes: {
  instalacao?: string
  medidor?: string
  inicio?: string
  fim?: string
  divergente?: boolean
}) {
  const instalacao = (opcoes.instalacao || opcoes.medidor || 'memoria').trim()
  let nome =
    opcoes.inicio && opcoes.fim
      ? `${instalacao}_${dataNome(opcoes.inicio)} a ${dataNome(opcoes.fim)}`
      : instalacao
  if (opcoes.divergente) nome = `${nome} Divergente`
  return `${nome}.xlsx`
}
