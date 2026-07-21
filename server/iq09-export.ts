import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'

/** Colunas do export IQ09 (ordem de exibição). */
export const IQ09_COLUMNS = [
  'Nº de série',
  'Material',
  'Texto breve material',
  'Status do sistema',
  'Status usuário',
  'Centro',
  'Depósito',
  'CenTrabalho princ.',
  'Tipo estoque (reg.principal)',
  'Modificado em',
  'Modificado por',
  'Número de série do fabricante',
  'Fabricante do imobilizado',
  'Ano de construção',
  'Local de instalação',
] as const

export type Iq09Column = (typeof IQ09_COLUMNS)[number]
export type Iq09Row = Record<Iq09Column, string>

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const HEADER_ALIASES: Record<string, Iq09Column> = Object.fromEntries(
  IQ09_COLUMNS.flatMap((column) => {
    const aliases = [normalizeHeader(column)]
    if (column === 'Nº de série') {
      aliases.push('n de serie', 'no de serie', 'numero de serie', 'nº de serie')
    }
    if (column === 'CenTrabalho princ.') {
      aliases.push('centrabalho princ.', 'cen trabalho princ.', 'centro trabalho princ.')
    }
    return aliases.map((alias) => [alias, column])
  }),
) as Record<string, Iq09Column>

function formatCellValue(value: unknown): string {
  if (value == null || value === '') return ''

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    })
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Datas Excel serializadas
    if (value > 20_000 && value < 80_000) {
      const parsed = XLSX.SSF.parse_date_code(value)
      if (parsed) {
        return `${String(parsed.d).padStart(2, '0')}/${String(parsed.m).padStart(2, '0')}/${parsed.y}`
      }
    }
    return String(value)
  }

  const text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(text)
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
      })
    }
  }

  return text
}

export function resolveIq09ExportPath(monthKey: string): string | null {
  const configured = process.env.IQ09_EXPORT_PATH?.trim()
  if (configured) {
    return path.resolve(configured.replaceAll('{month}', monthKey))
  }

  const sample = path.resolve(process.cwd(), 'data/iq09-export-sample.xlsx')
  if (existsSync(sample)) return sample

  return null
}

export function parseIq09ExportFile(filePath: string): {
  columns: Iq09Column[]
  rows: Iq09Row[]
} {
  if (!existsSync(filePath)) {
    throw new Error(`Arquivo de exportação IQ09 não encontrado: ${filePath}`)
  }

  const workbook = XLSX.read(readFileSync(filePath), {
    type: 'buffer',
    cellDates: true,
  })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('A planilha IQ09 não possui abas.')
  }

  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  })

  if (matrix.length === 0) {
    return { columns: [...IQ09_COLUMNS], rows: [] }
  }

  const headerRow = (matrix[0] ?? []).map((cell) => String(cell ?? '').trim())
  const columnIndex = new Map<Iq09Column, number>()

  headerRow.forEach((header, index) => {
    const mapped = HEADER_ALIASES[normalizeHeader(header)]
    if (mapped && !columnIndex.has(mapped)) {
      columnIndex.set(mapped, index)
    }
  })

  if (columnIndex.size === 0) {
    throw new Error(
      'Não foi possível reconhecer as colunas da planilha IQ09. Verifique o formato do export.',
    )
  }

  const rows: Iq09Row[] = []
  for (let i = 1; i < matrix.length; i += 1) {
    const raw = matrix[i] ?? []
    const isEmpty = raw.every((cell) => String(cell ?? '').trim() === '')
    if (isEmpty) continue

    const row = Object.fromEntries(
      IQ09_COLUMNS.map((column) => {
        const idx = columnIndex.get(column)
        const value = idx == null ? '' : formatCellValue(raw[idx])
        return [column, value]
      }),
    ) as Iq09Row

    rows.push(row)
  }

  return { columns: [...IQ09_COLUMNS], rows }
}
