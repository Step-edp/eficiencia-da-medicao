import { randomInt } from 'node:crypto'
import xlsx from 'xlsx'

export type PasswordSheetProfile = {
  id: string
  label: string
  individualDigits: number
  masterDigits: number
  passwordType: 'alphanumeric'
}

/** Regras gravadas por modelo de planilha. ZEUS THS: senha de 32 e senha mestra de 16. */
const PROFILES: PasswordSheetProfile[] = [
  {
    id: 'zeus-ths',
    label: 'ZEUS THS',
    individualDigits: 32,
    masterDigits: 16,
    passwordType: 'alphanumeric',
  },
]

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export type ParsedPasswordSheet = {
  profile: PasswordSheetProfile
  title: string
  manufacturer: string
  materialCode: string
  orderNumber: string
  client: string
  masterCell: string
  existingMaster: string
  meters: Array<{
    meter: string
    cell: string
    existingPassword: string
  }>
}

function normalizeLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
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
  return null
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
      'Este modelo de planilha ainda não está cadastrado. O modelo disponível é o ZEUS THS.',
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

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const label = normalizeLabel(cellText(sheet, row, 0))
    const value = cellText(sheet, row, 1)
    if (!title && /zeus\s*ths/i.test(value)) title = value
    if (label === 'fabricante') manufacturer = value
    if (label === 'cliente') client = value
    if (label === 'codigo de material') materialCode = value
    if (label === 'pedido de compra') orderNumber = value
    if (label.startsWith('numero de serie')) headerRow = row

    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const text = normalizeLabel(cellText(sheet, row, column))
      if (text !== 'senha (unica)' && text !== 'senha unica') continue
      const below = cellText(sheet, row + 1, column)
      masterCell = xlsx.utils.encode_cell({ r: row + 1, c: column })
      if (below && !normalizeLabel(below).startsWith('numero de serie')) {
        existingMaster = below
      }
    }
  }

  if (headerRow < 0) {
    throw new Error('Não encontrei a coluna Número de Série nesta planilha.')
  }
  if (!masterCell) {
    throw new Error('Não encontrei o campo Senha (única) para preencher a senha mestra.')
  }
  if (!manufacturer || !materialCode || !orderNumber) {
    throw new Error(
      'A planilha precisa informar fabricante, código de material e pedido de compra.',
    )
  }

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
      cell: xlsx.utils.encode_cell({ r: row, c: 1 }),
      existingPassword: cellText(sheet, row, 1),
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
    existingMaster,
    meters,
  }
}

export function randomPassword(length: number) {
  return Array.from({ length }, () => CHARSET[randomInt(CHARSET.length)]).join('')
}

export function writeSheetCell(sheet: xlsx.WorkSheet, address: string, value: string) {
  sheet[address] = { t: 's', v: value }
}

export function workbookFromBuffer(buffer: Buffer) {
  return xlsx.read(buffer, { type: 'buffer', cellDates: true })
}

export function workbookToBuffer(workbook: xlsx.WorkBook) {
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
