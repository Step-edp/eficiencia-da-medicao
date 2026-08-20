import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { extractInspectionPdfTextViaOcr, isUnreadablePdfText } from './inspection-pdf-ocr.js'

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

const INSTALLATION_LABEL_PATTERN = /instala[cç][aã]o(?:\s+n[oº.]?\s*)?\s*:?\s*/i
const INSTALLATION_VALUE_PATTERN = /\b\d{8,9}\b/

const TOI_LABEL_PATTERN = /(?:n[uú]mero\s+(?:do\s+)?toi|toi\s*n[oº.]?\s*)\s*:?\s*/i
const TOI_VALUE_PATTERN = /\b\d{6,12}\b/
const ORDEM_INSPECAO_VALUE_PATTERN = /\b\d{10,14}\b/

const ORDEM_INSPECAO_LABEL_PATTERN = /ordem\s+de\s+inspe[cçãa\u00e7\u00e3]\s*n[º°o\u00ba.]?\s*:?\s*/i
const MEDIDOR_ENCONTRADO_OCR_PATTERN = /medidor\s+encontrado[\s\S]{0,450}?(\d{7,9})/i
const NOTA_LABEL_PATTERN = /nota(?:\s+fiscal)?\s*:?\s*/i
const NOTA_VALUE_PATTERN = /\b\d{8,12}\b/

const TOI_MARKER = /termo\s+de\s+ocorr[eêê]ncia\s+e\s+inspe/i
const COMUNICADO_MARKER = /comunicado\s+de\s+substitui[cçãa\u00e7\u00e3]{0,4}[oõ\u00f5]\s+de\s+medidor/i
const TOI_PARTIAL_MARKER = /termo\s+de\s+ocorr[eêê]/i
const INSPECAO_MARKER = /inspe[cçãa\u00e7\u00e3]/i
const MEDIDOR_ENCONTRADO_MARKER = /medidor\s+encontrado/i
const SUBSTITUICAO_MEDIDOR_MARKER = /substitui[cç][aã]o\s+de\s+medidor/i
const COMUNICADO_GENERIC_MARKER = /comunicado/i
const MEDIDOR_RETIRADO_MARKER = /medidor\s+retirado/i
const MEDIDOR_INSTALADO_MARKER = /medidor\s+instalado/i
const ORDEM_INSPECAO_MARKER = /ordem\s+de\s+inspe[cçãa\u00e7\u00e3]/i

const CSM_MEDIDOR_RETIRADO_PATTERN =
  /medidor\s+retirado[\s\S]{0,450}?do\s*medidor\s*:?\s*(\d{7,9})/i
const CSM_LACRE_PATTERN = /lacre(?:\(s\))?\s*n[^0-9]{0,4}\(?s?\)?\s*:?\s*(\d{6,12})/i
const CSM_TOI_REF_PATTERN = /toi\s*n[^0-9]{0,4}(\d{6,12})/i
const CSM_COMUNICADO_START = /comunicado\s+de\s+substitui/i
const CSM_MEDIDOR_NUMBER = /do\s*medidor\s*:?\s*(\d{7,9})/gi

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

function hasToiStructure(text: string, compact: string): boolean {
  if (TOI_MARKER.test(text)) return true
  if (TOI_PARTIAL_MARKER.test(text) && /inspe/i.test(text)) return true

  if (DADOS_MEDICAO_START.test(text) && DADOS_MEDICAO_END.test(text)) return true
  if (MEDIDOR_ENCONTRADO_MARKER.test(text) && /selagem/i.test(text)) return true
  if (TOI_LABEL_PATTERN.test(text) && DADOS_MEDICAO_START.test(text)) return true
  if (ORDEM_INSPECAO_MARKER.test(text) && TOI_VALUE_PATTERN.test(text)) return true

  if (compact.includes('termodeocorrencia') && compact.includes('inspecao')) return true
  if (compact.includes('dadosdamedicao') && compact.includes('selagem')) return true
  if (compact.includes('medidorencontrado') && compact.includes('selagem')) return true
  if (compact.includes('numerodotoi') || compact.includes('numerotoi')) return true

  const parsed = parseInspectionText(text)
  return Boolean(parsed.meterEncontrado || parsed.toi || parsed.lacre)
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
  if (SUBSTITUICAO_MEDIDOR_MARKER.test(text)) return true
  if (MEDIDOR_RETIRADO_MARKER.test(text) && MEDIDOR_INSTALADO_MARKER.test(text)) {
    return true
  }

  if (compact.includes('comunicadodesubstituicaodemedidor')) return true
  if (compact.includes('substituicaodemedidor') && compact.includes('comunicado')) {
    return true
  }
  if (compact.includes('substituicaodemedidor') && compact.includes('medidor')) {
    return true
  }
  if (compact.includes('medidorretirado') && compact.includes('medidorinstalado')) {
    return true
  }

  return false
}

type TextItem = {
  str?: string
}

export type InspectionDocumentParseResult = {
  meterEncontrado: string | null
  lacre: string | null
  installation: string | null
  toi: string | null
  note: string | null
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
  const hasToi = hasToiStructure(normalized, compact)
  const hasComunicado = hasComunicadoStructure(normalized, compact)
  if (hasToi && hasComunicado) return 'ambos'
  if (hasToi) return 'toi'
  if (hasComunicado) return 'comunicado'
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

function extractMeterEncontrado(text: string): string | null {
  const startMatch = text.match(DADOS_MEDICAO_START)
  if (startMatch?.index !== undefined) {
    const from = startMatch.index + startMatch[0].length
    const endMatch = text.slice(from).match(DADOS_MEDICAO_END)
    const to = endMatch?.index !== undefined ? from + endMatch.index : from + 1200
    const section = text.slice(from, to)
    const meterMatch = section.match(METER_NUMBER_PATTERN)
    if (meterMatch?.[0]) return meterMatch[0]
  }

  const ocrMatch = text.match(MEDIDOR_ENCONTRADO_OCR_PATTERN)
  return ocrMatch?.[1] ?? null
}

function extractComunicadoMeterRetirado(text: string): string | null {
  const comunicadoStart = text.search(CSM_COMUNICADO_START)
  if (comunicadoStart >= 0) {
    const section = text.slice(comunicadoStart, comunicadoStart + 3000)
    const medidores = [...section.matchAll(CSM_MEDIDOR_NUMBER)]
    if (medidores[0]?.[1]) return medidores[0][1]
  }

  const labeled = text.match(CSM_MEDIDOR_RETIRADO_PATTERN)
  if (labeled?.[1]) return labeled[1]

  const section = text.match(/medidor\s+retirado[\s\S]{0,400}/i)?.[0]
  if (!section) return null
  return section.match(METER_NUMBER_PATTERN)?.[0] ?? null
}

function extractComunicadoLacre(text: string): string | null {
  return text.match(CSM_LACRE_PATTERN)?.[1] ?? null
}

function extractComunicadoToiRef(text: string): string | null {
  return text.match(CSM_TOI_REF_PATTERN)?.[1] ?? null
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

function isLikelyToiFragment(value: string, text: string): boolean {
  const ordem = text.match(/ordem\s+de\s+inspe[\s\S]{0,20}?(\d{10,14})/i)?.[1]
  if (ordem && (ordem === value || ordem.endsWith(value))) return true
  const toiRef = text.match(CSM_TOI_REF_PATTERN)?.[1]
  return Boolean(toiRef && toiRef === value)
}

function normalizedSlice(text: string): string {
  return text.replace(/\s+/g, ' ')
}

export function parseInspectionText(text: string): InspectionDocumentParseResult {
  const normalized = normalizedSlice(text)
  const compact = compactInspectionText(normalized)
  const comunicadoPresent = hasComunicadoStructure(normalized, compact)

  const meterFromToi = extractMeterEncontrado(normalized)
  const meterFromCsm = extractComunicadoMeterRetirado(normalized)
  let meterEncontrado =
    comunicadoPresent && meterFromCsm ? meterFromCsm : meterFromToi ?? meterFromCsm
  const toi = extractToiNumber(normalized) ?? extractComunicadoToiRef(normalized)
  if (meterEncontrado && isLikelyToiFragment(meterEncontrado, normalized)) {
    meterEncontrado = meterFromCsm
  }

  const lacre =
    extractAfterLabel(normalized, LACRE_LABEL_PATTERN, null, LACRE_VALUE_PATTERN) ??
    extractComunicadoLacre(normalized)

  return {
    meterEncontrado,
    lacre,
    installation: extractAfterLabel(
      normalized,
      INSTALLATION_LABEL_PATTERN,
      DADOS_MEDICAO_START,
      INSTALLATION_VALUE_PATTERN,
    ),
    toi,
    note: extractAfterLabel(normalized, NOTA_LABEL_PATTERN, DADOS_MEDICAO_START, NOTA_VALUE_PATTERN),
  }
}

async function extractInspectionPdfTextLayer(buffer: Buffer): Promise<string> {
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
      .map((item) => {
        const textItem = item as TextItem & { hasEOL?: boolean }
        const chunk = textItem.str ?? ''
        return textItem.hasEOL ? `${chunk}\n` : chunk
      })
      .join(' ')
    parts.push(pageText)
  }

  return normalizeInspectionText(parts.join('\n'))
}

export async function extractInspectionPdfText(buffer: Buffer): Promise<string> {
  const layerText = await extractInspectionPdfTextLayer(buffer)
  if (!isUnreadablePdfText(layerText)) {
    return layerText
  }

  console.info('PDF de inspeção com camada de texto ilegível; tentando OCR.')
  try {
    const ocrText = await extractInspectionPdfTextViaOcr(buffer)
    const normalizedOcr = normalizeInspectionText(ocrText)
    if (normalizedOcr && !isUnreadablePdfText(normalizedOcr)) {
      return normalizedOcr
    }
    if (normalizedOcr) {
      console.warn('OCR produziu texto ainda ilegível.', { length: normalizedOcr.length })
    } else {
      console.warn('OCR não retornou texto.')
    }
  } catch (error) {
    console.error('Falha no OCR do PDF de inspeção:', error)
  }

  return ''
}

