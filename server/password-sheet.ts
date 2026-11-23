import { randomInt } from 'node:crypto'
import ExcelJS from 'exceljs'
import xlsx from 'xlsx'

export type SheetPasswordKey = 'password' | 'ak' | 'ek' | 'lls'

type ColumnRule = {
  key: SheetPasswordKey
  label: string
  digits: number
  matches: (header: string) => boolean
}

export type PasswordSheetProfile = {
  id: string
  label: string
  masterDigits: number
  passwordType: 'alphanumeric'
  columns: ColumnRule[]
}

/**
 * ZEUS THS: uma senha de 32 e senha mestra de 16.
 * ZEUS: senha AK e EK de 16, senha LLS de 8 e senha mestra de 16.
 * Cronos NG+: uma senha de 32, sem senha mestra.
 * NSX ABNT: senha de 10. A fórmula junta 333333 e converte os 16 caracteres para hexadecimal.
 * O campo amarelo de senha única fica vazio.
 */
const PROFILES: PasswordSheetProfile[] = [
  {
    id: 'zeus-ths',
    label: 'ZEUS THS',
    masterDigits: 16,
    passwordType: 'alphanumeric',
    columns: [
      {
        key: 'password',
        label: 'Senha',
        digits: 32,
        matches: (header) => header === 'senha (individual)',
      },
    ],
  },
  {
    id: 'zeus',
    label: 'ZEUS',
    masterDigits: 16,
    passwordType: 'alphanumeric',
    columns: [
      { key: 'ak', label: 'Senha AK', digits: 16, matches: (header) => header === 'senha ak' },
      { key: 'ek', label: 'Senha EK', digits: 16, matches: (header) => header === 'senha ek' },
      { key: 'lls', label: 'Senha LLS', digits: 8, matches: (header) => header === 'senha lls' },
    ],
  },
  {
    id: 'cronos-ng',
    label: 'Cronos NG+',
    masterDigits: 0,
    passwordType: 'alphanumeric',
    columns: [
      { key: 'password', label: 'Senha', digits: 32, matches: (header) => header === 'senha' },
    ],
  },
  {
    id: 'nansen-nsx',
    label: 'NSX ABNT',
    masterDigits: 0,
    passwordType: 'alphanumeric',
    columns: [
      { key: 'password', label: 'Senha', digits: 10, matches: (header) => header.startsWith('senha(10') },
    ],
  },
]

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export type ParsedPasswordCell = {
  key: SheetPasswordKey
  label: string
  digits: number
  cell: string
  existing: string
}

export type ParsedPasswordSheet = {
  profile: PasswordSheetProfile
  title: string
  manufacturer: string
  materialCode: string
  orderNumber: string
  client: string
  masterCell: string
  /** Campos amarelos de senha única. Ficam vazios quando cada medidor tem senha própria. */
  uniquePasswordCells: string[]
  existingMaster: string
  /** A planilha já calcula complemento e hexadecimal. Não regravar essas células. */
  keepFormulas?: boolean
  meters: Array<{
    meter: string
    passwords: ParsedPasswordCell[]
    complement?: string
    hex?: string
  }>
}

function normalizeLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[:：]+$/g, '')
    .trim()
}

function cellText(sheet: xlsx.WorkSheet, row: number, column: number) {
  const cell = sheet[xlsx.utils.encode_cell({ r: row, c: column })]
  if (!cell || cell.v == null) return ''
  return String(cell.v).trim()
}

function matchProfile(workbookText: string) {
  if (/zeus\s*ths/i.test(workbookText)) {
    return PROFILES.find((profile) => profile.id === 'zeus-ths') ?? null
  }
  if (/medidores\s+zeus/i.test(workbookText)) {
    return PROFILES.find((profile) => profile.id === 'zeus') ?? null
  }
  if (/cronos\s*ng\+/i.test(workbookText)) {
    return PROFILES.find((profile) => profile.id === 'cronos-ng') ?? null
  }
  return null
}

function isUniqueHeader(value: string) {
  return value.includes('(unica)')
}

export function parsePasswordSheet(workbook: xlsx.WorkBook): ParsedPasswordSheet {
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) {
    throw new Error('A planilha está vazia.')
  }

  const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1:B1')
  const texts: string[] = []
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const text = cellText(sheet, row, column)
      if (text) texts.push(text)
    }
  }

  const profile = matchProfile(texts.join('\n'))
  if (!profile) {
    throw new Error(
      'Este modelo de planilha ainda não está cadastrado. Os modelos disponíveis são ZEUS THS, ZEUS, Cronos NG+ e NSX ABNT.',
    )
  }

  let title = ''
  let manufacturer = ''
  let materialCode = ''
  let orderNumber = ''
  let client = ''
  let headerRow = -1
  let masterCell = ''
  let existingMaster = ''
  const uniquePasswordCells: string[] = []

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const label = normalizeLabel(cellText(sheet, row, 0))
    const value = cellText(sheet, row, 1)
    if (!title && /zeus|cronos/i.test(value)) title = value
    if (label === 'fabricante') manufacturer = value
    if (label === 'cliente') client = value
    if (label === 'codigo de material') materialCode = value
    if (label === 'pedido de compra') orderNumber = value
    if (label.startsWith('numero de serie')) headerRow = row
    if (label === 'senha mestra') {
      masterCell = xlsx.utils.encode_cell({ r: row + 1, c: 1 })
      const next = cellText(sheet, row + 1, 1)
      if (next.length === profile.masterDigits && !/deve possuir/i.test(next)) {
        existingMaster = next
      }
    }

    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const text = normalizeLabel(cellText(sheet, row, column))
      if (!isUniqueHeader(text)) continue
      uniquePasswordCells.push(xlsx.utils.encode_cell({ r: row + 1, c: column }))
    }
  }

  if (headerRow < 0) {
    throw new Error('Não encontrei a coluna Número de Série nesta planilha.')
  }
  if (!masterCell && profile.masterDigits > 0) {
    throw new Error('Não encontrei o campo Senha mestra nesta planilha.')
  }
  if (!manufacturer || !materialCode || !orderNumber) {
    throw new Error(
      'A planilha precisa informar fabricante, código de material e pedido de compra.',
    )
  }

  const columns = profile.columns.map((rule) => {
    let column = -1
    for (let index = range.s.c; index <= range.e.c; index += 1) {
      const header = normalizeLabel(cellText(sheet, headerRow, index))
      if (rule.matches(header)) {
        column = index
        break
      }
    }
    if (column < 0) {
      throw new Error(`Não encontrei a coluna ${rule.label} nesta planilha.`)
    }
    return { ...rule, column }
  })

  const meters: ParsedPasswordSheet['meters'] = []
  const seen = new Set<string>()
  for (let row = headerRow + 1; row <= range.e.r; row += 1) {
    const meter = cellText(sheet, row, 0).replace(/\s+/g, '')
    if (!meter) continue
    if (!/^\d+$/.test(meter)) {
      throw new Error(`Número de série inválido na linha ${row + 1}: ${meter}.`)
    }
    if (seen.has(meter)) {
      throw new Error(`O número de série ${meter} está repetido na planilha.`)
    }
    seen.add(meter)
    meters.push({
      meter,
      passwords: columns.map((column) => ({
        key: column.key,
        label: column.label,
        digits: column.digits,
        cell: xlsx.utils.encode_cell({ r: row, c: column.column }),
        existing: cellText(sheet, row, column.column),
      })),
    })
  }

  if (!meters.length) {
    throw new Error('Nenhum número de série encontrado na planilha.')
  }

  return {
    profile,
    title: title || profile.label,
    manufacturer,
    materialCode,
    orderNumber,
    client,
    masterCell,
    uniquePasswordCells,
    existingMaster,
    meters,
  }
}

function excelText(value: ExcelJS.CellValue): string {
  if (value == null) return ''
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'object' && 'richText' in value) {
    return value.richText.map((part) => part.text).join('').trim()
  }
  if (typeof value === 'object' && 'result' in value && value.result != null && typeof value.result !== 'object') {
    return String(value.result).trim()
  }
  return ''
}

/** Regra da planilha NSX: senha de 10 + 333333, e cada caractere vira dois dígitos hex. */
export function nansenFormulaPasswords(senha: string) {
  const complement = `${senha}333333`
  const hex = [...complement]
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  return { complement, hex }
}

async function parseNansenNsx(buffer: Buffer): Promise<ParsedPasswordSheet> {
  const profile = PROFILES.find((item) => item.id === 'nansen-nsx')
  if (!profile) throw new Error('Modelo NSX ABNT indisponível.')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet =
    workbook.worksheets.find((item) => /abnt|nsx/i.test(item.name)) ?? workbook.worksheets[0]
  if (!sheet) throw new Error('A planilha está vazia.')

  let title = ''
  let manufacturer = ''
  let materialCode = ''
  let orderNumber = ''
  let client = ''
  let dataStart = -1

  for (let row = 1; row <= Math.min(sheet.rowCount, 40); row += 1) {
    const label = normalizeLabel(excelText(sheet.getCell(row, 1).value))
    const value =
      [3, 2, 4]
        .map((column) => excelText(sheet.getCell(row, column).value))
        .find((text) => text && normalizeLabel(text) !== label) ?? ''
    if (!title && /nsx|abnt/i.test(excelText(sheet.getCell(row, 1).value))) {
      title = excelText(sheet.getCell(row, 1).value)
    }
    if (label === 'fabricante') manufacturer = value
    if (label === 'cliente') client = value
    if (label.startsWith('codigo de material')) materialCode = value
    if (label === 'pedido de edp' || label === 'pedido de compra') orderNumber = value
    if (label.includes('preencher abaixo')) dataStart = row + 1
  }

  if (!manufacturer || !materialCode || !orderNumber || dataStart < 0) {
    throw new Error(
      'A planilha NSX precisa informar fabricante, código de material, pedido e a linha das senhas.',
    )
  }

  const meters: ParsedPasswordSheet['meters'] = []
  const seen = new Set<string>()
  for (let row = dataStart; row <= sheet.rowCount; row += 1) {
    const meter = excelText(sheet.getCell(row, 1).value).replace(/\s+/g, '')
    if (!meter) continue
    if (!/^\d+$/.test(meter)) continue
    const senha = excelText(sheet.getCell(row, 2).value)
    if (!senha) continue
    if (senha.length !== 10) {
      throw new Error(`A senha do medidor ${meter} precisa ter 10 caracteres.`)
    }
    if (seen.has(meter)) throw new Error(`O número de série ${meter} está repetido na planilha.`)
    seen.add(meter)
    const derived = nansenFormulaPasswords(senha)
    meters.push({
      meter,
      complement: derived.complement,
      hex: derived.hex,
      passwords: [
        {
          key: 'password',
          label: 'Senha',
          digits: 10,
          cell: `B${row}`,
          existing: senha,
        },
      ],
    })
  }

  if (!meters.length) throw new Error('Nenhum número de série encontrado na planilha.')

  return {
    profile,
    title: title || profile.label,
    manufacturer,
    materialCode,
    orderNumber,
    client,
    masterCell: '',
    uniquePasswordCells: [],
    existingMaster: '',
    keepFormulas: true,
    meters,
  }
}

export async function parsePasswordBuffer(buffer: Buffer): Promise<ParsedPasswordSheet> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const marker = workbook.worksheets
    .map((sheet) => excelText(sheet.getCell(1, 1).value))
    .join('\n')
  if (/familia nsx|protocolo abnt/i.test(marker)) return parseNansenNsx(buffer)
  return parsePasswordSheet(workbookFromBuffer(buffer))
}

export function randomPassword(length: number) {
  return Array.from({ length }, () => CHARSET[randomInt(CHARSET.length)]).join('')
}

export function workbookFromBuffer(buffer: Buffer) {
  return xlsx.read(buffer, { type: 'buffer', cellDates: true })
}

/** Grava só os valores, em cima do arquivo original, para manter colunas, mesclas e larguras. */
export async function fillOriginalWorkbook(
  buffer: Buffer,
  values: Array<{ cell: string; value: string }>,
) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('A planilha está vazia.')
  for (const item of values) {
    sheet.getCell(item.cell).value = item.value || null
  }
  const out = await workbook.xlsx.writeBuffer()
  return Buffer.from(out)
}
