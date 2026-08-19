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

const INSTALLATION_LABEL_PATTERN = /instala[cç][aã]o(?:\s+n[oº.]?\s*)?\s*:?\s*/i
const INSTALLATION_VALUE_PATTERN = /\b\d{8,9}\b/

const TOI_LABEL_PATTERN = /(?:n[uú]mero\s+(?:do\s+)?toi|toi\s*n[oº.]?\s*)\s*:?\s*/i
const TOI_VALUE_PATTERN = /\b\d{6,10}\b/

const NOTA_LABEL_PATTERN = /nota(?:\s+fiscal)?\s*:?\s*/i
const NOTA_VALUE_PATTERN = /\b\d{8,12}\b/

const TOI_MARKER = /termo\s+de\s+ocorr[eê]ncia\s+e\s+inspe[cç][aã]o/i
const COMUNICADO_MARKER = /comunicado\s+de\s+substitui[cç][aã]o\s+de\s+medidor/i
const TOI_PARTIAL_MARKER = /termo\s+de\s+ocorr[eê]ncia/i
const INSPECAO_MARKER = /inspe[cç][aã]o/i
const MEDIDOR_ENCONTRADO_MARKER = /medidor\s+encontrado/i
const SUBSTITUICAO_MEDIDOR_MARKER = /substitui[cç][aã]o\s+de\s+medidor/i
const COMUNICADO_GENERIC_MARKER = /comunicado/i

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
  if (TOI_PARTIAL_MARKER.test(text) && INSPECAO_MARKER.test(text)) return true

  if (DADOS_MEDICAO_START.test(text) && DADOS_MEDICAO_END.test(text)) return true
  if (MEDIDOR_ENCONTRADO_MARKER.test(text) && /selagem/i.test(text)) return true
  if (TOI_LABEL_PATTERN.test(text) && DADOS_MEDICAO_START.test(text)) return true

  if (compact.includes('termodeocorrencia') && compact.includes('inspecao')) return true
  if (compact.includes('dadosdamedicao') && compact.includes('selagem')) return true
  if (compact.includes('medidorencontrado') && compact.includes('selagem')) return true
  if (compact.includes('numerodotoi') || compact.includes('numerotoi')) return true

  const parsed = parseInspectionText(text)
  return Boolean(parsed.meterEncontrado || parsed.toi || parsed.lacre)
}

function hasComunicadoStructure(text: string, compact: string): boolean {
  if (COMUNICADO_MARKER.test(text)) return true
  if (
    COMUNICADO_GENERIC_MARKER.test(text) &&
    SUBSTITUICAO_MEDIDOR_MARKER.test(text)
  ) {
    return true
  }
  if (SUBSTITUICAO_MEDIDOR_MARKER.test(text)) return true

  if (compact.includes('comunicadodesubstituicaodemedidor')) return true
  if (compact.includes('substituicaodemedidor') && compact.includes('comunicado')) {
    return true
  }
  if (compact.includes('substituicaodemedidor') && compact.includes('medidor')) {
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
    installation: extractAfterLabel(
      normalized,
      INSTALLATION_LABEL_PATTERN,
      DADOS_MEDICAO_START,
      INSTALLATION_VALUE_PATTERN,
    ),
    toi: extractAfterLabel(normalized, TOI_LABEL_PATTERN, DADOS_MEDICAO_START, TOI_VALUE_PATTERN),
    note: extractAfterLabel(normalized, NOTA_LABEL_PATTERN, DADOS_MEDICAO_START, NOTA_VALUE_PATTERN),
  }
}

export async function extractInspectionPdfText(buffer: Buffer): Promise<string> {
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

