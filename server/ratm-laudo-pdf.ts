import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import type { Response } from 'express'
import { Resvg } from '@resvg/resvg-js'
import { query } from './db.js'

type PdfDocument = InstanceType<typeof PDFDocument>

type RatmLaudoPdfInput = {
  id: string
  ratmNumber: number
  meter: string
  client: string
  createdAt: string
  status: string
  formData: Record<string, unknown>
  createdByName?: string
  createdByRegistration?: string
  installation?: string
  toi?: string
  note?: string
  meterReading?: string
  revokedAt?: string | null
}

const IRREGULARITY_CODES: Record<string, string> = {
  '23': 'MANCAL FORA DE POSIÇÃO',
}

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 36,
  footer: 48,
}

const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2
const CONTENT_BOTTOM = PAGE.height - PAGE.margin - PAGE.footer

const COLORS = {
  navy: '#0B3A66',
  navyDark: '#072A4A',
  titleBlue: '#0E4A7A',
  cyan: '#18A8C8',
  green: '#1FA971',
  greenSoft: '#E7F7EF',
  red: '#C62828',
  redSoft: '#FDECEC',
  grayBorder: '#D7DEE7',
  graySoft: '#F4F7FA',
  grayBox: '#EEF2F6',
  text: '#1F2A37',
  textMuted: '#5B6B7C',
  textLight: '#8A97A8',
  white: '#FFFFFF',
  footerBar: '#0A2540',
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return '—'
  const normalized = String(value).trim()
  return normalized || '—'
}

function formatDate(isoDate: string) {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR')
}

export function ratmCalendarYear(createdAt: string) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
  }).format(date)
}

export function formatRatmLaudoNumber(ratmNumber: number, createdAt: string) {
  const year = ratmCalendarYear(createdAt)
  const seq = String(ratmNumber).padStart(4, '0')
  return year ? `${seq}_${year}` : seq
}

export function buildRatmPdfFileName(laudo: {
  ratmNumber: number
  meter: string
  createdAt: string
  note?: string
  formData?: Record<string, unknown>
}) {
  const year = ratmCalendarYear(laudo.createdAt) || '0000'
  const id = String(laudo.ratmNumber)
  const meter = String(laudo.meter ?? '').replace(/\D/g, '') || '0'
  const formNote = typeof laudo.formData?.note === 'string' ? laudo.formData.note.trim() : ''
  const noteSource = formNote || String(laudo.note ?? '').trim()
  const note = (noteSource.replace(/\D/g, '') || '0').padStart(12, '0')
  return `RATM_${id}_${meter}_${year}_${note}.pdf`
}

function buildLaudoNumber(laudo: RatmLaudoPdfInput) {
  return formatRatmLaudoNumber(laudo.ratmNumber, laudo.createdAt)
}

function parsePercent(value: unknown): number | null {
  if (value == null) return null
  const raw = String(value).trim().replace('%', '').replace(',', '.')
  if (!raw) return null
  const num = Number(raw)
  return Number.isFinite(num) ? num : null
}

function formatPercent(value: number | null) {
  if (value == null) return '—'
  const formatted = value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${value > 0 ? '+' : ''}${formatted}%`
}

function ensureSpace(doc: PdfDocument, height: number) {
  if (doc.y + height > CONTENT_BOTTOM) {
    doc.addPage()
    doc.y = PAGE.margin
  }
}

const SITE_LOGO_FILE = 'EDP_2022.svg'
const SITE_LOGO_HEIGHT = 36

function resolveSiteLogoPath() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(process.cwd(), 'public', 'logo', SITE_LOGO_FILE),
    path.join(process.cwd(), 'dist', 'logo', SITE_LOGO_FILE),
    path.join(here, '../public/logo', SITE_LOGO_FILE),
    path.join(here, '../../public/logo', SITE_LOGO_FILE),
    path.join(here, '../../dist/logo', SITE_LOGO_FILE),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

let cachedLogoPng: Buffer | null | undefined

function loadSiteLogoPng() {
  if (cachedLogoPng !== undefined) return cachedLogoPng
  const logoPath = resolveSiteLogoPath()
  if (!logoPath) {
    cachedLogoPng = null
    return null
  }
  try {
    const svg = readFileSync(logoPath)
    const png = new Resvg(svg, {
      fitTo: { mode: 'width', value: 640 },
      background: 'rgba(0,0,0,0)',
    })
      .render()
      .asPng()
    cachedLogoPng = Buffer.from(png)
  } catch (error) {
    console.error('Não foi possível renderizar a logo do laudo.', error)
    cachedLogoPng = null
  }
  return cachedLogoPng
}

function drawFallbackEdpMark(doc: PdfDocument, x: number, y: number) {
  doc.save()
  doc.translate(x + 10, y + 14)
  doc.rotate(-18)
  doc.lineCap('round')
  doc.lineWidth(3.2).strokeColor('#2F6BFF').moveTo(0, -7).bezierCurveTo(9, -12, 16, -5, 12, 4).stroke()
  doc.lineWidth(2.8).strokeColor('#39FF00').moveTo(2, -3).bezierCurveTo(7, -8, 13, -2, 10, 5).stroke()
  doc.lineWidth(2.2).strokeColor('#18D8F0').moveTo(4, 1).bezierCurveTo(8, -3, 11, 1, 9, 6).stroke()
  doc.restore()
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.navyDark).text('edp', x + 26, y + 2, {
    lineBreak: false,
  })
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMuted).text('SP', x + 56, y + 8, {
    lineBreak: false,
  })
  return 70
}

function drawEdpMark(doc: PdfDocument, x: number, y: number) {
  const logo = loadSiteLogoPng()
  if (!logo) return drawFallbackEdpMark(doc, x, y)

  const pngWidth = logo.readUInt32BE(16)
  const pngHeight = logo.readUInt32BE(20)
  const width = pngHeight > 0 ? Math.round(SITE_LOGO_HEIGHT * (pngWidth / pngHeight)) : 80
  doc.image(logo, x, y, { width, height: SITE_LOGO_HEIGHT })
  return width
}

function drawRevokedWatermark(doc: PdfDocument) {
  doc.save()
  doc.fillColor(COLORS.red)
  doc.opacity(0.18)
  doc.rotate(-32, { origin: [PAGE.width / 2, PAGE.height / 2] })
  doc.font('Helvetica-Bold').fontSize(64).text('REVOGADO', 0, PAGE.height / 2 - 24, {
    width: PAGE.width,
    align: 'center',
    lineBreak: false,
  })
  doc.restore()
}

function drawSectionTitle(doc: PdfDocument, index: number, title: string) {
  ensureSpace(doc, 28)
  const y = doc.y
  doc.circle(PAGE.margin + 7, y + 7, 8).fill(COLORS.navy)
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(COLORS.white)
    .text(String(index), PAGE.margin + 1, y + 3, { width: 12, align: 'center', lineBreak: false })
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(COLORS.titleBlue)
    .text(title, PAGE.margin + 22, y + 1, { lineBreak: false })
  doc.y = y + 20
}

function drawFieldPair(
  doc: PdfDocument,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
) {
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.textMuted).text(label, x, y, {
    width,
    lineBreak: false,
  })
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.text)
    .text(value, x, y + 13, { width, lineBreak: false })
}

function drawYesNoBadge(doc: PdfDocument, x: number, y: number, value: string) {
  const normalized = value.trim().toLocaleLowerCase('pt-BR')
  const positive = normalized === 'sim'
  const negative = normalized === 'não' || normalized === 'nao'
  if (!positive && !negative) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.text).text(value, x, y + 1, {
      lineBreak: false,
    })
    return
  }

  const fill = positive ? COLORS.greenSoft : COLORS.redSoft
  const ink = positive ? COLORS.green : COLORS.red
  const label = positive ? 'Sim' : 'Não'
  const badgeWidth = positive ? 46 : 48
  const badgeHeight = 15
  doc.roundedRect(x, y, badgeWidth, badgeHeight, 8).fill(fill)

  const iconX = x + 8
  const iconY = y + badgeHeight / 2
  doc.circle(iconX, iconY, 4.2).fill(ink)
  doc.save()
  doc.strokeColor(COLORS.white).lineWidth(1.15).lineCap('round').lineJoin('round')
  if (positive) {
    doc.moveTo(iconX - 2, iconY + 0.2).lineTo(iconX - 0.5, iconY + 1.7).lineTo(iconX + 2.1, iconY - 1.7).stroke()
  } else {
    doc.moveTo(iconX - 1.7, iconY - 1.7).lineTo(iconX + 1.7, iconY + 1.7).stroke()
    doc.moveTo(iconX + 1.7, iconY - 1.7).lineTo(iconX - 1.7, iconY + 1.7).stroke()
  }
  doc.restore()
  doc.font('Helvetica-Bold').fontSize(8).fillColor(ink).text(label, x + 15, y + 3.5, { lineBreak: false })
}

function drawHeader(doc: PdfDocument, laudo: RatmLaudoPdfInput) {
  const logoWidth = drawEdpMark(doc, PAGE.margin, PAGE.margin)
  const brandX = PAGE.margin + logoWidth + 12
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.navy)
    .text('Laboratório de Medição', brandX, PAGE.margin + 8, { lineBreak: false })
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(COLORS.textMuted)
    .text('EDP SP', brandX, PAGE.margin + 22, { lineBreak: false })

  const rightX = PAGE.width - PAGE.margin - 170
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(COLORS.textMuted)
    .text('N DO RELATÓRIO', rightX, PAGE.margin + 2, { width: 170, align: 'right', lineBreak: false })
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(COLORS.navyDark)
    .text(buildLaudoNumber(laudo), rightX, PAGE.margin + 12, {
      width: 170,
      align: 'right',
      lineBreak: false,
    })
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(COLORS.textMuted)
    .text('DATA DE EMISSÃO', rightX, PAGE.margin + 28, {
      width: 170,
      align: 'right',
      lineBreak: false,
    })
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.text)
    .text(formatDate(laudo.createdAt), rightX, PAGE.margin + 38, {
      width: 170,
      align: 'right',
      lineBreak: false,
    })

  doc
    .moveTo(PAGE.margin, PAGE.margin + 54)
    .lineTo(PAGE.width - PAGE.margin, PAGE.margin + 54)
    .strokeColor(COLORS.grayBorder)
    .lineWidth(1)
    .stroke()

  const title = 'RATM • RELATÓRIO DE AVALIAÇÃO TÉCNICA DE MEDIDOR'
  const titleY = PAGE.margin + 64
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.titleBlue)
  const titleHeight = doc.currentLineHeight()
  doc.text(title, PAGE.margin, titleY, {
    width: CONTENT_WIDTH,
    align: 'center',
    lineBreak: false,
  })

  doc.y = titleY + titleHeight + 10
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = textValue(value)
    if (text !== '—') return text
  }
  return '—'
}

function drawDadosGerais(doc: PdfDocument, laudo: RatmLaudoPdfInput) {
  drawSectionTitle(doc, 1, 'DADOS DA INSTALAÇÃO')
  const form = laudo.formData
  const rowStart = 14
  const rowStep = 28
  const rows: Array<{ left: [string, string]; right: [string, string] | null }> = [
    {
      left: [
        'Titular da Unidade Consumidora',
        firstText(form.client, laudo.client).toLocaleLowerCase('pt-BR'),
      ],
      right: ['Instalação', firstText(form.installation, laudo.installation)],
    },
    {
      left: ['Medidor', firstText(form.meter, laudo.meter)],
      right: ['TOI', firstText(form.toi, laudo.toi)],
    },
    {
      left: ['Nota', firstText(form.note, laudo.note)],
      right: null,
    },
  ]
  const boxHeight = rowStart + rows.length * rowStep + 10
  ensureSpace(doc, boxHeight + 16)
  const y = doc.y
  doc
    .roundedRect(PAGE.margin, y, CONTENT_WIDTH, boxHeight, 8)
    .strokeColor(COLORS.grayBorder)
    .lineWidth(1)
    .stroke()

  const colW = (CONTENT_WIDTH - 28) / 2
  const leftX = PAGE.margin + 12
  const rightX = PAGE.margin + 16 + colW

  rows.forEach((row, index) => {
    const rowY = y + rowStart + index * rowStep
    drawFieldPair(doc, leftX, rowY, colW - 8, row.left[0], row.left[1])
    if (row.right) drawFieldPair(doc, rightX, rowY, colW - 8, row.right[0], row.right[1])
  })

  doc.y = y + boxHeight + 14
}

type PadraoEnsaio = {
  patrimonio: string
  serial: string
  modelo: string
  fabricante: string
  classe: string
  certificado: string
  validade: string
}

async function loadPadraoEnsaio(testBench: unknown): Promise<PadraoEnsaio> {
  const patrimonio = textValue(testBench)
  const empty: PadraoEnsaio = {
    patrimonio,
    serial: '—',
    modelo: '—',
    fabricante: '—',
    classe: '—',
    certificado: '—',
    validade: '—',
  }
  const key = patrimonio === '—' ? '' : patrimonio
  if (!key) return empty

  try {
    const stored = await query<{
      equipment_number: string
      numero_serie: string
      modelo: string
      fabricante: string
      classe: string
      identificacao_laudo: string
    }>(
      `SELECT equipment_number, numero_serie, modelo, fabricante, classe, identificacao_laudo
       FROM analisadores_tensao
       WHERE equipment_number = $1 OR numero_serie = $1
       LIMIT 1`,
      [key],
    )
    const row = stored.rows[0]
    if (!row) return empty
    return {
      patrimonio: textValue(row.equipment_number || key),
      serial: textValue(row.numero_serie),
      modelo: textValue(row.modelo),
      fabricante: textValue(row.fabricante),
      classe: textValue(row.classe),
      certificado: textValue(row.identificacao_laudo),
      validade: '—',
    }
  } catch (error) {
    console.error('Não foi possível carregar o padrão de ensaio do laudo.', error)
    return empty
  }
}

function drawInfoIcon(doc: PdfDocument, cx: number, cy: number) {
  doc.circle(cx, cy, 5.5).fill(COLORS.titleBlue)
  doc.circle(cx, cy - 2.1, 0.9).fill(COLORS.white)
  doc.roundedRect(cx - 0.7, cy - 0.3, 1.4, 3.5, 0.5).fill(COLORS.white)
}

function drawPadraoEnsaio(doc: PdfDocument, padrao: PadraoEnsaio) {
  drawSectionTitle(doc, 2, 'DADOS DO PADRÃO DE ENSAIO')
  ensureSpace(doc, 36)
  const introY = doc.y
  const iconCenterY = introY + 6
  drawInfoIcon(doc, PAGE.margin + 6, iconCenterY)
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.text)
  const textY = iconCenterY - 8 * 0.35
  doc.text(
    'Padrão de ensaio: Equipamento de alta precisão usado como referência para verificar se um medidor de energia está medindo corretamente.',
    PAGE.margin + 16,
    textY,
    { width: CONTENT_WIDTH - 16 },
  )
  doc.y = Math.max(doc.y, introY + 28)

  const rowStart = 14
  const rowStep = 28
  const rows = [
    {
      left: ['Patrimônio', padrao.patrimonio],
      right: ['Serial', padrao.serial],
    },
    {
      left: ['Modelo', padrao.modelo],
      right: ['Fabricante', padrao.fabricante],
    },
    {
      left: ['Classe de Exatidão', padrao.classe],
      right: ['Certificado de Calibração', padrao.certificado],
    },
    {
      left: ['Validade do certificado do Padrão de Ensaio', padrao.validade],
      right: null,
    },
  ]
  const boxHeight = rowStart + rows.length * rowStep + 10
  ensureSpace(doc, boxHeight + 16)
  const y = doc.y
  doc
    .roundedRect(PAGE.margin, y, CONTENT_WIDTH, boxHeight, 8)
    .strokeColor(COLORS.grayBorder)
    .lineWidth(1)
    .stroke()

  const colW = (CONTENT_WIDTH - 28) / 2
  const leftX = PAGE.margin + 12
  const rightX = PAGE.margin + 16 + colW

  rows.forEach((row, index) => {
    const rowY = y + rowStart + index * rowStep
    const labelWidth = row.right ? colW - 8 : CONTENT_WIDTH - 24
    drawFieldPair(doc, leftX, rowY, labelWidth, row.left[0], row.left[1])
    if (row.right) drawFieldPair(doc, rightX, rowY, colW - 8, row.right[0], row.right[1])
  })

  doc.y = y + boxHeight + 14
}

function drawLocalEnsaio(doc: PdfDocument) {
  drawSectionTitle(doc, 3, 'LOCAL DE ENSAIO')
  const address =
    'Av. Cassiano Ricardo, 1973 - Jardim Alvorada, São José dos Campos - SP'
  doc.font('Helvetica').fontSize(9)
  const textHeight = doc.heightOfString(address, { width: CONTENT_WIDTH - 24 })
  const boxHeight = textHeight + 20
  ensureSpace(doc, boxHeight + 16)
  const y = doc.y
  doc
    .roundedRect(PAGE.margin, y, CONTENT_WIDTH, boxHeight, 8)
    .strokeColor(COLORS.grayBorder)
    .lineWidth(1)
    .stroke()
  doc.fillColor(COLORS.text).text(address, PAGE.margin + 12, y + 10, { width: CONTENT_WIDTH - 24 })
  doc.y = y + boxHeight + 14
}

type MeterEnergyData = {
  tipo: string
  fabricante: string
  modelo: string
  tensao: string
  corrente: string
  fiosElementos: string
  classe: string
}

async function loadMeterEnergyData(meter: string): Promise<MeterEnergyData> {
  const empty: MeterEnergyData = {
    tipo: '—',
    fabricante: '—',
    modelo: '—',
    tensao: '—',
    corrente: '—',
    fiosElementos: '—',
    classe: '—',
  }
  const key = meter.trim()
  if (!key) return empty

  try {
    const stored = await query<{
      manufacturer: string
      model: string
      meter_type: string | null
      voltage: string | null
      current_rating: string | null
      wires_elements: string | null
      accuracy_class: string | null
    }>(
      `SELECT mr.manufacturer, mr.model,
              mm.meter_type, mm.voltage, mm.current_rating, mm.wires_elements, mm.accuracy_class
       FROM meter_registry mr
       LEFT JOIN meter_models mm
         ON LOWER(BTRIM(mm.name)) = LOWER(BTRIM(mr.model))
        AND LOWER(BTRIM(mm.manufacturer)) = LOWER(BTRIM(mr.manufacturer))
       WHERE LPAD(RIGHT(REGEXP_REPLACE(mr.meter, '[^0-9]', '', 'g'), 8), 8, '0')
           = LPAD(RIGHT(REGEXP_REPLACE($1, '[^0-9]', '', 'g'), 8), 8, '0')
       LIMIT 1`,
      [key],
    )
    const row = stored.rows[0]
    if (!row) return empty
    return {
      tipo: textValue(row.meter_type),
      fabricante: textValue(row.manufacturer),
      modelo: textValue(row.model),
      tensao: textValue(row.voltage),
      corrente: textValue(row.current_rating),
      fiosElementos: textValue(row.wires_elements),
      classe: textValue(row.accuracy_class),
    }
  } catch (error) {
    console.error('Não foi possível carregar os dados do medidor para o laudo.', error)
    return empty
  }
}

function drawDadosMedidor(doc: PdfDocument, laudo: RatmLaudoPdfInput, meterData: MeterEnergyData) {
  drawSectionTitle(doc, 4, 'DADOS DO MEDIDOR DE ENERGIA')
  const form = laudo.formData
  const rowStart = 14
  const rowStep = 28
  const rows: Array<{ left: [string, string]; right: [string, string] | null }> = [
    {
      left: ['Número do Medidor', firstText(form.meter, laudo.meter)],
      right: ['Tipo', meterData.tipo],
    },
    {
      left: ['Fabricante', meterData.fabricante],
      right: ['Modelo', meterData.modelo],
    },
    {
      left: ['Tensão Nominal', meterData.tensao],
      right: ['Corrente Nominal', meterData.corrente],
    },
    {
      left: ['Número de Fios • Elementos', meterData.fiosElementos],
      right: ['Classe de Exatidão', meterData.classe],
    },
    {
      left: ['1º lacre da tampa', firstText(form.seal1)],
      right: ['Status do 1º lacre', firstText(form.seal1Status)],
    },
    {
      left: ['2º lacre da tampa', firstText(form.seal2)],
      right: ['Status do 2º lacre', firstText(form.seal2Status)],
    },
  ]
  const boxHeight = rowStart + rows.length * rowStep + 10
  ensureSpace(doc, boxHeight + 16)
  const y = doc.y
  doc
    .roundedRect(PAGE.margin, y, CONTENT_WIDTH, boxHeight, 8)
    .strokeColor(COLORS.grayBorder)
    .lineWidth(1)
    .stroke()

  const colW = (CONTENT_WIDTH - 28) / 2
  const leftX = PAGE.margin + 12
  const rightX = PAGE.margin + 16 + colW

  rows.forEach((row, index) => {
    const rowY = y + rowStart + index * rowStep
    drawFieldPair(doc, leftX, rowY, colW - 8, row.left[0], row.left[1])
    if (row.right) drawFieldPair(doc, rightX, rowY, colW - 8, row.right[0], row.right[1])
  })

  doc.y = y + boxHeight + 14
}

function drawEnsaios(doc: PdfDocument, form: Record<string, unknown>) {
  drawSectionTitle(doc, 5, 'INSPEÇÃO GERAL')
  const rowStart = 14
  const rowStep = 32
  const rows: Array<{ left: [string, string]; right: [string, string] | null }> = [
    {
      left: ['Medidor quebrado • furado', firstText(form.brokenMeter)],
      right: ['Display apagado • não liga', firstText(form.displayOff)],
    },
    {
      left: ['Facilidade de acesso ao interior do medidor', firstText(form.meterInteriorAccess)],
      right: ['Bobina danificada', firstText(form.damagedCoil)],
    },
    {
      left: ['Aparentemente em ordem', firstText(form.apparentlyInOrder)],
      right: ['Reprovado dielétrico', firstText(form.dielectricFailed)],
    },
    {
      left: ['Corpo estranho no interior do medidor', firstText(form.foreignBodyInMeter)],
      right: null,
    },
  ]
  const boxHeight = rowStart + rows.length * rowStep + 10
  ensureSpace(doc, boxHeight + 16)
  const y = doc.y
  doc
    .roundedRect(PAGE.margin, y, CONTENT_WIDTH, boxHeight, 8)
    .strokeColor(COLORS.grayBorder)
    .lineWidth(1)
    .stroke()

  const colW = (CONTENT_WIDTH - 28) / 2
  const leftX = PAGE.margin + 12
  const rightX = PAGE.margin + 16 + colW

  rows.forEach((row, index) => {
    const rowY = y + rowStart + index * rowStep
    const fields = [row.left, row.right].filter((field): field is [string, string] => field != null)
    fields.forEach((field, fieldIndex) => {
      const fieldX = fieldIndex === 0 ? leftX : rightX
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.textMuted).text(field[0], fieldX, rowY, {
        width: colW - 8,
        lineBreak: false,
      })
      drawYesNoBadge(doc, fieldX, rowY + 12, field[1])
    })
  })

  doc.y = y + boxHeight + 14
}

function formatAccuracy(value: unknown) {
  const text = textValue(value)
  if (text === '—') return '—'
  const numeric = parsePercent(value)
  if (numeric == null) return text
  return formatPercent(numeric)
}

function drawResultadosEnsaio(doc: PdfDocument, form: Record<string, unknown>) {
  drawSectionTitle(doc, 6, 'RESULTADOS DE ENSAIO')
  const rowStart = 14
  const rowStep = 28
  const rows: Array<[string, string]> = [
    ['Exatidão em Carga Pequena Ativa • Fator de Potência 1,0', formatAccuracy(form.cp)],
    ['Exatidão em Carga Nominal Ativa • Fator de Potência 1,0', formatAccuracy(form.cn)],
    ['Exatidão em Carga Nominal Ativa • Fator de Potência 0,5', formatAccuracy(form.ci)],
    ['Exatidão em Carga Nominal Reativa • Fator de Potência 0,5', formatAccuracy(form.cnRi)],
    ['Exatidão em Carga Nominal Reativa • Fator de Potência 0,8 Capacitiva', formatAccuracy(form.cnRc)],
  ]
  const boxHeight = rowStart + rows.length * rowStep + 10
  ensureSpace(doc, boxHeight + 16)
  const y = doc.y
  doc
    .roundedRect(PAGE.margin, y, CONTENT_WIDTH, boxHeight, 8)
    .strokeColor(COLORS.grayBorder)
    .lineWidth(1)
    .stroke()

  rows.forEach((row, index) => {
    drawFieldPair(doc, PAGE.margin + 12, y + rowStart + index * rowStep, CONTENT_WIDTH - 24, row[0], row[1])
  })

  doc.y = y + boxHeight + 14
}

function drawTestesRegistrador(doc: PdfDocument, form: Record<string, unknown>) {
  drawSectionTitle(doc, 7, 'TESTES DE REGISTRADOR')
  const rowStart = 14
  const rowStep = 28
  const rows: Array<{ left: [string, string]; right: [string, string] | null }> = [
    {
      left: ['Registrador • Mostrador', firstText(form.recorder)],
      right: ['Registro de Energia Sem Carga', firstText(form.march)],
    },
  ]
  const boxHeight = rowStart + rows.length * rowStep + 10
  ensureSpace(doc, boxHeight + 16)
  const y = doc.y
  doc
    .roundedRect(PAGE.margin, y, CONTENT_WIDTH, boxHeight, 8)
    .strokeColor(COLORS.grayBorder)
    .lineWidth(1)
    .stroke()

  const colW = (CONTENT_WIDTH - 28) / 2
  const leftX = PAGE.margin + 12
  const rightX = PAGE.margin + 16 + colW

  rows.forEach((row, index) => {
    const rowY = y + rowStart + index * rowStep
    drawFieldPair(doc, leftX, rowY, colW - 8, row.left[0], row.left[1])
    if (row.right) drawFieldPair(doc, rightX, rowY, colW - 8, row.right[0], row.right[1])
  })

  doc.y = y + boxHeight + 14
}

function drawResultado(
  doc: PdfDocument,
  laudo: RatmLaudoPdfInput,
  irregularityCodes: Record<string, string>,
  irregularityDescriptions: Record<string, string> = {},
) {
  drawSectionTitle(doc, 8, 'RESULTADO DA PERÍCIA')
  const form = laudo.formData
  const code = String(form.irregularityCode ?? '').trim()
  const writtenName = code ? irregularityCodes[code]?.trim() || '' : ''
  const savedNotes = String(form.irregularityNotes ?? '').trim()
  const catalogDescription = code ? irregularityDescriptions[code]?.trim() || '' : ''
  const irregularityText = writtenName || code || '—'
  const fields: Array<[string, string]> = [
    ['Irregularidade', irregularityText === '—' ? '—' : irregularityText.toLocaleLowerCase('pt-BR')],
    ['Observações da irregularidade', savedNotes || catalogDescription || '—'],
  ]

  const innerWidth = CONTENT_WIDTH - 24
  const paddingTop = 14
  const labelGap = 13
  const blockGap = 10
  doc.font('Helvetica-Bold').fontSize(9)
  const valueHeights = fields.map(([, value]) => Math.max(doc.heightOfString(value, { width: innerWidth }), 11))
  const boxHeight =
    paddingTop + valueHeights.reduce((sum, height) => sum + labelGap + height, 0) + blockGap * (fields.length - 1) + 12

  ensureSpace(doc, boxHeight + 16)
  const y = doc.y
  doc
    .roundedRect(PAGE.margin, y, CONTENT_WIDTH, boxHeight, 8)
    .strokeColor(COLORS.grayBorder)
    .lineWidth(1)
    .stroke()

  let cursor = y + paddingTop
  fields.forEach(([label, value], index) => {
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.textMuted).text(label, PAGE.margin + 12, cursor, {
      width: innerWidth,
      lineBreak: false,
    })
    cursor += labelGap
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.text).text(value, PAGE.margin + 12, cursor, {
      width: innerWidth,
    })
    cursor += valueHeights[index] + blockGap
  })

  doc.y = y + boxHeight + 14
}

function drawReferencias(doc: PdfDocument) {
  drawSectionTitle(doc, 9, 'REFERÊNCIAS')
  const paragraphs = [
    'Análise realizada conforme procedimentos estabelecidos pela Portaria nº 493 de 10/12/2021, emitida pelo órgão metrológico oficial INMETRO, admitindo erros máximos para medidores em serviço de ±4,0% (diferente nos eletrônicos).',
    'O Cliente deverá comparecer a uma loja de atendimento ou interpor recurso no prazo de 15 dias (Art. 253 da Resolução nº 1.000 da ANEEL).',
  ]
  ensureSpace(doc, 78)
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.text)
  paragraphs.forEach((paragraph) => {
    doc.text(paragraph, PAGE.margin, doc.y, { width: CONTENT_WIDTH, align: 'justify' })
    doc.moveDown(0.55)
  })
}

function drawAssinaturas(doc: PdfDocument, laudo: RatmLaudoPdfInput) {
  const form = laudo.formData
  const assayName = laudo.createdByName?.trim() ?? ''
  const assayRegistration = laudo.createdByRegistration?.trim() ?? ''
  const ensaioPor = assayName
    ? assayRegistration
      ? `${assayName} (${assayRegistration})`
      : assayName
    : '—'
  const aprovadoPor = laudo.status === 'Aprovado' ? textValue(form.ratmApprovedBy) : '—'
  const rowStart = 14
  const rowStep = 36
  const rows: Array<{ left: [string, string]; right: [string, string] }> = [
    {
      left: ['Análise a pedido', firstText(form.analysisRequest)],
      right: ['Cliente compareceu', firstText(form.clientAccompanied)],
    },
    {
      left: ['Assinatura do Cliente', ''],
      right: ['CPF do Cliente', ''],
    },
    {
      left: ['Ensaio realizado por', ensaioPor],
      right: ['RATM aprovado por', aprovadoPor],
    },
  ]
  const boxHeight = rowStart + rows.length * rowStep + 8
  ensureSpace(doc, boxHeight + 16)
  const y = doc.y
  doc
    .roundedRect(PAGE.margin, y, CONTENT_WIDTH, boxHeight, 8)
    .strokeColor(COLORS.grayBorder)
    .lineWidth(1)
    .stroke()

  const colW = (CONTENT_WIDTH - 28) / 2
  const leftX = PAGE.margin + 12
  const rightX = PAGE.margin + 16 + colW

  rows.forEach((row, index) => {
    const rowY = y + rowStart + index * rowStep
    const pair = [
      { x: leftX, label: row.left[0], value: row.left[1] },
      { x: rightX, label: row.right[0], value: row.right[1] },
    ]
    pair.forEach((field) => {
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.textMuted).text(field.label, field.x, rowY, {
        width: colW - 8,
        lineBreak: false,
      })
      if (field.value) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.text).text(field.value, field.x, rowY + 13, {
          width: colW - 8,
          lineBreak: false,
        })
      } else {
        doc
          .moveTo(field.x, rowY + 26)
          .lineTo(field.x + colW - 16, rowY + 26)
          .strokeColor(COLORS.grayBorder)
          .lineWidth(0.8)
          .stroke()
      }
    })
  })

  doc.y = y + boxHeight + 14
}

function drawFooter(doc: PdfDocument, page: number, total: number) {
  const barY = PAGE.height - 28
  doc.rect(0, barY, PAGE.width, 28).fill(COLORS.footerBar)
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor('#B8C9DA')
    .text('EDP SP — Laboratório de Medição', PAGE.margin, barY + 9, { lineBreak: false })
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(COLORS.white)
    .text('ENERGIA QUE TRANSFORMA O AMANHÃ', 0, barY + 9, {
      width: PAGE.width,
      align: 'center',
      lineBreak: false,
    })
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor('#B8C9DA')
    .text(`Página ${page} de ${total}`, PAGE.width - PAGE.margin - 70, barY + 9, {
      width: 70,
      align: 'right',
      lineBreak: false,
    })
}

export async function generateRatmLaudoPdf(laudo: RatmLaudoPdfInput, res: Response) {
  const form = laudo.formData

  const irregularityCodes = { ...IRREGULARITY_CODES }
  const irregularityDescriptions: Record<string, string> = {}
  try {
    const stored = await query<{ code: string; name?: string; description: string }>(
      `SELECT code, name, description FROM irregularity_codes`,
    )
    for (const row of stored.rows) {
      const label = (row.name || row.description).trim()
      const description = (row.description || row.name || '').trim()
      if (row.code?.trim() && label) {
        irregularityCodes[row.code.trim()] = label
      }
      if (row.code?.trim() && description) {
        irregularityDescriptions[row.code.trim()] = description
      }
    }
  } catch (error) {
    console.error('Não foi possível carregar os códigos de irregularidade para o laudo.', error)
  }

  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: PAGE.margin,
      bottom: PAGE.margin + PAGE.footer,
      left: PAGE.margin,
      right: PAGE.margin,
    },
    bufferPages: true,
    info: {
      Title: buildRatmPdfFileName(laudo).replace(/\.pdf$/, ''),
      Author: 'EDP SP - Laboratório de Medição',
      Subject: 'Laudo de Perícia / Fraude em Medidor',
    },
  })

  doc.pipe(res)

  drawHeader(doc, laudo)
  drawDadosGerais(doc, laudo)
  drawPadraoEnsaio(doc, await loadPadraoEnsaio(form.testBench))
  drawLocalEnsaio(doc)
  drawDadosMedidor(
    doc,
    laudo,
    await loadMeterEnergyData(String(form.meter ?? laudo.meter ?? '').trim()),
  )
  drawEnsaios(doc, form)
  drawResultadosEnsaio(doc, form)
  drawTestesRegistrador(doc, form)
  drawResultado(doc, laudo, irregularityCodes, irregularityDescriptions)
  drawReferencias(doc)
  drawAssinaturas(doc, laudo)

  const range = doc.bufferedPageRange()
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index)
    if (laudo.revokedAt) drawRevokedWatermark(doc)
    drawFooter(doc, index + 1, range.count)
  }

  doc.flushPages()
  doc.end()
}
