import PDFDocument from 'pdfkit'
import type { Response } from 'express'

type PdfDocument = InstanceType<typeof PDFDocument>

type RatmLaudoPdfInput = {
  id: string
  ratmNumber: number
  meter: string
  client: string
  createdAt: string
  status: string
  formData: Record<string, unknown>
}

const IRREGULARITY_CODES: Record<string, string> = {
  '23': 'MANCAL FORA DE POSIÇÃO',
}

const LAB_LOCAL =
  'Laboratório de Metrologia EDP SP — Av. Cassiano Ricardo, 1973 — Jardim Alvorada, São José dos Campos — SP'

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 42,
  headerFirst: 108,
  headerNext: 52,
  footer: 36,
}

const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2
const COLUMN_GAP = 14
const COLUMN_WIDTH = (CONTENT_WIDTH - COLUMN_GAP) / 2
const CONTENT_BOTTOM = PAGE.height - PAGE.margin - PAGE.footer

const COLORS = {
  navy: '#0E3157',
  navyDark: '#031424',
  cyan: '#18D8F0',
  cyanDark: '#0EA8C4',
  green: '#1FA971',
  greenBg: '#E8F8F0',
  red: '#D64545',
  redBg: '#FDECEC',
  amber: '#C47D0E',
  amberBg: '#FFF6E8',
  text: '#1B2838',
  textMuted: '#5A6B7D',
  textLight: '#8A97A8',
  border: '#D4DEE8',
  surface: '#F5F8FB',
  surfaceAlt: '#EEF3F8',
  white: '#FFFFFF',
}

function textValue(value: unknown) {
  if (value === null || value === undefined) {
    return '—'
  }

  const normalized = String(value).trim()
  return normalized || '—'
}

function yesNo(value: unknown) {
  const normalized = textValue(value)
  if (normalized === '—') {
    return 'Não'
  }

  return normalized
}

function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString('pt-BR')
}

function formatDateTime(isoDate: string) {
  return new Date(isoDate).toLocaleString('pt-BR')
}

function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/)
  if (!match) {
    return null
  }

  return Buffer.from(match[1], 'base64')
}

function buildRatmNumber(laudo: RatmLaudoPdfInput) {
  const year = new Date(laudo.createdAt).getFullYear()
  return `${laudo.ratmNumber}_${laudo.meter}_${year}`
}

function buildTechnicalReport(form: Record<string, unknown>) {
  if (form.apparentlyInOrder === 'Sim') {
    return { text: 'MEDIDOR EM ORDEM', tone: 'success' as const }
  }

  if (form.visualTest === 'Reprovado' || form.dielectric === 'Reprovado' || form.march === 'Reprovado') {
    return { text: 'MEDIDOR REPROVADO NOS ENSAIOS', tone: 'danger' as const }
  }

  if (
    form.brokenMeter === 'Sim' ||
    form.damagedCoil === 'Sim' ||
    form.dielectricFailed === 'Sim'
  ) {
    return { text: 'MEDIDOR COM NÃO CONFORMIDADE IDENTIFICADA', tone: 'warning' as const }
  }

  return { text: 'MEDIDOR EM ORDEM', tone: 'success' as const }
}

function statusTone(status: string): 'neutral' | 'success' | 'danger' {
  if (status === 'Aprovado') {
    return 'success'
  }

  if (status === 'Reprovado') {
    return 'danger'
  }

  return 'neutral'
}

function yesNoTone(value: unknown): 'neutral' | 'success' | 'danger' | 'warning' {
  const normalized = yesNo(value).toLowerCase()

  if (normalized === 'sim' || normalized === 'aprovado' || normalized === 'ok') {
    return 'success'
  }

  if (normalized === 'reprovado' || normalized === 'não conforme') {
    return 'danger'
  }

  if (normalized === 'não' || normalized === 'nao') {
    return 'neutral'
  }

  return 'warning'
}

function toneColors(tone: 'neutral' | 'success' | 'danger' | 'warning') {
  switch (tone) {
    case 'success':
      return { fill: COLORS.greenBg, stroke: '#B8E6CF', text: COLORS.green }
    case 'danger':
      return { fill: COLORS.redBg, stroke: '#F5C2C2', text: COLORS.red }
    case 'warning':
      return { fill: COLORS.amberBg, stroke: '#F0D9A8', text: COLORS.amber }
    default:
      return { fill: COLORS.surfaceAlt, stroke: COLORS.border, text: COLORS.textMuted }
  }
}

function contentTop(isFirstPage: boolean) {
  return isFirstPage ? PAGE.headerFirst : PAGE.headerNext
}

function ensureSpace(doc: PdfDocument, height = 60) {
  if (doc.y + height > CONTENT_BOTTOM) {
    doc.addPage()
    doc.y = contentTop(false)
  }
}

function drawBrandMark(doc: PdfDocument, x: number, y: number, onDark = false) {
  doc.save()
  doc.translate(x + 12, y + 18)
  doc.rotate(-18)

  doc
    .lineCap('round')
    .lineWidth(3.5)
    .strokeColor('#6D3EF2')
    .moveTo(0, -8)
    .bezierCurveTo(10, -14, 18, -6, 14, 4)
    .stroke()

  doc
    .lineWidth(3)
    .strokeColor('#39FF00')
    .moveTo(2, -4)
    .bezierCurveTo(8, -9, 14, -3, 11, 5)
    .stroke()

  doc
    .lineWidth(2.5)
    .strokeColor('#18D8F0')
    .moveTo(4, 0)
    .bezierCurveTo(8, -4, 12, 0, 10, 6)
    .stroke()

  doc.restore()

  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .fillColor(onDark ? COLORS.white : COLORS.navyDark)
    .text('EDP', x + 28, y + 2, { lineBreak: false })

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(onDark ? '#B8C9DA' : COLORS.textMuted)
    .text('Laboratório de Medição', x + 28, y + 26, { lineBreak: false })
}

function drawBadge(
  doc: PdfDocument,
  x: number,
  y: number,
  label: string,
  tone: 'neutral' | 'success' | 'danger' | 'warning',
) {
  const colors = toneColors(tone)
  const width = doc.widthOfString(label) + 18
  const height = 18

  doc
    .roundedRect(x, y, width, height, 9)
    .fillAndStroke(colors.fill, colors.stroke)

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(colors.text)
    .text(label, x, y + 4, { width, align: 'center', lineBreak: false })

  return width
}

function drawDocumentHeader(doc: PdfDocument, laudo: RatmLaudoPdfInput, isFirstPage: boolean) {
  const headerHeight = isFirstPage ? PAGE.headerFirst - 12 : PAGE.headerNext - 8
  const ratmId = buildRatmNumber(laudo)

  doc
    .save()
    .rect(0, 0, PAGE.width, headerHeight)
    .fill(COLORS.navyDark)
    .restore()

  doc
    .save()
    .rect(0, headerHeight - 4, PAGE.width, 4)
    .fill(COLORS.cyan)
    .restore()

  drawBrandMark(doc, PAGE.margin, isFirstPage ? 18 : 12, true)

  if (isFirstPage) {
    doc
      .font('Helvetica-Bold')
      .fontSize(13.5)
      .fillColor(COLORS.white)
      .text('Relatório de Avaliação Técnica de Medidor', PAGE.margin + 120, 20, {
        width: CONTENT_WIDTH - 120,
        align: 'right',
        lineBreak: false,
      })

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(COLORS.cyan)
      .text(`RATM N° ${ratmId}`, PAGE.margin + 120, 38, {
        width: CONTENT_WIDTH - 120,
        align: 'right',
        lineBreak: false,
      })

    const metaY = 62
    doc
      .roundedRect(PAGE.margin, metaY, CONTENT_WIDTH, 34, 8)
      .fillAndStroke('#0A2238', '#1A3A57')

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#B8C9DA')
      .text('Medidor', PAGE.margin + 14, metaY + 8, { lineBreak: false })
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(COLORS.white)
      .text(laudo.meter, PAGE.margin + 14, metaY + 18, { lineBreak: false })

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#B8C9DA')
      .text('Cliente', PAGE.margin + 150, metaY + 8, { lineBreak: false })
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(COLORS.white)
      .text(laudo.client, PAGE.margin + 150, metaY + 18, { width: 180, lineBreak: false })

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#B8C9DA')
      .text('Emissão', PAGE.margin + 360, metaY + 8, { lineBreak: false })
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(COLORS.white)
      .text(formatDateTime(laudo.createdAt), PAGE.margin + 360, metaY + 18, { lineBreak: false })

    const badgeLabel = laudo.status.toUpperCase()
    const badgeWidth = doc.widthOfString(badgeLabel) + 18
    drawBadge(
      doc,
      PAGE.margin + CONTENT_WIDTH - badgeWidth - 12,
      metaY + 8,
      badgeLabel,
      statusTone(laudo.status),
    )
  } else {
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(COLORS.white)
      .text(`RATM N° ${ratmId}`, PAGE.margin + 120, 16, {
        width: CONTENT_WIDTH - 120,
        align: 'right',
        lineBreak: false,
      })
  }

  doc.y = contentTop(isFirstPage)
}

function drawPageFooter(doc: PdfDocument, laudo: RatmLaudoPdfInput, pageNumber: number, pageCount: number) {
  const footerY = PAGE.height - PAGE.margin - 14

  doc
    .save()
    .moveTo(PAGE.margin, footerY - 8)
    .lineTo(PAGE.margin + CONTENT_WIDTH, footerY - 8)
    .strokeColor(COLORS.border)
    .lineWidth(0.6)
    .stroke()
    .restore()

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(COLORS.textLight)
    .text(
      `Documento gerado eletronicamente — Eficiência da Medição | Laudo ${laudo.id}`,
      PAGE.margin,
      footerY,
      { width: CONTENT_WIDTH * 0.72, lineBreak: false },
    )

  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(COLORS.textMuted)
    .text(`Página ${pageNumber} de ${pageCount}`, PAGE.margin, footerY, {
      width: CONTENT_WIDTH,
      align: 'right',
      lineBreak: false,
    })
}

function drawSectionHeader(doc: PdfDocument, title: string) {
  ensureSpace(doc, 48)

  const y = doc.y

  doc
    .roundedRect(PAGE.margin, y, CONTENT_WIDTH, 24, 6)
    .fill(COLORS.navy)

  doc
    .save()
    .rect(PAGE.margin, y, 5, 24)
    .fill(COLORS.cyan)
    .restore()

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(COLORS.white)
    .text(title.toUpperCase(), PAGE.margin + 14, y + 7, {
      width: CONTENT_WIDTH - 20,
      lineBreak: false,
    })

  doc.y = y + 32
}

function drawFieldCell(
  doc: PdfDocument,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  shaded = false,
) {
  doc
    .roundedRect(x, y, width, 34, 5)
    .fillAndStroke(shaded ? COLORS.surface : COLORS.white, COLORS.border)

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(COLORS.textLight)
    .text(label, x + 10, y + 7, { width: width - 16, lineBreak: false })

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.text)
    .text(value, x + 10, y + 18, { width: width - 16 })
}

function drawFieldGrid(
  doc: PdfDocument,
  rows: Array<Array<{ label: string; value: string }>>,
) {
  rows.forEach((row, rowIndex) => {
    ensureSpace(doc, 42)
    const y = doc.y
    const cellWidth =
      row.length === 1 ? CONTENT_WIDTH : (CONTENT_WIDTH - COLUMN_GAP * (row.length - 1)) / row.length

    row.forEach((field, columnIndex) => {
      const x = PAGE.margin + columnIndex * (cellWidth + COLUMN_GAP)
      drawFieldCell(doc, x, y, cellWidth, field.label, field.value, rowIndex % 2 === 1)
    })

    doc.y = y + 40
  })

  doc.moveDown(0.15)
}

function drawFullWidthField(doc: PdfDocument, label: string, value: string) {
  ensureSpace(doc, 42)
  const y = doc.y

  doc
    .roundedRect(PAGE.margin, y, CONTENT_WIDTH, 34, 5)
    .fillAndStroke(COLORS.surface, COLORS.border)

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(COLORS.textLight)
    .text(label, PAGE.margin + 10, y + 7, { width: CONTENT_WIDTH - 20, lineBreak: false })

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.text)
    .text(value, PAGE.margin + 10, y + 18, { width: CONTENT_WIDTH - 20 })

  doc.y = y + 40
  doc.moveDown(0.1)
}

function drawYesNoGrid(doc: PdfDocument, items: Array<{ label: string; value: unknown }>) {
  ensureSpace(doc, 52)

  const columns = 2
  const cellWidth = (CONTENT_WIDTH - COLUMN_GAP) / columns
  let column = 0
  let rowY = doc.y

  items.forEach((item, index) => {
    if (column === 0 && index > 0) {
      rowY += 28
      ensureSpace(doc, 32)
      if (doc.y > rowY) {
        rowY = doc.y
      }
    }

    const x = PAGE.margin + column * (cellWidth + COLUMN_GAP)
    const tone = yesNoTone(item.value)
    const colors = toneColors(tone)
    const value = yesNo(item.value)

    doc
      .roundedRect(x, rowY, cellWidth, 22, 5)
      .fillAndStroke(colors.fill, colors.stroke)

    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(COLORS.textMuted)
      .text(item.label, x + 8, rowY + 6, {
        width: cellWidth - 70,
        lineBreak: false,
      })

    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(colors.text)
      .text(value, x + cellWidth - 58, rowY + 6, {
        width: 50,
        align: 'right',
        lineBreak: false,
      })

    column = (column + 1) % columns
  })

  doc.y = rowY + 30
  doc.moveDown(0.2)
}

function drawCallout(
  doc: PdfDocument,
  title: string,
  tone: 'success' | 'danger' | 'warning',
) {
  ensureSpace(doc, 56)
  const colors = toneColors(tone)
  const y = doc.y

  doc
    .roundedRect(PAGE.margin, y, CONTENT_WIDTH, 34, 8)
    .fillAndStroke(colors.fill, colors.stroke)

  doc
    .save()
    .rect(PAGE.margin, y, 5, 34)
    .fill(colors.text)
    .restore()

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(colors.text)
    .text(title, PAGE.margin + 16, y + 11, { width: CONTENT_WIDTH - 24, lineBreak: false })

  doc.y = y + 42
}

function drawParagraphBlock(doc: PdfDocument, paragraphs: string[]) {
  ensureSpace(doc, 60)

  const y = doc.y
  doc
    .roundedRect(PAGE.margin, y, CONTENT_WIDTH, 58, 8)
    .fillAndStroke(COLORS.surface, COLORS.border)

  let textY = y + 12
  paragraphs.forEach((paragraph) => {
    doc
      .font('Helvetica')
      .fontSize(8.2)
      .fillColor(COLORS.textMuted)
      .text(paragraph, PAGE.margin + 14, textY, {
        width: CONTENT_WIDTH - 28,
        align: 'justify',
        lineGap: 2,
      })
    textY = doc.y + 4
  })

  doc.y = Math.max(doc.y, y + 58) + 8
}

function drawSignatureSection(doc: PdfDocument) {
  ensureSpace(doc, 90)
  doc.moveDown(0.2)

  const y = doc.y
  const boxWidth = (CONTENT_WIDTH - COLUMN_GAP) / 2
  const boxHeight = 72

  ;[
    { title: 'Assinatura do Cliente', subtitle: 'Cliente / Representante' },
    { title: 'Responsável Técnico', subtitle: 'Aprovado por' },
  ].forEach((block, index) => {
    const x = PAGE.margin + index * (boxWidth + COLUMN_GAP)

    doc
      .roundedRect(x, y, boxWidth, boxHeight, 8)
      .fillAndStroke(COLORS.white, COLORS.border)

    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(COLORS.textMuted)
      .text(block.title, x + 12, y + 12, { width: boxWidth - 24, lineBreak: false })

    doc
      .moveTo(x + 12, y + 52)
      .lineTo(x + boxWidth - 12, y + 52)
      .strokeColor(COLORS.border)
      .lineWidth(0.8)
      .stroke()

    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(COLORS.textLight)
      .text(block.subtitle, x + 12, y + 56, { width: boxWidth - 24, align: 'center', lineBreak: false })
  })

  doc.y = y + boxHeight + 8
}

function drawPhotoSection(doc: PdfDocument, photos: string[]) {
  if (!photos.length) {
    return
  }

  doc.addPage()
  doc.y = contentTop(false)

  drawSectionHeader(doc, 'Registro Fotográfico')

  const columns = 2
  const gap = 12
  const cellWidth = (CONTENT_WIDTH - gap) / columns
  const imageHeight = 150
  const cellHeight = imageHeight + 36
  let rowY = doc.y

  photos.forEach((photo, index) => {
    const column = index % columns

    if (column === 0) {
      ensureSpace(doc, cellHeight + 8)
      rowY = doc.y
    }

    const x = PAGE.margin + column * (cellWidth + gap)
    const buffer = dataUrlToBuffer(photo)

    doc
      .roundedRect(x, rowY, cellWidth, cellHeight, 8)
      .fillAndStroke(COLORS.white, COLORS.border)

    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(COLORS.navy)
      .text(`Foto ${index + 1}`, x + 10, rowY + 8, { width: cellWidth - 20, lineBreak: false })

    if (buffer) {
      const imageY = rowY + 22
      doc.save()
      doc.roundedRect(x + 8, imageY, cellWidth - 16, imageHeight, 6).clip()
      doc.image(buffer, x + 8, imageY, {
        fit: [cellWidth - 16, imageHeight],
        align: 'center',
        valign: 'center',
      })
      doc.restore()
    }

    if (column === columns - 1 || index === photos.length - 1) {
      doc.y = rowY + cellHeight + 8
    }
  })
}

export function generateRatmLaudoPdf(laudo: RatmLaudoPdfInput, res: Response) {
  const form = laudo.formData
  const irregularityCode = textValue(form.irregularityCode)
  const fieldIrregularityCode = textValue(form.fieldIrregularityCode)
  const irregularityDescription =
    IRREGULARITY_CODES[fieldIrregularityCode !== '—' ? fieldIrregularityCode : irregularityCode] ??
    'Não especificada'
  const technicalReport = buildTechnicalReport(form)

  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: PAGE.margin,
      bottom: PAGE.margin,
      left: PAGE.margin,
      right: PAGE.margin,
    },
    bufferPages: true,
    info: {
      Title: `RATM ${buildRatmNumber(laudo)} - Medidor ${laudo.meter}`,
      Author: 'EDP - Laboratório de Medição',
      Subject: 'Relatório de Avaliação Técnica de Medidor RATM',
    },
  })

  doc.pipe(res)

  doc.on('pageAdded', () => {
    drawDocumentHeader(doc, laudo, false)
  })

  drawDocumentHeader(doc, laudo, true)

  drawSectionHeader(doc, 'Dados da Instalação')
  drawFieldGrid(doc, [
    [
      { label: 'Cliente', value: laudo.client },
      { label: 'Instalação', value: '—' },
    ],
    [
      { label: 'Medidor', value: textValue(form.meter) },
      { label: 'Leitura', value: textValue(form.meterReading) },
    ],
    [
      { label: 'Nota / TOI', value: '—' },
      { label: 'Status do medidor', value: textValue(form.meterStatus) },
    ],
  ])

  drawSectionHeader(doc, 'Dados do Padrão')
  drawFieldGrid(doc, [
    [
      { label: 'Patrimônio / Serial', value: textValue(form.testBench) },
      { label: 'Modelo', value: textValue(form.itemLookup) },
    ],
    [
      { label: 'Fabricante', value: '—' },
      { label: 'Classe de exatidão', value: '—' },
    ],
    [
      { label: 'Validade certificado', value: '—' },
      { label: 'Certificado de calibração', value: '—' },
    ],
  ])
  drawFullWidthField(doc, 'Local', LAB_LOCAL)

  drawSectionHeader(doc, 'Dados do Medidor')
  drawFieldGrid(doc, [
    [
      { label: '1° lacre tampa', value: textValue(form.seal1) },
      { label: 'Status lacre 1', value: textValue(form.seal1Status) },
    ],
    [
      { label: '2° lacre tampa', value: textValue(form.seal2) },
      { label: 'Status lacre 2', value: textValue(form.seal2Status) },
    ],
    [
      { label: 'N° medidor', value: textValue(form.meter) },
      { label: 'Lacre do invólucro', value: textValue(form.enclosureSeal) },
    ],
    [
      { label: 'Tipo', value: textValue(form.itemLookup) },
      { label: 'Status invólucro', value: textValue(form.enclosureStatus) },
    ],
    [
      { label: 'Fabricante', value: '—' },
      { label: 'Modelo', value: '—' },
    ],
  ])

  drawSectionHeader(doc, 'Resultados de Ensaio')
  drawYesNoGrid(doc, [
    { label: 'Medidor quebrado / furado', value: form.brokenMeter },
    { label: 'Display apagado / não liga', value: form.displayOff },
    { label: 'Facilidade de acesso ao interior', value: form.meterInteriorAccess },
    { label: 'Bobina danificada', value: form.damagedCoil },
    { label: 'Aparentemente em ordem', value: form.apparentlyInOrder },
    { label: 'Reprovado no dielétrico', value: form.dielectricFailed },
    { label: 'Corpo estranho no interior', value: form.foreignBodyInMeter },
    { label: 'Inspeção geral', value: form.visualTest },
    { label: 'Borne queimado', value: form.interruptedPhase },
  ])

  drawSectionHeader(doc, 'Resultados de Ensaio de Exatidão')
  drawFieldGrid(doc, [
    [
      { label: 'Exatidão carga pequena ativa FP1', value: textValue(form.cp) },
      { label: 'Exatidão carga nominal ativa FP1', value: textValue(form.cn) },
    ],
    [
      {
        label: 'Exatidão carga nominal ativa FP 0,5 Ind',
        value: textValue(form.ci),
      },
      {
        label: 'Exatidão carga nominal reativa FP 0,5 Ind',
        value: textValue(form.cnRi),
      },
    ],
    [
      {
        label: 'Exatidão carga nominal reativa FP 0,8 Cap',
        value: textValue(form.cnRc),
      },
      { label: 'Registro de energia sem carga', value: textValue(form.meterReadingPreset) },
    ],
    [
      { label: 'Registrador / mostrador', value: textValue(form.recorder) },
      { label: 'Marcha', value: textValue(form.march) },
    ],
    [
      { label: 'Ensaio visual', value: textValue(form.visualTest) },
      { label: 'Dielétrico', value: textValue(form.dielectric) },
    ],
  ])

  drawSectionHeader(doc, 'Relatório Técnico')
  drawCallout(doc, technicalReport.text, technicalReport.tone)
  drawParagraphBlock(doc, [
    'Análise realizada conforme procedimentos estabelecidos pela Portaria nº 493 de 10/12/2021, emitida pelo órgão metrológico oficial INMETRO, admitindo erros máximos para medidores em serviço de ±4,0% (diferente nos eletrônicos).',
    'O Cliente deverá comparecer a uma loja de atendimento ou interpor recurso no prazo de 15 dias (Art. 253 da Resolução 1000 da ANEEL).',
  ])

  drawSectionHeader(doc, 'Irregularidades')
  drawFieldGrid(doc, [
    [{ label: 'Descrição da irregularidade', value: irregularityDescription }],
    [{ label: 'Observações da irregularidade', value: textValue(form.irregularityNotes) }],
    [{ label: 'Observações para laboratório', value: textValue(form.laboratoryNotes) }],
    [
      { label: 'Laudo de campo correto', value: textValue(form.fieldReportCorrect) },
      { label: 'Tipo NS', value: textValue(form.nsType) },
    ],
  ])

  drawSectionHeader(doc, 'Dados da Realização da Avaliação Técnica')
  drawFieldGrid(doc, [
    [
      { label: 'Realizado por', value: textValue(form.fieldInspectionBy) },
      { label: 'Aprovado por', value: '—' },
    ],
    [
      { label: 'Data', value: formatDate(laudo.createdAt) },
      { label: 'Análise a pedido', value: textValue(form.analysisRequest) },
    ],
    [
      { label: 'Cliente compareceu à calibração?', value: textValue(form.clientAccompanied) },
      { label: 'Status leitura', value: textValue(form.meterReadingStatus) },
    ],
    [
      { label: 'CN preset', value: textValue(form.cnPreset) },
      { label: 'CI preset', value: textValue(form.ciPreset) },
    ],
    [
      { label: 'CP preset', value: textValue(form.cpPreset) },
      { label: 'Fase interrompida', value: textValue(form.interruptedPhaseOption) },
    ],
  ])

  drawSignatureSection(doc)

  const photos = Array.isArray(form.photos)
    ? form.photos.filter((photo): photo is string => typeof photo === 'string' && photo.length > 0)
    : []

  drawPhotoSection(doc, photos)

  const pageRange = doc.bufferedPageRange()
  const pageCount = pageRange.count

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    doc.switchToPage(pageRange.start + pageIndex)
    drawPageFooter(doc, laudo, pageIndex + 1, pageCount)
  }

  doc.flushPages()
  doc.end()
}
