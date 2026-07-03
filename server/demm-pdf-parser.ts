import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const METER_LENGTH = 8
const METER_PATTERN = new RegExp(`\\b(\\d{${METER_LENGTH}})\\b`, 'g')
const LABELED_METER_PATTERN = /medidor\s*[:\-]?\s*(\d{8})/gi

type TextItem = {
  str?: string
}

export function extractMetersFromText(text: string): string[] {
  const found = new Set<string>()
  const ordered: string[] = []

  const addMeter = (value: string) => {
    if (!/^\d{8}$/.test(value) || found.has(value)) return
    found.add(value)
    ordered.push(value)
  }

  for (const match of text.matchAll(LABELED_METER_PATTERN)) {
    addMeter(match[1])
  }

  for (const match of text.matchAll(METER_PATTERN)) {
    addMeter(match[1])
  }

  return ordered
}

export async function extractMetersFromPdf(buffer: Buffer): Promise<string[]> {
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

  return extractMetersFromText(parts.join('\n'))
}
