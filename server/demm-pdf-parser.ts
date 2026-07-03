import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const PATRIMONIO_LABEL_PATTERN = /patrim[oô]nio[\s.:]+/gi
const PATRIMONIO_METER_PATTERN = /\b00(\d{8})\b/g
const DOCUMENT_NUMBER_PATTERN = /n[uú]mero\s+documento\s*:?\s*(\d+)/i
const EMISSION_DATE_PATTERN = /data\s+de\s+emiss[aã]o\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/i

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

export function extractMetersFromText(text: string): string[] {
  const found = new Set<string>()
  const ordered: string[] = []
  const normalized = text.replace(/\r\n/g, '\n')

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
  const text = await extractTextFromPdf(buffer)
  return extractMetersFromText(text)
}

export async function parseDemmPdf(buffer: Buffer): Promise<DemmPdfParseResult> {
  const text = await extractTextFromPdf(buffer)
  return parseDemmText(text)
}
