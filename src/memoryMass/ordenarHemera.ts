/** Lógica equivalente à macro Macro_ORDENA_DADOS (planilha Hemera → MÊS_ANO). */

export type HemeraGrid = string[][]

export type HemeraBlock = {
  marker: string
  markerLabel: string
  rows: string[][]
}

export type PlanilhaRow = {
  data: string
  dia: string
  posto: string
  consumo: [string, string, string]
  demanda: [string, string, string]
  fp: string
}

export type OrdenarHemeraResult = {
  consumo: HemeraBlock | null
  demanda: HemeraBlock | null
  fp: HemeraBlock | null
  /** Planilha montada no formato MÊS_ANO (Data…FP). */
  planilha: PlanilhaRow[]
  errors: string[]
}

const MARKERS = {
  consumo: 'Consumo - ',
  demanda: 'Demanda - ',
  fp: 'Fator de Potência - ',
} as const

const CONSUMO_COLS = 3
const DEMANDA_COLS = 3

function normalizeCell(value: unknown): string {
  if (value == null) return ''
  return String(value).replace(/\u00a0/g, ' ').trim()
}

function splitPasteLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t')
  if (line.includes(';')) return line.split(';')
  // Excel às vezes cola com múltiplos espaços; evita quebrar números "0,00".
  if (/ {2,}/.test(line)) return line.split(/ {2,}/)
  return [line]
}

/** Converte texto colado do Excel (TSV) em grade de células. */
export function parseHemeraPaste(text: string): HemeraGrid {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  while (lines.length && !lines[lines.length - 1]?.trim()) {
    lines.pop()
  }

  return lines.map((line) => splitPasteLine(line).map(normalizeCell))
}

function cellAt(grid: HemeraGrid, row: number, col: number): string {
  return normalizeCell(grid[row]?.[col] ?? '')
}

function isEmptyCell(grid: HemeraGrid, row: number, col: number): boolean {
  return cellAt(grid, row, col) === ''
}

function gridWidth(grid: HemeraGrid): number {
  return grid.reduce((max, row) => Math.max(max, row.length), 0)
}

function findMarker(
  grid: HemeraGrid,
  what: string,
  startRow = 0,
  startCol = 0,
): { row: number; col: number; label: string } | null {
  const needle = what.toLowerCase()

  for (let row = startRow; row < grid.length; row += 1) {
    const rowCells = grid[row] ?? []
    const colFrom = row === startRow ? startCol : 0
    for (let col = colFrom; col < Math.max(rowCells.length, 1); col += 1) {
      const value = cellAt(grid, row, col)
      if (value.toLowerCase().includes(needle)) {
        return { row, col, label: value }
      }
    }
  }

  return null
}

/** Equivalente a Selection.End(xlDown) em célula com dados. */
function endDown(grid: HemeraGrid, row: number, col: number): number {
  if (isEmptyCell(grid, row, col)) {
    for (let r = row + 1; r < grid.length; r += 1) {
      if (!isEmptyCell(grid, r, col)) {
        // Continua até o fim do bloco contíguo a partir do primeiro preenchido.
        let last = r
        for (let rr = r + 1; rr < grid.length; rr += 1) {
          if (isEmptyCell(grid, rr, col)) break
          last = rr
        }
        return last
      }
    }
    return row
  }

  let last = row
  for (let r = row + 1; r < grid.length; r += 1) {
    if (isEmptyCell(grid, r, col)) break
    last = r
  }
  return last
}

/** Equivalente a Selection.End(xlToLeft). */
function endLeft(grid: HemeraGrid, row: number, col: number): number {
  if (isEmptyCell(grid, row, col)) {
    for (let c = col - 1; c >= 0; c -= 1) {
      if (!isEmptyCell(grid, row, c)) return c
    }
    return col
  }

  let last = col
  for (let c = col - 1; c >= 0; c -= 1) {
    if (isEmptyCell(grid, row, c)) break
    last = c
  }
  return last
}

/** Equivalente a Selection.End(xlToRight). */
function endRight(grid: HemeraGrid, row: number, col: number): number {
  const width = gridWidth(grid)
  if (isEmptyCell(grid, row, col)) {
    for (let c = col + 1; c < width; c += 1) {
      if (!isEmptyCell(grid, row, c)) {
        let last = c
        for (let cc = c + 1; cc < width; cc += 1) {
          if (isEmptyCell(grid, row, cc)) break
          last = cc
        }
        return last
      }
    }
    return col
  }

  let last = col
  for (let c = col + 1; c < width; c += 1) {
    if (isEmptyCell(grid, row, c)) break
    last = c
  }
  return last
}

function sliceBlock(
  grid: HemeraGrid,
  top: number,
  left: number,
  bottom: number,
  right: number,
): string[][] {
  const rows: string[][] = []
  for (let r = top; r <= bottom; r += 1) {
    const row: string[] = []
    for (let c = left; c <= right; c += 1) {
      row.push(cellAt(grid, r, c))
    }
    if (row.some((cell) => cell !== '')) {
      rows.push(row)
    }
  }
  return rows
}

function looksLikeHeaderRow(row: string[]): boolean {
  const joined = row.join(' ').toLowerCase()
  return (
    joined.includes('kwh') ||
    joined.includes('kvar') ||
    joined.includes('data') ||
    joined.includes('posto') ||
    joined.includes('fator') ||
    joined.includes('demanda') ||
    joined.includes('consumo')
  )
}

function isMostlyNumericBlock(rows: string[][], minRatio = 0.4): boolean {
  let cells = 0
  let numeric = 0
  for (const row of rows.slice(0, 40)) {
    for (const cell of row) {
      if (!cell) continue
      cells += 1
      if (/^[-+]?\d{1,3}([.]\d{3})*(,\d+)?$/.test(cell) || /^[-+]?\d+([.,]\d+)?$/.test(cell)) {
        numeric += 1
      }
    }
  }
  if (cells < 3) return false
  return numeric / cells >= minRatio
}

function takeLastColumns(rows: string[][], count: number): string[][] {
  return rows.map((row) => {
    if (row.length <= count) {
      return [...row, ...Array.from({ length: count - row.length }, () => '')]
    }
    return row.slice(row.length - count)
  })
}

function takeFirstColumns(rows: string[][], count: number): string[][] {
  return rows.map((row) => {
    const next = row.slice(0, count)
    while (next.length < count) next.push('')
    return next
  })
}

function padColumns(rows: string[][], count: number): string[][] {
  return rows.map((row) => {
    const next = row.slice(0, count)
    while (next.length < count) next.push('')
    return next
  })
}

/**
 * Consumo (VBA): Find "Consumo - " → Offset(2,5) → End(xlDown) → End(xlToLeft)
 * Na planilha MÊS_ANO, CONSUMO usa as 3 últimas colunas do bloco (kWh / kVArh / kVArh).
 */
function extractConsumo(grid: HemeraGrid): HemeraBlock | null {
  const found = findMarker(grid, MARKERS.consumo)
  if (!found) return null

  const width = gridWidth(grid)
  const startRow = Math.min(found.row + 2, Math.max(0, grid.length - 1))
  let startCol = found.col + 5
  if (startCol >= width) {
    // Colagem mais estreita: usa a última coluna disponível.
    startCol = Math.max(found.col, width - 1)
  }

  const bottom = endDown(grid, startRow, startCol)
  const left = endLeft(grid, startRow, startCol)
  const right = startCol
  let rows = sliceBlock(grid, startRow, Math.min(left, right), bottom, Math.max(left, right))
  if (!rows.length) return null
  if (rows[0] && looksLikeHeaderRow(rows[0])) {
    rows = rows.slice(1)
  }
  if (!rows.length) return null

  return { marker: MARKERS.consumo, markerLabel: found.label, rows }
}

/**
 * Demanda (VBA): a partir de I2, Find "Demanda - " → Offset(2,3) → End(xlDown) → End(xlToRight)
 */
function extractDemanda(grid: HemeraGrid): HemeraBlock | null {
  const found = findMarker(grid, MARKERS.demanda)
  if (!found) return null

  const width = gridWidth(grid)
  const startRow = Math.min(found.row + 2, Math.max(0, grid.length - 1))
  let startCol = found.col + 3
  if (startCol >= width) {
    startCol = Math.max(found.col, Math.min(3, width - 1))
  }

  const bottom = endDown(grid, startRow, startCol)
  const right = endRight(grid, startRow, startCol)
  const left = startCol
  let rows = sliceBlock(grid, startRow, left, bottom, Math.max(left, right))
  if (!rows.length) return null
  if (rows[0] && looksLikeHeaderRow(rows[0])) {
    rows = rows.slice(1)
  }
  if (!rows.length) return null

  return { marker: MARKERS.demanda, markerLabel: found.label, rows }
}

/**
 * FP (VBA): a partir de R2, Find "Fator de Potência - " → Offset(2,3) → End(xlDown) → End(xlToRight)
 */
function extractFp(grid: HemeraGrid): HemeraBlock | null {
  const found = findMarker(grid, MARKERS.fp)
  if (!found) return null

  const width = gridWidth(grid)
  const startRow = Math.min(found.row + 2, Math.max(0, grid.length - 1))
  let startCol = found.col + 3
  if (startCol >= width) {
    startCol = Math.max(found.col, Math.min(3, width - 1))
  }

  const bottom = endDown(grid, startRow, startCol)
  const right = endRight(grid, startRow, startCol)
  const left = startCol
  let rows = sliceBlock(grid, startRow, left, bottom, Math.max(left, right))
  if (!rows.length) return null
  if (rows[0] && looksLikeHeaderRow(rows[0])) {
    rows = rows.slice(1)
  }
  if (!rows.length) return null

  return { marker: MARKERS.fp, markerLabel: found.label, rows }
}

function gridAsBlock(
  grid: HemeraGrid,
  marker: string,
  fallbackLabel: string,
): HemeraBlock | null {
  let rows = grid
    .map((row) => row.map(normalizeCell))
    .filter((row) => row.some((cell) => cell !== ''))
  if (!rows.length) return null

  // Remove linha de título/marcador se veio colada no topo.
  if (rows[0]?.some((cell) => cell.toLowerCase().includes(marker.trim().toLowerCase()))) {
    rows = rows.slice(1)
  }
  if (rows[0] && looksLikeHeaderRow(rows[0])) {
    rows = rows.slice(1)
  }
  if (!rows.length) return null

  return {
    marker,
    markerLabel: fallbackLabel,
    rows,
  }
}

function blockFromPaste(
  pasteText: string,
  kind: 'consumo' | 'demanda' | 'fp',
): { block: HemeraBlock | null; usedFallback: boolean } {
  const grid = parseHemeraPaste(pasteText)
  if (!grid.length || grid.every((row) => row.every((cell) => !cell))) {
    return { block: null, usedFallback: false }
  }

  if (kind === 'consumo') {
    const extracted = extractConsumo(grid)
    if (extracted) return { block: extracted, usedFallback: false }
    return {
      block: gridAsBlock(grid, MARKERS.consumo, 'Consumo'),
      usedFallback: true,
    }
  }
  if (kind === 'demanda') {
    const extracted = extractDemanda(grid)
    if (extracted) return { block: extracted, usedFallback: false }
    return {
      block: gridAsBlock(grid, MARKERS.demanda, 'Demanda'),
      usedFallback: true,
    }
  }
  const extracted = extractFp(grid)
  if (extracted) return { block: extracted, usedFallback: false }
  return {
    block: gridAsBlock(grid, MARKERS.fp, 'Fator de Potência'),
    usedFallback: true,
  }
}

function consumoCalendarAndValues(block: HemeraBlock): {
  calendar: string[][]
  values: string[][]
} {
  const width = block.rows.reduce((max, row) => Math.max(max, row.length), 0)
  if (width >= CONSUMO_COLS + 3) {
    return {
      calendar: takeFirstColumns(block.rows, 3),
      values: takeLastColumns(block.rows, CONSUMO_COLS),
    }
  }
  if (width >= CONSUMO_COLS) {
    return {
      calendar: block.rows.map(() => ['', '', '']),
      values: takeLastColumns(block.rows, CONSUMO_COLS),
    }
  }
  return {
    calendar: block.rows.map(() => ['', '', '']),
    values: padColumns(block.rows, CONSUMO_COLS),
  }
}

function montarPlanilha(
  consumo: HemeraBlock | null,
  demanda: HemeraBlock | null,
  fp: HemeraBlock | null,
): PlanilhaRow[] {
  const consumoParts = consumo
    ? consumoCalendarAndValues(consumo)
    : { calendar: [] as string[][], values: [] as string[][] }
  const demandaValues = demanda
    ? takeLastColumns(demanda.rows, DEMANDA_COLS)
    : []
  const fpValues = fp ? takeFirstColumns(fp.rows, 1) : []

  const rowCount = Math.max(
    consumoParts.values.length,
    demandaValues.length,
    fpValues.length,
    0,
  )

  const planilha: PlanilhaRow[] = []
  for (let i = 0; i < rowCount; i += 1) {
    const cal = consumoParts.calendar[i] ?? ['', '', '']
    const cons = consumoParts.values[i] ?? ['', '', '']
    const dem = demandaValues[i] ?? ['', '', '']
    const fator = fpValues[i]?.[0] ?? ''
    planilha.push({
      data: cal[0] ?? '',
      dia: cal[1] ?? '',
      posto: cal[2] ?? '',
      consumo: [cons[0] ?? '', cons[1] ?? '', cons[2] ?? ''],
      demanda: [dem[0] ?? '', dem[1] ?? '', dem[2] ?? ''],
      fp: fator,
    })
  }
  return planilha
}

export type OrdenarHemeraPastes = {
  consumo: string
  demanda: string
  fp: string
}

/** Ordena a partir dos 3 campos (Consumo / Demanda / Fator de Potência), como A / I / R. */
export function ordenarDadosHemera(pastes: OrdenarHemeraPastes | string): OrdenarHemeraResult {
  if (typeof pastes === 'string') {
    const errors: string[] = []
    const grid = parseHemeraPaste(pastes)

    if (!grid.length || grid.every((row) => row.every((cell) => !cell))) {
      return {
        consumo: null,
        demanda: null,
        fp: null,
        planilha: [],
        errors: ['Cole os dados nos campos Consumo, Demanda e Fator de Potência.'],
      }
    }

    const consumo = extractConsumo(grid)
    const demanda = extractDemanda(grid)
    const fp = extractFp(grid)

    if (!consumo) errors.push('Não foi encontrado o bloco "Consumo - " nos dados colados.')
    if (!demanda) errors.push('Não foi encontrado o bloco "Demanda - " nos dados colados.')
    if (!fp) errors.push('Não foi encontrado o bloco "Fator de Potência - " nos dados colados.')

    return {
      consumo,
      demanda,
      fp,
      planilha: montarPlanilha(consumo, demanda, fp),
      errors,
    }
  }

  const errors: string[] = []
  if (!pastes.consumo.trim() && !pastes.demanda.trim() && !pastes.fp.trim()) {
    return {
      consumo: null,
      demanda: null,
      fp: null,
      planilha: [],
      errors: ['Cole os dados nos campos Consumo, Demanda e Fator de Potência.'],
    }
  }

  const consumoResult = blockFromPaste(pastes.consumo, 'consumo')
  const demandaResult = blockFromPaste(pastes.demanda, 'demanda')
  const fpResult = blockFromPaste(pastes.fp, 'fp')

  let consumo = consumoResult.block
  let demanda = demandaResult.block
  let fp = fpResult.block

  if (!consumo && pastes.consumo.trim()) {
    errors.push('Não foi possível ordenar o bloco de Consumo.')
  } else if (!consumo) {
    errors.push('Cole os dados de Consumo (inclua a linha "Consumo - …").')
  } else if (consumoResult.usedFallback) {
    errors.push(
      'Consumo: marcador "Consumo - " não encontrado; usei o conteúdo colado integralmente.',
    )
  }

  if (!demanda && pastes.demanda.trim()) {
    errors.push('Não foi possível ordenar o bloco de Demanda.')
  } else if (!demanda) {
    errors.push('Cole os dados de Demanda (inclua a linha "Demanda - …").')
  } else if (demandaResult.usedFallback) {
    errors.push(
      'Demanda: marcador "Demanda - " não encontrado; usei o conteúdo colado integralmente.',
    )
  } else if (demanda && !isMostlyNumericBlock(demanda.rows)) {
    errors.push(
      'Demanda: o conteúdo não parece a tabela numérica do Hemera (verifique se colou a área certa, a partir da coluna I).',
    )
    // Evita montar planilha com labels (Tensão/Corrente/…).
    demanda = null
  }

  if (!fp && pastes.fp.trim()) {
    errors.push('Não foi possível ordenar o bloco de Fator de Potência.')
  } else if (!fp) {
    errors.push('Cole os dados de Fator de Potência (inclua a linha "Fator de Potência - …").')
  } else if (fpResult.usedFallback) {
    errors.push(
      'Fator de Potência: marcador não encontrado; usei o conteúdo colado integralmente.',
    )
  }

  const planilha = montarPlanilha(consumo, demanda, fp)

  return { consumo, demanda, fp, planilha, errors }
}

export function blockPeriodLabel(block: HemeraBlock | null, fallback: string): string {
  if (!block?.markerLabel) return fallback
  const parts = block.markerLabel.split('-')
  if (parts.length < 2) return fallback
  return parts.slice(1).join('-').trim() || fallback
}

export function planilhaToTsv(planilha: PlanilhaRow[]): string {
  const header = [
    'Data',
    'Dia',
    'Postos horários',
    'kWh fornecido',
    'kVArh indutivo',
    'kVArh capacitivo',
    'kW fornecido',
    'kVAr indutivo',
    'kVAr capacitivo',
    'Fator',
  ].join('\t')

  const lines = planilha.map((row) =>
    [
      row.data,
      row.dia,
      row.posto,
      row.consumo[0],
      row.consumo[1],
      row.consumo[2],
      row.demanda[0],
      row.demanda[1],
      row.demanda[2],
      row.fp,
    ].join('\t'),
  )

  return [header, ...lines].join('\n')
}
