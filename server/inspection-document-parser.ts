import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { formatAvailableSlot } from './schedule-slots.js'

function isUnreadablePdfText(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return true

  const controlChars = (normalized.match(/[\u0000-\u001f\u007f-\u009f]/g) ?? []).length
  if (controlChars / normalized.length > 0.12) return true

  const letters = (normalized.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length
  if (letters / normalized.length < 0.04) return true

  return false
}

// "5.Dados da Medição" até "6. Selagem": faixa do TOI com medidor encontrado/instalado.
// O PDF em tabela pode embaralhar a ordem das células, então o número do TOI às vezes
// aparece nessa faixa antes do medidor. Sempre descartamos o número do TOI e preferimos
// o valor ao lado de "Nº do Medidor Encontrado".
const DADOS_MEDICAO_START = /5\s*\.?\s*dados\s+da\s+medi[cç][aã]o/i
const DADOS_MEDICAO_END = /6\s*\.?\s*selagem/i
const METER_NUMBER_PATTERN = /\b\d{7,9}\b/

const LACRE_LABEL_PATTERN = /n[uú]mero\s+do\(s\)\s+lacre\(s\)\s*:?/i
const LACRE_VALUE_PATTERN = /\b[0-9A-Za-z-]{4,}\b/

const INSTALLATION_LABEL_PATTERN = /instala[cç][aã]o(?:\s+n[oº.]?\s*)?\s*:?\s*/i
const INSTALLATION_VALUE_PATTERN = /\b\d{8,9}\b/

const TOI_LABEL_PATTERN = /(?:n[uú]mero\s+(?:do\s+)?toi|toi\s*n[oº.]?\s*)\s*:?\s*/i
const TOI_VALUE_PATTERN = /\b\d{6,12}\b/
const ORDEM_INSPECAO_VALUE_PATTERN = /\b\d{10,14}\b/

const ORDEM_INSPECAO_LABEL_PATTERN = /ordem\s+de\s+inspe[cçãa\u00e7\u00e3]\s*n[º°o\u00ba.]?\s*:?\s*/i
const MEDIDOR_ENCONTRADO_LABEL_PATTERN =
  /(?:n[º°o.]?\s*(?:do\s+)?)?medidor\s+encontrado/i
const NOTA_LABEL_PATTERN = /nota(?:\s+fiscal)?\s*:?\s*/i
const NOTA_VALUE_PATTERN = /\b\d{8,12}\b/

const TOI_MARKER = /termo\s+de\s+ocorr[eêê]ncia\s+e\s+inspe/i
const COMUNICADO_MARKER = /comunicado\s+de\s+substitui[cçãa\u00e7\u00e3]{0,4}[oõ\u00f5]\s+de\s+medidor/i
const TOI_PARTIAL_MARKER = /termo\s+de\s+ocorr[eêê]/i
const MEDIDOR_ENCONTRADO_MARKER = /medidor\s+encontrado/i
const SUBSTITUICAO_MEDIDOR_MARKER = /substitui[cç][aã]o\s+de\s+medidor/i
const COMUNICADO_GENERIC_MARKER = /comunicado/i
const MEDIDOR_RETIRADO_MARKER = /medidor\s+retirado/i
const MEDIDOR_INSTALADO_MARKER = /medidor\s+instalado/i

const CSM_MEDIDOR_RETIRADO_PATTERN =
  /medidor\s+retirado[\s\S]{0,450}?do\s*medidor\s*:?\s*(\d{7,9})/i
const CSM_LACRE_PATTERN = /lacre(?:\(s\))?\s*n[^0-9]{0,4}\(?s?\)?\s*:?\s*(\d{6,12})/i
const CSM_TOI_REF_PATTERN = /toi\s*n[^0-9]{0,4}(\d{6,12})/i
const CSM_COMUNICADO_START = /comunicado\s+de\s+substitui/i
const CSM_MEDIDOR_NUMBER = /do\s*medidor\s*:?\s*(\d{7,9})/gi
const READING_LABEL_PATTERN = /lei[tr]ur[aeo](?:\s*k\s*w\s*h)?/i
const READING_VALUE_PATTERN = /\b\d{3,8}\b/
const READING_LABELED_VALUE_PATTERN =
  /lei[tr]ur[aeo](?:\s*k\s*w\s*h)?\s*[:\-]?\s*(\d{3,8})/gi
const READING_LABELED_GAP_PATTERN =
  /lei[tr]ur[aeo](?:\s*k\s*w\s*h)?[\s\S]{0,80}?(\d{3,8})/gi

function normalizeInspectionText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function compactInspectionText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function hasToiTitle(text: string, compact: string): boolean {
  if (TOI_MARKER.test(text)) return true
  if (TOI_PARTIAL_MARKER.test(text) && /inspe/i.test(text)) return true
  return compact.includes('termodeocorrencia') && compact.includes('inspecao')
}

function hasToiFormStructure(text: string, compact: string): boolean {
  if (DADOS_MEDICAO_START.test(text) && DADOS_MEDICAO_END.test(text)) return true
  if (MEDIDOR_ENCONTRADO_MARKER.test(text) && /selagem/i.test(text)) return true
  if (TOI_LABEL_PATTERN.test(text) && DADOS_MEDICAO_START.test(text)) return true
  if (compact.includes('dadosdamedicao') && compact.includes('selagem')) return true
  if (compact.includes('medidorencontrado') && compact.includes('selagem')) return true
  return false
}

function hasComunicadoStructure(text: string, compact: string): boolean {
  if (COMUNICADO_MARKER.test(text)) return true
  if (CSM_COMUNICADO_START.test(text)) return true
  if (
    COMUNICADO_GENERIC_MARKER.test(text) &&
    SUBSTITUICAO_MEDIDOR_MARKER.test(text)
  ) {
    return true
  }
  if (MEDIDOR_RETIRADO_MARKER.test(text) && MEDIDOR_INSTALADO_MARKER.test(text)) {
    return true
  }

  if (compact.includes('comunicadodesubstituicaodemedidor')) return true
  if (compact.includes('substituicaodemedidor') && compact.includes('comunicado')) {
    return true
  }
  if (compact.includes('medidorretirado') && compact.includes('medidorinstalado')) {
    return true
  }

  return false
}

type TextItem = {
  str?: string
  transform?: number[]
  width?: number
  height?: number
  hasEOL?: boolean
}

type PositionedText = {
  str: string
  x: number
  y: number
  width: number
  height: number
}

function positionedItemsFromContent(content: { items: unknown[] }): PositionedText[] {
  const items: PositionedText[] = []
  for (const raw of content.items) {
    const item = raw as TextItem
    const str = item.str?.trim() ?? ''
    if (!str) continue
    const transform = item.transform
    if (!transform || transform.length < 6) continue
    items.push({
      str,
      x: transform[4],
      y: transform[5],
      width: item.width ?? Math.abs(transform[0]) * str.length,
      height: item.height ?? Math.abs(transform[3]),
    })
  }
  return items
}

function readingLabels(items: PositionedText[]): PositionedText[] {
  return items.filter((item) => READING_LABEL_PATTERN.test(item.str) && !/\d{3,}/.test(item.str))
}

function topmostLabel(items: PositionedText[], pattern: RegExp): PositionedText | null {
  const matches = items.filter((item) => pattern.test(item.str))
  if (!matches.length) return null
  return [...matches].sort((left, right) => right.y - left.y || left.x - right.x)[0]
}

function valueUnderReadingLabel(
  items: PositionedText[],
  label: PositionedText,
  floorY: number,
): string | null {
  const cellWidth = Math.max(56, label.width * 2.2)
  const ranked = items
    .filter((item) => /^\d{3,8}$/.test(item.str.replace(/\s/g, '')))
    .map((candidate) => {
      const digits = candidate.str.replace(/\D/g, '')
      const sameColumn =
        candidate.x + candidate.width > label.x - 10 && candidate.x < label.x + cellWidth
      const below =
        candidate.y < label.y - Math.max(2, label.height * 0.2) && candidate.y > floorY
      const toTheRight =
        candidate.x >= label.x + Math.max(label.width - 4, 8) &&
        Math.abs(candidate.y - label.y) < Math.max(12, label.height) &&
        candidate.y > floorY
      if (!(sameColumn && below) && !toTheRight) return null
      const distance = below ? label.y - candidate.y : candidate.x - label.x
      return { digits, below, distance }
    })
    .filter((row): row is { digits: string; below: boolean; distance: number } => Boolean(row))
    .sort((left, right) => {
      if (left.below !== right.below) return left.below ? -1 : 1
      return left.distance - right.distance
    })

  return ranked[0]?.digits ?? null
}

function readingLabelBesideAnchor(
  labels: PositionedText[],
  anchor: PositionedText,
  instalado: PositionedText | null,
): PositionedText | null {
  const rowTolerance = Math.max(14, anchor.height * 1.8)
  const sameRow = labels
    .filter(
      (item) =>
        Math.abs(item.y - anchor.y) <= rowTolerance && item.x > anchor.x - 8,
    )
    .sort(
      (left, right) =>
        Math.abs(left.y - anchor.y) - Math.abs(right.y - anchor.y) ||
        left.x - right.x,
    )
  if (sameRow[0]) return sameRow[0]

  const columnWidth = Math.max(anchor.width, 120)
  const sameColumn = labels
    .filter((item) => {
      const aligned =
        item.x + item.width > anchor.x - 24 && item.x < anchor.x + columnWidth
      const below = item.y < anchor.y - Math.max(4, anchor.height * 0.3)
      const beforeInstalado =
        !instalado ||
        instalado.x > anchor.x + columnWidth * 0.6 ||
        item.y > instalado.y + Math.max(2, instalado.height * 0.2)
      return aligned && below && beforeInstalado
    })
    .sort((left, right) => right.y - left.y)
  return sameColumn[0] ?? null
}

function floorYForReadingLabel(
  label: PositionedText,
  nextRow: PositionedText | null,
): number {
  if (nextRow && nextRow.y < label.y) {
    return nextRow.y + Math.max(2, nextRow.height * 0.15)
  }
  return label.y - Math.max(24, label.height * 2.8)
}

/**
 * No TOI a tabela tem duas linhas (encontrado em cima, instalado embaixo).
 * Sempre usamos só a leitura da linha de cima, ao lado de "Medidor Encontrado".
 */
function readingsFromPositionedItems(items: PositionedText[]): string[] {
  const labels = readingLabels(items)
  if (!labels.length) return []

  const encontrado = topmostLabel(items, MEDIDOR_ENCONTRADO_LABEL_PATTERN)
  const retirado = topmostLabel(items, MEDIDOR_RETIRADO_MARKER)
  const instalado = topmostLabel(items, MEDIDOR_INSTALADO_MARKER)
  const anchor = encontrado ?? retirado

  if (anchor) {
    const label = readingLabelBesideAnchor(labels, anchor, instalado)
    if (!label) return []
    const value = valueUnderReadingLabel(items, label, floorYForReadingLabel(label, instalado))
    return value ? [value] : []
  }

  const stacked = [...labels].sort((left, right) => right.y - left.y || left.x - right.x)
  const top = stacked[0]
  const nextBelow = stacked.find(
    (item) => item.y < top.y - 8 && Math.abs(item.x - top.x) < 48,
  )
  const value = valueUnderReadingLabel(items, top, floorYForReadingLabel(top, nextBelow ?? instalado))
  return value ? [value] : []
}

export type InspectionDocumentParseResult = {
  meterEncontrado: string | null
  meterRetirado: string | null
  lacre: string | null
  coverSeal: string | null
  reading: string | null
  installation: string | null
  toi: string | null
  note: string | null
  scheduledAt: string | null
}

export type InspectionDocumentType = 'toi' | 'comunicado' | 'ambos' | 'desconhecido'

/**
 * O documento de inspeção exigido é composto por dois modelos fixos da EDP: o TOI
 * (Termo de Ocorrência e Inspeção) e o Comunicado de Substituição de Medidor. Podem ser
 * anexados juntos (um PDF com as duas páginas) ou separados (um PDF por vez) — por isso
 * classificamos pelo conteúdo em vez de exigir um único arquivo.
 */
export function classifyInspectionDocument(text: string): InspectionDocumentType {
  const normalized = normalizeInspectionText(text)
  if (!normalized) return 'desconhecido'

  const compact = compactInspectionText(normalized)
  const toiForm = hasToiFormStructure(normalized, compact)
  const toiTitle = hasToiTitle(normalized, compact)
  const hasComunicado = hasComunicadoStructure(normalized, compact)

  // CSM cita TOI nº / "Termo de Ocorrência" com frequência; isso não faz dele um TOI.
  // Só é "ambos" quando o PDF tem a ficha do TOI (dados da medição / selagem) e o comunicado.
  if (toiForm && hasComunicado) return 'ambos'
  if (hasComunicado) return 'comunicado'
  if (toiForm || toiTitle) return 'toi'
  return 'desconhecido'
}

function extractAfterLabel(
  text: string,
  labelPattern: RegExp,
  endPattern: RegExp | null,
  valuePattern: RegExp,
): string | null {
  const labelMatch = text.match(labelPattern)
  if (!labelMatch || labelMatch.index === undefined) return null

  const from = labelMatch.index + labelMatch[0].length
  const endMatch = endPattern ? text.slice(from).match(endPattern) : null
  const to = endMatch?.index !== undefined ? from + endMatch.index : from + 200

  const window = text.slice(from, to)
  const valueMatch = window.match(valuePattern)
  return valueMatch?.[0] ?? null
}

function digitKey(value: string | null | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.replace(/^0+/, '') || '0'
}

function listKnownToiNumbers(text: string): Set<string> {
  const values = new Set<string>()
  const add = (value: string | null | undefined) => {
    const key = digitKey(value)
    if (key) values.add(key)
  }
  add(extractToiNumber(text))
  for (const match of text.matchAll(/toi\s*n[^0-9]{0,8}(\d{6,12})/gi)) {
    add(match[1])
  }
  const ordem = text.match(/ordem\s+de\s+inspe[\s\S]{0,24}?(\d{10,14})/i)?.[1]
  if (ordem) {
    add(ordem)
    if (ordem.length >= 7) add(ordem.slice(-7))
  }
  return values
}

function isKnownToiNumber(value: string | null | undefined, toiNumbers: Set<string>): boolean {
  const key = digitKey(value)
  return Boolean(key && toiNumbers.has(key))
}

function firstMeterNumber(text: string, toiNumbers: Set<string>): string | null {
  for (const match of text.matchAll(new RegExp(METER_NUMBER_PATTERN.source, 'g'))) {
    if (match[0] && !isKnownToiNumber(match[0], toiNumbers)) return match[0]
  }
  return null
}

function meterAfterLabel(
  text: string,
  label: RegExp,
  toiNumbers: Set<string>,
  stopPattern?: RegExp,
  windowSize = 280,
): string | null {
  const labelMatch = text.match(label)
  if (!labelMatch || labelMatch.index === undefined) return null
  const from = labelMatch.index + labelMatch[0].length
  let slice = text.slice(from, from + windowSize)
  if (stopPattern) {
    const stop = slice.search(stopPattern)
    if (stop >= 0) slice = slice.slice(0, stop)
  }
  return firstMeterNumber(slice, toiNumbers)
}

function pickMeterNumber(
  primary: string | null,
  secondary: string | null,
  toiNumbers: Set<string>,
): string | null {
  if (primary && !isKnownToiNumber(primary, toiNumbers)) return primary
  if (secondary && !isKnownToiNumber(secondary, toiNumbers)) return secondary
  return null
}

function extractMeterEncontrado(text: string, toiNumbers: Set<string>): string | null {
  const labeled = meterAfterLabel(
    text,
    MEDIDOR_ENCONTRADO_LABEL_PATTERN,
    toiNumbers,
  )
  if (labeled) return labeled

  const startMatch = text.match(DADOS_MEDICAO_START)
  if (startMatch?.index !== undefined) {
    const from = startMatch.index + startMatch[0].length
    const endMatch = text.slice(from).match(DADOS_MEDICAO_END)
    const to = endMatch?.index !== undefined ? from + endMatch.index : from + 1200
    const section = text.slice(from, to)
    const meterMatch = firstMeterNumber(section, toiNumbers)
    if (meterMatch) return meterMatch
  }

  const ocrWindow = text.match(/medidor\s+encontrado[\s\S]{0,450}/i)?.[0]
  return ocrWindow ? firstMeterNumber(ocrWindow, toiNumbers) : null
}

function extractComunicadoMeterRetirado(text: string, toiNumbers: Set<string>): string | null {
  const comunicadoStart = text.search(CSM_COMUNICADO_START)
  const search = comunicadoStart >= 0 ? text.slice(comunicadoStart, comunicadoStart + 3000) : text
  const labeled = [...search.matchAll(new RegExp(CSM_MEDIDOR_NUMBER.source, 'gi'))]
    .map((match) => match[1])
    .find((value) => value && !isKnownToiNumber(value, toiNumbers))
  if (labeled) return labeled

  const fallback = text.match(CSM_MEDIDOR_RETIRADO_PATTERN)
  if (fallback?.[1] && !isKnownToiNumber(fallback[1], toiNumbers)) return fallback[1]

  const section = search.match(/medidor\s+retirado[\s\S]{0,400}/i)?.[0]
  if (!section) return null
  return firstMeterNumber(section, toiNumbers)
}

function extractComunicadoLacre(text: string): string | null {
  return text.match(CSM_LACRE_PATTERN)?.[1] ?? null
}

function extractComunicadoToiRef(text: string): string | null {
  return text.match(CSM_TOI_REF_PATTERN)?.[1] ?? null
}

function extractSelagemSection(text: string): string | null {
  const startMatch = text.match(DADOS_MEDICAO_END)
  if (startMatch?.index === undefined) return null
  const from = startMatch.index + startMatch[0].length
  const endMatch = text.slice(from).match(/7\s*\.|observa[cç]/i)
  const to = endMatch?.index !== undefined ? from + endMatch.index : from + 1200
  return text.slice(from, to)
}

function normalizeCoverSealValue(value: string | null | undefined): string | null {
  const trimmed = value
    ?.replace(/\s+/g, ' ')
    .replace(/[|:;]+$/g, '')
    .trim()
  if (!trimmed) return null
  if (/^(tampa|lacre|observa)/i.test(trimmed)) return null
  return trimmed.slice(0, 120)
}

function extractDescriptiveCoverSeal(text: string): string | null {
  const pattern =
    /\btampa\s+do\s+medidor\s*[:\-–]?\s*(.+?)(?=\s*(?:tampa\s+d[oa]\s+|7\s*\.|observa[cç]|n[uú]mero\s+do|$))/gi
  let last: string | null = null
  for (const match of text.matchAll(pattern)) {
    const value = normalizeCoverSealValue(match[1])
    if (value) last = value
  }
  if (last) return last

  const fallback = text.match(/\btampa\s+do\s+medidor\s*[:\-–]?\s*(\S.{0,100}?)(?:\s{2,}|\n|$)/i)
  return normalizeCoverSealValue(fallback?.[1] ?? null)
}

function extractNumericCoverSeal(text: string): string | null {
  const section = extractSelagemSection(text) ?? text
  const meterCover = section.match(
    /tampa\s+do\s+medidor[\s\S]{0,120}?(\d{4,12})/i,
  )?.[1]
  if (meterCover) return meterCover

  const labeled = section.match(
    /lacre(?:\(s\))?\s*(?:da\s+)?tampa\s+do\s+medidor[\s\S]{0,100}?(\d{4,12})/i,
  )?.[1]
  return labeled ?? null
}

function extractCoverSeal(text: string): string | null {
  return extractDescriptiveCoverSeal(text) ?? extractNumericCoverSeal(text)
}

const ENCONTRADO_READING_TAG = /leitura\s+encontrado\s*:\s*(\d{3,8})/gi

function stripNonReadingFields(text: string): string {
  return text
    .replace(/constante\s*[:\-]?\s*\d{1,6}/gi, ' ')
    .replace(/tens[aã]o\s*[:\-]?\s*\d{1,6}/gi, ' ')
}

function sliceAfterLabelUntil(text: string, start: RegExp, end: RegExp, fallback = 500): string | null {
  const startMatch = text.match(start)
  if (!startMatch || startMatch.index === undefined) return null
  const from = startMatch.index + startMatch[0].length
  const rest = text.slice(from)
  const endMatch = rest.match(end)
  const to = endMatch?.index !== undefined ? endMatch.index : fallback
  return rest.slice(0, to)
}

function addReadingMatches(text: string, add: (value: string | null | undefined) => void) {
  for (const match of text.matchAll(new RegExp(READING_LABELED_VALUE_PATTERN.source, 'gi'))) {
    add(match[1])
  }
  for (const match of text.matchAll(new RegExp(READING_LABELED_GAP_PATTERN.source, 'gi'))) {
    add(match[1])
  }
}

function collectReadingCandidates(text: string): string[] {
  const values: string[] = []
  const add = (value: string | null | undefined) => {
    const digits = String(value ?? '').replace(/\D/g, '')
    if (digits.length < 3 || digits.length > 8) return
    values.push(digits)
  }

  for (const match of text.matchAll(new RegExp(ENCONTRADO_READING_TAG.source, 'gi'))) {
    add(match[1])
  }
  if (values.length) return values

  const encontradoWindow = sliceAfterLabelUntil(
    text,
    MEDIDOR_ENCONTRADO_LABEL_PATTERN,
    MEDIDOR_INSTALADO_MARKER,
  )
  if (encontradoWindow != null) {
    addReadingMatches(stripNonReadingFields(encontradoWindow), add)
    return values
  }

  const startMatch = text.match(DADOS_MEDICAO_START)
  if (startMatch?.index !== undefined) {
    const from = startMatch.index + startMatch[0].length
    const endMatch = text.slice(from).match(DADOS_MEDICAO_END)
    const to = endMatch?.index !== undefined ? from + endMatch.index : from + 1200
    add(extractAfterLabel(text.slice(from, to), READING_LABEL_PATTERN, null, READING_VALUE_PATTERN))
  }

  const comunicadoStart = text.search(CSM_COMUNICADO_START)
  const search = comunicadoStart >= 0 ? text.slice(comunicadoStart, comunicadoStart + 3000) : text
  const retirado = search.match(/medidor\s+retirado[\s\S]{0,700}/i)?.[0]
  if (retirado) {
    const untilInstalado = sliceAfterLabelUntil(
      retirado,
      MEDIDOR_RETIRADO_MARKER,
      MEDIDOR_INSTALADO_MARKER,
      700,
    )
    addReadingMatches(stripNonReadingFields(untilInstalado ?? retirado), add)
    if (untilInstalado != null) return values
  }

  addReadingMatches(text, add)
  return values
}

function pickReading(candidates: string[], excluded: Set<string>): string | null {
  const unique: string[] = []
  for (const value of candidates) {
    const key = digitKey(value)
    if (!key || excluded.has(key) || unique.includes(value)) continue
    unique.push(value)
  }
  if (!unique.length) return null

  const nonZero = unique.filter((value) => !/^0+$/.test(value))
  const typical = nonZero.filter((value) => {
    if (value.length < 3 || value.length > 6) return false
    if (/^(19|20)\d{2}$/.test(value) && nonZero.some((other) => other !== value)) return false
    return true
  })
  return typical[0] ?? nonZero[0] ?? unique[0] ?? null
}

function extractReading(text: string, excluded: Set<string> = new Set()): string | null {
  return pickReading(collectReadingCandidates(text), excluded)
}

function formatExtractedScheduleDate(
  day: number,
  month: number,
  year: number,
  hour: number,
  minute: number,
): string | null {
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null
  }
  const date = new Date(year, month - 1, day, hour, minute)
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null
  }
  return formatAvailableSlot(date)
}

export function parseExtractedScheduleLabel(value: string | null | undefined): Date | null {
  const match = String(value ?? '').match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/,
  )
  if (!match || match[4] == null || match[5] == null) return null
  const date = new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1]),
    Number(match[4]),
    Number(match[5]),
    0,
    0,
  )
  if (Number.isNaN(date.getTime())) return null
  return date
}

function scheduleDateFromMatch(match: RegExpMatchArray | null): string | null {
  if (!match) return null
  return formatExtractedScheduleDate(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  )
}

function extractScheduledAt(text: string): string | null {
  const comunicadoStart = text.search(CSM_COMUNICADO_START)
  const searchText = comunicadoStart >= 0 ? text.slice(comunicadoStart) : text

  const labeled = scheduleDateFromMatch(
    searchText.match(
      /no\s+dia\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/i,
    ),
  )
  if (labeled) return labeled

  return scheduleDateFromMatch(
    searchText.match(
      /laborat[oóô]rio[\s\S]{0,500}?(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/i,
    ),
  )
}

function extractToiNumber(text: string): string | null {
  return (
    extractAfterLabel(normalizedSlice(text), TOI_LABEL_PATTERN, DADOS_MEDICAO_START, TOI_VALUE_PATTERN) ??
    extractAfterLabel(
      normalizedSlice(text),
      ORDEM_INSPECAO_LABEL_PATTERN,
      null,
      ORDEM_INSPECAO_VALUE_PATTERN,
    ) ??
    extractAfterLabel(normalizedSlice(text), ORDEM_INSPECAO_LABEL_PATTERN, null, TOI_VALUE_PATTERN)
  )
}

function normalizedSlice(text: string): string {
  return text.replace(/\s+/g, ' ')
}

export function parseInspectionText(text: string): InspectionDocumentParseResult {
  const normalized = normalizedSlice(text)
  const toi = extractToiNumber(normalized) ?? extractComunicadoToiRef(normalized)
  const toiNumbers = listKnownToiNumbers(normalized)
  const meterFromToi = extractMeterEncontrado(normalized, toiNumbers)
  const meterFromCsm = extractComunicadoMeterRetirado(normalized, toiNumbers)
  const meterEncontrado = pickMeterNumber(meterFromToi, meterFromCsm, toiNumbers)
  const meterRetirado = pickMeterNumber(meterFromCsm, meterFromToi, toiNumbers)

  const lacre =
    extractAfterLabel(normalized, LACRE_LABEL_PATTERN, null, LACRE_VALUE_PATTERN) ??
    extractComunicadoLacre(normalized)

  const excludedReadings = new Set<string>()
  for (const value of [meterEncontrado, meterRetirado, lacre, toi, ...toiNumbers]) {
    const key = digitKey(value)
    if (key) excludedReadings.add(key)
  }

  return {
    meterEncontrado,
    meterRetirado,
    lacre,
    coverSeal: extractCoverSeal(normalized),
    reading: extractReading(normalized, excludedReadings),
    installation: extractAfterLabel(
      normalized,
      INSTALLATION_LABEL_PATTERN,
      DADOS_MEDICAO_START,
      INSTALLATION_VALUE_PATTERN,
    ),
    toi,
    note: extractAfterLabel(normalized, NOTA_LABEL_PATTERN, DADOS_MEDICAO_START, NOTA_VALUE_PATTERN),
    scheduledAt: extractScheduledAt(normalized),
  }
}

function stringifyPdfFieldValue(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) {
    return value.map(stringifyPdfFieldValue).filter(Boolean).join(' ')
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim()
  }
  return ''
}

async function extractPdfFormFieldText(pdf: {
  numPages: number
  getPage: (pageNumber: number) => Promise<{
    getAnnotations: () => Promise<Array<{ fieldName?: string; fieldValue?: unknown }>>
  }>
  getFieldObjects?: () => Promise<Record<string, Array<{ value?: unknown }>> | null>
}): Promise<string> {
  const lines: string[] = []
  const seen = new Set<string>()
  const add = (name: string, value: string) => {
    const trimmedName = name.trim()
    const trimmedValue = value.trim()
    if (!trimmedName || !trimmedValue) return
    const key = `${trimmedName}:${trimmedValue}`.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    lines.push(`${trimmedName}: ${trimmedValue}`)
    if (READING_LABEL_PATTERN.test(trimmedName) && /^\d{3,8}$/.test(trimmedValue.replace(/\D/g, ''))) {
      lines.push(`Leitura: ${trimmedValue.replace(/\D/g, '')}`)
    }
    const compactFieldName = trimmedName.replace(/[\s_-]/g, '')
    if (/tampa.*medidor/i.test(compactFieldName) && !/caixa/i.test(compactFieldName)) {
      lines.push(`Tampa do Medidor: ${trimmedValue}`)
    }
  }

  try {
    const fields = (await pdf.getFieldObjects?.()) ?? null
    if (fields) {
      for (const [name, items] of Object.entries(fields)) {
        if (!Array.isArray(items)) continue
        for (const item of items) {
          const value = stringifyPdfFieldValue(item?.value)
          if (value) add(name, value)
        }
      }
    }
  } catch (error) {
    console.warn('Falha ao ler campos de formulário do PDF de inspeção:', error)
  }

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const annotations = await page.getAnnotations()
    for (const annotation of annotations) {
      const name = typeof annotation.fieldName === 'string' ? annotation.fieldName : ''
      const value = stringifyPdfFieldValue(annotation.fieldValue)
      if (name && value) add(name, value)
    }
  }

  return lines.join('\n')
}

async function extractInspectionPdfTextLayer(buffer: Buffer): Promise<{ body: string; form: string }> {
  const pdf = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise

  const parts: string[] = []
  const spatialReadings: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => {
        const textItem = item as TextItem
        const chunk = textItem.str ?? ''
        return textItem.hasEOL ? `${chunk}\n` : chunk
      })
      .join(' ')
    parts.push(pageText)
    for (const reading of readingsFromPositionedItems(positionedItemsFromContent(content))) {
      spatialReadings.push(`Leitura encontrado: ${reading}`)
      spatialReadings.push(`Leitura: ${reading}`)
    }
  }

  return {
    body: normalizeInspectionText([...parts, ...spatialReadings].join('\n')),
    form: await extractPdfFormFieldText(pdf),
  }
}

export async function extractInspectionPdfText(buffer: Buffer): Promise<string> {
  const { body, form } = await extractInspectionPdfTextLayer(buffer)
  let main = body
  if (isUnreadablePdfText(body)) {
    console.info('PDF de inspeção com camada de texto ilegível; tentando OCR.')
    try {
      const { extractInspectionPdfTextViaOcr } = await import('./inspection-pdf-ocr.js')
      const ocrText = await extractInspectionPdfTextViaOcr(buffer)
      const normalizedOcr = normalizeInspectionText(ocrText)
      if (normalizedOcr && !isUnreadablePdfText(normalizedOcr)) {
        main = normalizedOcr
      } else if (normalizedOcr) {
        console.warn('OCR produziu texto ainda ilegível.', { length: normalizedOcr.length })
        main = normalizedOcr
      } else {
        console.warn('OCR não retornou texto.')
      }
    } catch (error) {
      console.error('Falha no OCR do PDF de inspeção:', error)
    }
  }

  return normalizeInspectionText([main, form].filter(Boolean).join('\n'))
}

