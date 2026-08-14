import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

// "5.Dados da Medição" até "6. Selagem": única faixa do TOI onde aparecem os números do
// medidor encontrado/instalado. O texto de um PDF de tabela pode sair fora da ordem visual
// (célula a célula ou linha a linha), então em vez de procurar o número logo após o rótulo
// "Medidor Encontrado", pegamos o primeiro número de 7-9 dígitos dessa faixa — o campo
// "Encontrado" sempre é preenchido antes do "Instalado" no formulário, então seu valor
// aparece primeiro no fluxo de texto em qualquer uma das ordens possíveis de extração.
const DADOS_MEDICAO_START = /5\s*\.?\s*dados\s+da\s+medi[cç][aã]o/i
const DADOS_MEDICAO_END = /6\s*\.?\s*selagem/i
const METER_NUMBER_PATTERN = /\b\d{7,9}\b/

const LACRE_LABEL_PATTERN = /n[uú]mero\s+do\(s\)\s+lacre\(s\)\s*:?/i
const LACRE_VALUE_PATTERN = /\b[0-9A-Za-z-]{4,}\b/

type TextItem = {
  str?: string
}

export type InspectionDocumentParseResult = {
  meterEncontrado: string | null
  lacre: string | null
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

function extractMeterEncontrado(text: string): string | null {
  const startMatch = text.match(DADOS_MEDICAO_START)
  if (!startMatch || startMatch.index === undefined) return null

  const from = startMatch.index + startMatch[0].length
  const endMatch = text.slice(from).match(DADOS_MEDICAO_END)
  const to = endMatch?.index !== undefined ? from + endMatch.index : from + 1200

  const section = text.slice(from, to)
  const meterMatch = section.match(METER_NUMBER_PATTERN)
  return meterMatch?.[0] ?? null
}

export function parseInspectionText(text: string): InspectionDocumentParseResult {
  const normalized = text.replace(/\s+/g, ' ')

  return {
    meterEncontrado: extractMeterEncontrado(normalized),
    lacre: extractAfterLabel(normalized, LACRE_LABEL_PATTERN, null, LACRE_VALUE_PATTERN),
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
    const pageText = content.items.map((item) => (item as TextItem).str ?? '').join(' ')
    parts.push(pageText)
  }

  return parts.join('\n')
}

export async function parseInspectionPdf(buffer: Buffer): Promise<InspectionDocumentParseResult> {
  const text = await extractTextFromPdf(buffer)
  return parseInspectionText(text)
}
