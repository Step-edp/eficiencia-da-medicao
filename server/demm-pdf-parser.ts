import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const PATRIMONIO_LABEL_PATTERN = /patrim[oôóò]n[ií1]o[\s.:]+/gi
const PATRIMONIO_METER_PATTERN = /\b00(\d{8})\b/g
const SPACED_PATRIMONIO_METER_PATTERN = /\b00(?:[\s.]*\d){8}\b/g
const DOCUMENT_NUMBER_PATTERN = /n[uú]mero\s+documento\s*:?\s*(\d+)/i
const EMISSION_DATE_PATTERN = /data\s+de\s+emiss[aã]o\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/i
const DEMM_OCR_SCALE = 2
const DEMM_OCR_MAX_PAGES = 8

type TextItem = {
  str?: string
}

export type DemmPdfMetadata = {
  documentNumber: string | null
  emissionDate: string | null
}

export type DemmPdfParseResult = DemmPdfMetadata & {
  meters: string[]
}

function addPatrimonioMeters(text: string, found: Set<string>, ordered: string[]) {
  for (const match of text.matchAll(PATRIMONIO_METER_PATTERN)) {
    const meter = match[1]
    if (found.has(meter)) continue
    found.add(meter)
    ordered.push(meter)
  }
}

export function extractDemmMetadataFromText(text: string): DemmPdfMetadata {
  const normalized = text.replace(/\s+/g, ' ')
  const documentMatch = normalized.match(DOCUMENT_NUMBER_PATTERN)
  const emissionMatch = normalized.match(EMISSION_DATE_PATTERN)

  return {
    documentNumber: documentMatch?.[1] ?? null,
    emissionDate: emissionMatch?.[1]?.replace(/\//g, '.') ?? null,
  }
}

function collapseSpacedPatrimonioNumbers(text: string): string {
  return text.replace(SPACED_PATRIMONIO_METER_PATTERN, (match) => match.replace(/\D/g, ''))
}

export function extractMetersFromText(text: string): string[] {
  const found = new Set<string>()
  const ordered: string[] = []
  const normalized = collapseSpacedPatrimonioNumbers(text.replace(/\r\n/g, '\n'))

  const sections = normalized.split(PATRIMONIO_LABEL_PATTERN)
  for (let index = 1; index < sections.length; index += 1) {
    addPatrimonioMeters(sections[index] ?? '', found, ordered)
  }

  if (ordered.length > 0) {
    return ordered
  }

  addPatrimonioMeters(normalized, found, ordered)
  return ordered
}

export function parseDemmText(text: string): DemmPdfParseResult {
  return {
    ...extractDemmMetadataFromText(text),
    meters: extractMetersFromText(text),
  }
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdf = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise

  const parts: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => (item as TextItem).str ?? '')
      .join(' ')
    parts.push(pageText)
  }

  return parts.join('\n')
}

export async function extractMetersFromPdf(buffer: Buffer): Promise<string[]> {
  const parsed = await parseDemmPdf(buffer)
  return parsed.meters
}

export async function parseDemmPdf(buffer: Buffer): Promise<DemmPdfParseResult> {
  const text = await extractTextFromPdf(buffer)
  const parsed = parseDemmText(text)
  if (parsed.meters.length > 0) return parsed

  try {
    const { extractInspectionPdfTextViaOcr } = await import('./inspection-pdf-ocr.js')
    console.info('DEMM sem medidores na camada de texto; tentando OCR.')
    const ocrText = await extractInspectionPdfTextViaOcr(buffer, {
      scale: DEMM_OCR_SCALE,
      maxPages: DEMM_OCR_MAX_PAGES,
    })
    const ocrParsed = parseDemmText(ocrText)
    return {
      documentNumber: ocrParsed.documentNumber ?? parsed.documentNumber,
      emissionDate: ocrParsed.emissionDate ?? parsed.emissionDate,
      meters: ocrParsed.meters,
    }
  } catch (error) {
    console.error('Falha no OCR do PDF da DEMM:', error)
    return parsed
  }
}
