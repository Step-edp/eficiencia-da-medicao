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
 * Cronos NG+ e ARES: uma senha, em geral de 32, sem senha mestra.
 * NSX ABNT: senha de 10. A fórmula junta 333333 e converte os 16 caracteres para hexadecimal.
 * Pantheon: senhas coletivas, repetidas para cada série do nome do arquivo.
 * DR NG: senhas coletivas e, quando a planilha traz, senhas por medidor.
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
    id: 'ares',
    label: 'ARES',
    masterDigits: 0,
    passwordType: 'alphanumeric',
    columns: [
      { key: 'password', label: 'Senha', digits: 32, matches: (header) => header === 'senha' },
    ],
  },
  {
    id: 'pantheon',
    label: 'Pantheon',
    masterDigits: 0,
    passwordType: 'alphanumeric',
    columns: [],
  },
  {
    id: 'dr-ng',
    label: 'DR NG',
    masterDigits: 0,
    passwordType: 'alphanumeric',
    columns: [],
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
    extras?: Array<{ label: string; value: string }>
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
  if (/medidores\s+ares/i.test(workbookText)) {
    return PROFILES.find((profile) => profile.id === 'ares') ?? null
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
      'Este modelo de planilha ainda não está cadastrado. Os modelos disponíveis são ZEUS THS, ZEUS, Cronos NG+, ARES, Pantheon, DR NG e NSX ABNT.',
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
    if (!title && /zeus|cronos|ares|pantheon|dr ng/i.test(value)) title = value
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
    if (column < 0 && rule.key === 'password') {
      const header = normalizeLabel(cellText(sheet, headerRow, 1))
      const sample = cellText(sheet, headerRow + 1, 1)
      if (!header && sample) column = 1
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
    if (!/^D?\d+$/i.test(meter)) {
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

function serialsFromFileName(fileName: string) {
  const match = fileName.match(/serie\s+(D?\d+)\s+a\s+(D?\d+)/i)
  if (!match) return []
  const left = match[1].toUpperCase()
  const right = match[2].toUpperCase()
  const leftPrefixed = left.startsWith('D')
  const rightPrefixed = right.startsWith('D')
  if (leftPrefixed !== rightPrefixed) return []
  const prefix = leftPrefixed ? 'D' : ''
  const startText = left.slice(prefix.length)
  const endText = right.slice(prefix.length)
  const start = Number(startText)
  const end = Number(endText)
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || end - start > 20000) {
    return []
  }
  const meters: string[] = []
  for (let value = start; value <= end; value += 1) {
    meters.push(prefix + String(value).padStart(startText.length, '0'))
  }
  return meters
}

function collectiveKind(label: string) {
  if (label.includes('prefixo ssid')) return 'ssid'
  if (label.includes('wifi')) return 'wifi'
  if (label.includes('repareamento')) return 'repair'
  if (label === 'senha mk' || label.startsWith('senha mk ')) return 'mk'
  if (label === 'senha ak' || label.startsWith('senha ak ')) return 'ak'
  if (label === 'senha ek' || label.startsWith('senha ek ')) return 'ek'
  if (label === 'senha bk' || label.startsWith('senha bk ')) return 'bk'
  if (label === 'senha lls' || label.startsWith('senha lls ')) return 'lls'
  if (label === 'senha aes' || label.startsWith('senha aes ')) return 'aes'
  return ''
}

function usableCollectiveValue(kind: string, value: string) {
  if (!value || /deve possuir|preencher|utilizada no modo|utilizada para/i.test(value)) return false
  if (kind === 'wifi' || kind === 'ssid') return value.length >= 3 && value.length <= 48
  return value.length >= 8 && value.length <= 64 && !/\s/.test(value)
}

/** Pantheon traz só senhas coletivas. DR NG traz as coletivas e, em alguns arquivos, senhas por medidor sem título de coluna. */
function parseCollectiveWorkbook(
  workbook: xlsx.WorkBook,
  fileName: string,
): ParsedPasswordSheet | null {
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) return null
  const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1:B1')
  const texts: string[] = []
  for (let row = range.s.r; row <= Math.min(range.e.r, 20); row += 1) {
    for (let column = range.s.c; column <= Math.min(range.e.c, 3); column += 1) {
      const text = cellText(sheet, row, column)
      if (text) texts.push(text)
    }
  }
  const blob = texts.join('\n')
  const isPantheon = /pantheon/i.test(blob)
  const isDr = /\bdr\s*ng\b/i.test(blob)
  if (!isPantheon && !isDr) return null
  const profile = PROFILES.find((item) => item.id === (isDr ? 'dr-ng' : 'pantheon'))
  if (!profile) return null

  let title = ''
  let manufacturer = ''
  let materialCode = ''
  let orderNumber = ''
  let client = ''
  const shared = new Map<string, string>()
  for (let row = range.s.r; row <= Math.min(range.e.r, 30); row += 1) {
    const rawLabel = cellText(sheet, row, 0)
    const label = normalizeLabel(rawLabel)
    const value = cellText(sheet, row, 1)
    if (!title && /pantheon|dr\s*ng/i.test(value || rawLabel)) title = value || rawLabel
    if (label === 'fabricante') manufacturer = value
    if (label === 'cliente') client = value
    if (label === 'codigo de material') materialCode = value
    if (label === 'pedido de compra') orderNumber = value
    const kind = collectiveKind(label)
    if (kind && usableCollectiveValue(kind, value)) shared.set(kind, value)
  }

  if (!manufacturer || !materialCode || !orderNumber) {
    throw new Error(
      'A planilha precisa informar fabricante, código de material e pedido de compra.',
    )
  }

  const extraShared = [
    shared.get('mk') ? { label: 'Senha MK (coletiva)', value: shared.get('mk')! } : null,
    shared.get('repair')
      ? { label: 'Senha de Repareamento (coletiva)', value: shared.get('repair')! }
      : null,
    shared.get('bk') ? { label: 'Senha BK (coletiva)', value: shared.get('bk')! } : null,
    shared.get('aes') ? { label: 'Senha AES (coletiva)', value: shared.get('aes')! } : null,
    shared.get('wifi') ? { label: 'Senha Wifi (coletiva)', value: shared.get('wifi')! } : null,
    shared.get('ssid') ? { label: 'Prefixo SSID', value: shared.get('ssid')! } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item))

  const meters: ParsedPasswordSheet['meters'] = []
  const seen = new Set<string>()
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const meter = cellText(sheet, row, 0).replace(/\s+/g, '')
    if (!/^D?\d+$/i.test(meter)) continue
    if (seen.has(meter)) throw new Error(`O número de série ${meter} está repetido na planilha.`)
    seen.add(meter)
    const individualB = cellText(sheet, row, 1)
    const individualC = cellText(sheet, row, 2)
    const individualD = cellText(sheet, row, 3)
    const extras = [...extraShared]
    if (usableCollectiveValue('mk', individualC)) {
      extras.push({ label: 'Senha MK', value: individualC })
    }
    if (usableCollectiveValue('aes', individualD)) {
      extras.push({ label: 'Senha AES', value: individualD })
    }
    const passwords: ParsedPasswordCell[] = []
    if (usableCollectiveValue('password', individualB)) {
      passwords.push({
        key: 'password',
        label: 'Senha',
        digits: individualB.length,
        cell: xlsx.utils.encode_cell({ r: row, c: 1 }),
        existing: individualB,
      })
    }
    meters.push({ meter: meter.toUpperCase().startsWith('D') ? `D${meter.replace(/\D/g, '')}` : meter, passwords, extras })
  }

  if (!meters.length && isPantheon) {
    const serials = serialsFromFileName(fileName)
    if (!serials.length) {
      throw new Error('A planilha Pantheon não informa os números de série.')
    }
    const passwords: ParsedPasswordCell[] = []
    const pushSlot = (key: SheetPasswordKey, label: string, value: string | undefined) => {
      if (!value) return
      passwords.push({ key, label, digits: value.length, cell: '', existing: value })
    }
    pushSlot('ak', 'Senha AK', shared.get('ak'))
    pushSlot('ek', 'Senha EK', shared.get('ek'))
    pushSlot('lls', 'Senha LLS', shared.get('lls'))
    for (const meter of serials) {
      meters.push({ meter, passwords, extras: extraShared })
    }
  }

  if (!meters.length) {
    throw new Error('Nenhum número de série encontrado na planilha.')
  }

  return {
    profile: {
      ...profile,
      label: isDr ? 'DR NG' : /ng/i.test(title) ? 'Pantheon NG' : 'Pantheon',
    },
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

export async function parsePasswordBuffer(buffer: Buffer, fileName = ''): Promise<ParsedPasswordSheet> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const marker = workbook.worksheets
    .map((sheet) => excelText(sheet.getCell(1, 1).value))
    .join('\n')
  if (/familia nsx|protocolo abnt/i.test(marker)) return parseNansenNsx(buffer)
  const sheetWorkbook = workbookFromBuffer(buffer)
  const collective = parseCollectiveWorkbook(sheetWorkbook, fileName)
  if (collective) return collective
  return parsePasswordSheet(sheetWorkbook)
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
