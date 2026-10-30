import * as XLSX from 'xlsx'

export class GcImportError extends Error {}

export type GcTestPoint = {
  test: string
  energy: string
  value: string
}

export type GcAssayMeter = {
  meter: string
  meterName: string
  position: number
  validation: string
  tests: GcTestPoint[]
}

export type GcAssayParse = {
  title: string
  operatorName: string
  meters: GcAssayMeter[]
}

export type GcSeal = {
  meter: string
  seal1: string
  seal2: string
}

export type GcDestination = {
  clientName: string
  installation: string
  ns: string
  meter: string
  calibratedOn: string
  simplified: string
  category: string
  voltage: string
  rtp: string
  rtc: string
  maxDemand: string
  address: string
  city: string
  remotas: string
  remoteCollection: string
  withdrawnByNote: string
}

function cell(row: unknown[] | undefined, index: number) {
  return String(row?.[index] ?? '').trim()
}

function norm(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function meterDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

function sheetRows(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })
}

function looksLikePersonName(value: string) {
  if (value.length < 3 || value.length > 40) return false
  if (/\d/.test(value)) return false
  if (
    /medidor|valid|nome|cliente|posicao|ensaio|teste|energia|fabrica|lacre|resultado/i.test(
      value,
    )
  ) {
    return false
  }
  return /^[A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+){0,3}$/.test(value)
}

function parseAssaySheet(rows: unknown[][], sheetName: string): GcAssayParse | null {
  let fabRow = -1
  let fabLabelCol = -1
  const scanRows = Math.min(rows.length, 45)
  for (let r = 0; r < scanRows; r += 1) {
    const row = rows[r] ?? []
    for (let c = 0; c < row.length; c += 1) {
      const text = norm(row[c])
      if (text.includes('fabricacao')) {
        fabRow = r
        fabLabelCol = c
        break
      }
    }
    if (fabRow >= 0) break
  }
  if (fabRow < 0) return null

  const meterCols: { col: number; meter: string }[] = []
  const fab = rows[fabRow] ?? []
  for (let c = fabLabelCol + 1; c < fab.length; c += 1) {
    const digits = meterDigits(fab[c])
    if (digits.length >= 5 && digits.length <= 12) {
      meterCols.push({ col: c, meter: digits })
    }
  }
  if (!meterCols.length) return null

  let title = sheetName
  for (let r = 0; r < Math.min(4, rows.length); r += 1) {
    for (const value of rows[r] ?? []) {
      const text = String(value ?? '').replace(/\s+/g, ' ').trim()
      if (text.length > 8 && /ensaio|e750|teste|gc/i.test(text)) {
        title = text
        break
      }
    }
    if (title !== sheetName) break
  }

  let operatorName = ''
  for (let r = 0; r < fabRow; r += 1) {
    for (const value of rows[r] ?? []) {
      const text = String(value ?? '').replace(/\s+/g, ' ').trim()
      if (looksLikePersonName(text)) operatorName = text
    }
  }

  let nameRow = -1
  let validationRow = -1
  for (let r = 0; r < fabRow; r += 1) {
    const joined = (rows[r] ?? []).map((value) => norm(value)).join(' ')
    if (joined.includes('nome do medidor')) nameRow = r
    if (joined.includes('validacao')) validationRow = r
  }

  let testStart = fabRow + 1
  let testCol = 1
  let energyCol = 2
  for (let r = fabRow; r < rows.length; r += 1) {
    const row = rows[r] ?? []
    for (let c = 0; c < row.length; c += 1) {
      if (norm(row[c]) === 'teste') {
        testStart = r + 1
        testCol = c
        energyCol = c + 1
        break
      }
    }
    if (testStart > fabRow + 1 || testCol !== 1) break
  }

  const meters = meterCols.map((item, index) => {
    const tests: GcTestPoint[] = []
    for (let r = testStart; r < rows.length; r += 1) {
      const test = cell(rows[r], testCol)
      const energy = cell(rows[r], energyCol)
      const value = cell(rows[r], item.col)
      if (!test || !/[0-9]/.test(value)) continue
      tests.push({ test, energy, value })
    }
    return {
      meter: item.meter,
      meterName: nameRow >= 0 ? cell(rows[nameRow], item.col) : '',
      position: index + 1,
      validation: validationRow >= 0 ? cell(rows[validationRow], item.col) : '',
      tests,
    }
  })

  return { title, operatorName, meters }
}

export function parseGcAssayWorkbook(buffer: Buffer): GcAssayParse {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const candidates: { regist: boolean; parsed: GcAssayParse }[] = []
  for (const name of workbook.SheetNames) {
    const parsed = parseAssaySheet(sheetRows(workbook.Sheets[name]), name)
    if (!parsed) continue
    candidates.push({ regist: /regist/i.test(name), parsed })
  }
  const preferred = candidates.filter((item) => !item.regist)
  const pool = preferred.length ? preferred : candidates
  pool.sort((a, b) => b.parsed.meters.length - a.parsed.meters.length)
  const best = pool[0]?.parsed
  if (!best || !best.meters.length) {
    throw new GcImportError(
      'Não encontrei os números de fabricação dos medidores na planilha de ensaio.',
    )
  }
  return best
}

export function parseGcSealsWorkbook(buffer: Buffer): GcSeal[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const seals = new Map<string, GcSeal>()
  for (const name of workbook.SheetNames) {
    if (/^resumo/i.test(name)) continue
    const rows = sheetRows(workbook.Sheets[name])
    let header = -1
    const blocks: { meterCol: number; seal1: number; seal2: number }[] = []
    for (let r = 0; r < Math.min(rows.length, 40); r += 1) {
      const labels = (rows[r] ?? []).map((value) => norm(value))
      const found: { meterCol: number; seal1: number; seal2: number }[] = []
      labels.forEach((label, index) => {
        if (label !== 'medidor') return
        let seal1 = -1
        let seal2 = -1
        for (let c = index + 1; c < labels.length; c += 1) {
          if (labels[c] === 'medidor') break
          if (seal1 < 0 && labels[c].startsWith('lacre 1')) seal1 = c
          else if (seal1 < 0 && labels[c] === 'lacre') seal1 = c
          else if (labels[c].startsWith('lacre 2')) seal2 = c
        }
        if (seal1 >= 0) found.push({ meterCol: index, seal1, seal2 })
      })
      if (found.length) {
        header = r
        blocks.push(...found)
        break
      }
    }
    if (header < 0) continue
    for (let r = header + 1; r < rows.length; r += 1) {
      for (const block of blocks) {
        const meter = meterDigits(cell(rows[r], block.meterCol))
        if (meter.length < 5 || meter.length > 12) continue
        const seal1 = cell(rows[r], block.seal1)
        const seal2 = block.seal2 >= 0 ? cell(rows[r], block.seal2) : ''
        if (!seal1 && !seal2) continue
        seals.set(meter, { meter, seal1, seal2 })
      }
    }
  }
  if (!seals.size) {
    throw new GcImportError(
      'Não encontrei medidores e lacres na planilha. Use a aba com as colunas Medidor e Lacre.',
    )
  }
  return [...seals.values()]
}

type DestinationField = keyof GcDestination

function destinationField(header: string): DestinationField | null {
  if (header === 'cliente') return 'clientName'
  if (header.startsWith('instal')) return 'installation'
  if (header === 'ns') return 'ns'
  if (header === 'medidor') return 'meter'
  if (header.startsWith('calibr')) return 'calibratedOn'
  if (header.startsWith('simplific')) return 'simplified'
  if (header === 'cat' || header === 'cat.' || header.startsWith('cat.')) return 'category'
  if (header.startsWith('tensao')) return 'voltage'
  if (header === 'rtp') return 'rtp'
  if (header === 'rtc') return 'rtc'
  if (header.startsWith('demanda')) return 'maxDemand'
  if (header.startsWith('endereco')) return 'address'
  if (header === 'cidade') return 'city'
  if (header.startsWith('remota de')) return 'remoteCollection'
  if (header === 'remotas' || header.startsWith('remotas')) return 'remotas'
  if (header.startsWith('retirado')) return 'withdrawnByNote'
  return null
}

function emptyDestination(meter: string): GcDestination {
  return {
    clientName: '',
    installation: '',
    ns: '',
    meter,
    calibratedOn: '',
    simplified: '',
    category: '',
    voltage: '',
    rtp: '',
    rtc: '',
    maxDemand: '',
    address: '',
    city: '',
    remotas: '',
    remoteCollection: '',
    withdrawnByNote: '',
  }
}

export function parseGcDestinationWorkbook(buffer: Buffer): GcDestination[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  for (const name of workbook.SheetNames) {
    const rows = sheetRows(workbook.Sheets[name])
    let header = -1
    const columns = new Map<DestinationField, number>()
    for (let r = 0; r < Math.min(rows.length, 25); r += 1) {
      const mapped = new Map<DestinationField, number>()
      ;(rows[r] ?? []).forEach((value, index) => {
        const field = destinationField(norm(value))
        if (field && !mapped.has(field)) mapped.set(field, index)
      })
      if (mapped.has('clientName') && mapped.has('meter')) {
        header = r
        mapped.forEach((index, field) => columns.set(field, index))
        break
      }
    }
    if (header < 0) continue
    const items: GcDestination[] = []
    for (let r = header + 1; r < rows.length; r += 1) {
      const meterCol = columns.get('meter')
      const meter = meterDigits(meterCol == null ? '' : cell(rows[r], meterCol))
      if (meter.length < 5 || meter.length > 12) continue
      const item = emptyDestination(meter)
      columns.forEach((index, field) => {
        if (field === 'meter') return
        item[field] = cell(rows[r], index)
      })
      items.push(item)
    }
    if (items.length) return items
  }
  throw new GcImportError(
    'Não encontrei a planilha de destinação com as colunas Cliente e Medidor.',
  )
}
