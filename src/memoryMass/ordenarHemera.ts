/** Lógica equivalente à macro Macro_ORDENA_DADOS (planilha Hemera → MÊS_ANO). */

export type HemeraGrid = string[][]

export type HemeraBlock = {
  marker: string
  markerLabel: string
  rows: string[][]
}

export type OrdenarHemeraResult = {
  consumo: HemeraBlock | null
  demanda: HemeraBlock | null
  fp: HemeraBlock | null
  errors: string[]
}

const MARKERS = {
  consumo: 'Consumo - ',
  demanda: 'Demanda - ',
  fp: 'Fator de Potência - ',
} as const

function normalizeCell(value: unknown): string {
  if (value == null) return ''
  return String(value).replace(/\u00a0/g, ' ').trim()
}

/** Converte texto colado do Excel (TSV) em grade de células. */
export function parseHemeraPaste(text: string): HemeraGrid {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  while (lines.length && !lines[lines.length - 1]?.trim()) {
    lines.pop()
  }

  return lines.map((line) => {
    // Excel cola com tab; fallback para múltiplos espaços se vier de outro editor.
    const cells = line.includes('\t') ? line.split('\t') : line.split(/ {2,}/)
    return cells.map(normalizeCell)
  })
}

function cellAt(grid: HemeraGrid, row: number, col: number): string {
  return normalizeCell(grid[row]?.[col] ?? '')
}

function isEmptyCell(grid: HemeraGrid, row: number, col: number): boolean {
  return cellAt(grid, row, col) === ''
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
    for (let col = colFrom; col < rowCells.length; col += 1) {
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
      if (!isEmptyCell(grid, r, col)) return r
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
  const width = Math.max(0, ...(grid.map((r) => r.length) as number[]))
  if (isEmptyCell(grid, row, col)) {
    for (let c = col + 1; c < width; c += 1) {
      if (!isEmptyCell(grid, row, c)) return c
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
    // Mantém linhas que tenham ao menos um valor (evita lixo no fim).
    if (row.some((cell) => cell !== '')) {
      rows.push(row)
    }
  }
  return rows
}

/**
 * Consumo: Find "Consumo - " → Offset(2,5) → End(xlDown) → End(xlToLeft)
 */
function extractConsumo(grid: HemeraGrid): HemeraBlock | null {
  const found = findMarker(grid, MARKERS.consumo)
  if (!found) return null

  const startRow = found.row + 2
  const startCol = found.col + 5
  const bottom = endDown(grid, startRow, startCol)
  const left = endLeft(grid, startRow, startCol)
  const right = startCol
  const top = startRow
  const rows = sliceBlock(grid, top, Math.min(left, right), bottom, Math.max(left, right))
  if (!rows.length) return null

  return { marker: MARKERS.consumo, markerLabel: found.label, rows }
}

/**
 * Demanda: Find "Demanda - " → Offset(2,3) → End(xlDown) → End(xlToRight)
 */
function extractDemanda(grid: HemeraGrid): HemeraBlock | null {
  const found = findMarker(grid, MARKERS.demanda)
  if (!found) return null

  const startRow = found.row + 2
  const startCol = found.col + 3
  const bottom = endDown(grid, startRow, startCol)
  const right = endRight(grid, startRow, startCol)
  const left = startCol
  const top = startRow
  const rows = sliceBlock(grid, top, left, bottom, right)
  if (!rows.length) return null

  return { marker: MARKERS.demanda, markerLabel: found.label, rows }
}

/**
 * FP: Find "Fator de Potência - " → Offset(2,3) → End(xlDown) → End(xlToRight)
 */
function extractFp(grid: HemeraGrid): HemeraBlock | null {
  const found = findMarker(grid, MARKERS.fp)
  if (!found) return null

  const startRow = found.row + 2
  const startCol = found.col + 3
  const bottom = endDown(grid, startRow, startCol)
  const right = endRight(grid, startRow, startCol)
  const left = startCol
  const top = startRow
  const rows = sliceBlock(grid, top, left, bottom, right)
  if (!rows.length) return null

  return { marker: MARKERS.fp, markerLabel: found.label, rows }
}

function gridAsBlock(
  grid: HemeraGrid,
  marker: string,
  fallbackLabel: string,
): HemeraBlock | null {
  const rows = grid
    .map((row) => row.map(normalizeCell))
    .filter((row) => row.some((cell) => cell !== ''))
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
): HemeraBlock | null {
  const grid = parseHemeraPaste(pasteText)
  if (!grid.length || grid.every((row) => row.every((cell) => !cell))) {
    return null
  }

  if (kind === 'consumo') {
    return extractConsumo(grid) ?? gridAsBlock(grid, MARKERS.consumo, 'Consumo')
  }
  if (kind === 'demanda') {
    return extractDemanda(grid) ?? gridAsBlock(grid, MARKERS.demanda, 'Demanda')
  }
  return extractFp(grid) ?? gridAsBlock(grid, MARKERS.fp, 'Fator de Potência')
}

export type OrdenarHemeraPastes = {
  consumo: string
  demanda: string
  fp: string
}

/** Ordena a partir dos 3 campos (Consumo / Demanda / Fator de Potência), como A / I / R. */
export function ordenarDadosHemera(pastes: OrdenarHemeraPastes | string): OrdenarHemeraResult {
  // Compatibilidade: string única ainda tenta extrair os 3 blocos de um dump.
  if (typeof pastes === 'string') {
    const errors: string[] = []
    const grid = parseHemeraPaste(pastes)

    if (!grid.length || grid.every((row) => row.every((cell) => !cell))) {
      return {
        consumo: null,
        demanda: null,
        fp: null,
        errors: ['Cole os dados nos campos Consumo, Demanda e Fator de Potência.'],
      }
    }

    const consumo = extractConsumo(grid)
    const demanda = extractDemanda(grid)
    const fp = extractFp(grid)

    if (!consumo) errors.push('Não foi encontrado o bloco "Consumo - " nos dados colados.')
    if (!demanda) errors.push('Não foi encontrado o bloco "Demanda - " nos dados colados.')
    if (!fp) errors.push('Não foi encontrado o bloco "Fator de Potência - " nos dados colados.')

    return { consumo, demanda, fp, errors }
  }

  const errors: string[] = []
  const consumo = blockFromPaste(pastes.consumo, 'consumo')
  const demanda = blockFromPaste(pastes.demanda, 'demanda')
  const fp = blockFromPaste(pastes.fp, 'fp')

  if (!pastes.consumo.trim() && !pastes.demanda.trim() && !pastes.fp.trim()) {
    return {
      consumo: null,
      demanda: null,
      fp: null,
      errors: ['Cole os dados nos campos Consumo, Demanda e Fator de Potência.'],
    }
  }

  if (!consumo && pastes.consumo.trim()) {
    errors.push('Não foi possível ordenar o bloco de Consumo.')
  } else if (!consumo) {
    errors.push('Cole os dados de Consumo.')
  }

  if (!demanda && pastes.demanda.trim()) {
    errors.push('Não foi possível ordenar o bloco de Demanda.')
  } else if (!demanda) {
    errors.push('Cole os dados de Demanda.')
  }

  if (!fp && pastes.fp.trim()) {
    errors.push('Não foi possível ordenar o bloco de Fator de Potência.')
  } else if (!fp) {
    errors.push('Cole os dados de Fator de Potência.')
  }

  return { consumo, demanda, fp, errors }
}

export function blockPeriodLabel(block: HemeraBlock | null, fallback: string): string {
  if (!block?.markerLabel) return fallback
  const parts = block.markerLabel.split('-')
  if (parts.length < 2) return fallback
  return parts.slice(1).join('-').trim() || fallback
}
