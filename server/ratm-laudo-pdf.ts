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
  createdByName?: string
  createdByRegistration?: string
  installation?: string
  toi?: string
  note?: string
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

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function buildLaudoNumber(laudo: RatmLaudoPdfInput) {
  const date = new Date(laudo.createdAt)
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const seq = String(laudo.ratmNumber).padStart(6, '0')
  return `LMED-${year}/${month}-${seq}`
}

function isFraudConclusion(form: Record<string, unknown>) {
  if (form.apparentlyInOrder === 'Sim') return false
  if (form.visualTest === 'Reprovado' || form.dielectric === 'Reprovado' || form.march === 'Reprovado') {
    return true
  }
  return (
    form.brokenMeter === 'Sim' ||
    form.damagedCoil === 'Sim' ||
    form.dielectricFailed === 'Sim' ||
    form.foreignBodyInMeter === 'Sim' ||
    form.meterInteriorAccess === 'Sim' ||
    form.displayOff === 'Sim'
  )
}

function irregularityLabel(form: Record<string, unknown>) {
  const code = textValue(form.fieldIrregularityCode)
  const fallback = textValue(form.irregularityCode)
  const key = code !== '—' ? code : fallback
  return IRREGULARITY_CODES[key] ?? (key !== '—' ? `Código ${key}` : 'Irregularidade não especificada')
}

function parsePercent(value: unknown): number | null {
  if (value == null) return null
  const raw = String(value).trim().replace('%', '').replace(',', '.')
  if (!raw) return null
  const num = Number(raw)
  return Number.isFinite(num) ? num : null
}

function worstAccuracy(form: Record<string, unknown>): number | null {
  const values = [form.cp, form.cn, form.ci, form.cnRi, form.cnRc]
    .map(parsePercent)
    .filter((value): value is number => value != null)
  if (!values.length) return null
  return values.reduce((worst, value) =>
    Math.abs(value) > Math.abs(worst) ? value : worst,
  )
}

function formatPercent(value: number | null) {
  if (value == null) return '—'
  const formatted = value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${value > 0 ? '+' : ''}${formatted}%`
}

function ensaioResult(value: unknown, inverted = false): { label: string; irregular: boolean } {
  const normalized = textValue(value).toLowerCase()
  if (normalized === '—') return { label: 'Não informado', irregular: false }

  if (['aprovado', 'ok', 'em ordem'].includes(normalized)) {
    return { label: inverted ? 'Irregular' : 'Regular', irregular: inverted }
  }
  if (['reprovado', 'não conforme', 'nao conforme'].includes(normalized)) {
    return { label: 'Irregular', irregular: true }
  }
  if (normalized === 'sim') {
    return { label: inverted ? 'Irregular' : 'Regular', irregular: inverted }
  }
  if (normalized === 'não' || normalized === 'nao') {
    return { label: inverted ? 'Regular' : 'Irregular', irregular: !inverted }
  }
  return { label: textValue(value), irregular: false }
}

function ensureSpace(doc: PdfDocument, height: number) {
  if (doc.y + height > CONTENT_BOTTOM) {
    doc.addPage()
    doc.y = PAGE.margin
  }
}

function drawEdpMark(doc: PdfDocument, x: number, y: number) {
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
    .text(value, x, y + 11, { width, lineBreak: false })
}

function drawHeader(doc: PdfDocument, laudo: RatmLaudoPdfInput, conclusion: string) {
  drawEdpMark(doc, PAGE.margin, PAGE.margin)
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.navy)
    .text('Laboratório de Medição', PAGE.margin + 78, PAGE.margin + 2, { lineBreak: false })
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(COLORS.textMuted)
    .text('EDP SP', PAGE.margin + 78, PAGE.margin + 14, { lineBreak: false })

  const rightX = PAGE.width - PAGE.margin - 170
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(COLORS.textMuted)
    .text('Nº DO LAUDO', rightX, PAGE.margin + 2, { width: 170, align: 'right', lineBreak: false })
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

  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(COLORS.titleBlue)
    .text('LAUDO DE PERÍCIA / FRAUDE EM MEDIDOR', PAGE.margin, PAGE.margin + 64, {
      width: CONTENT_WIDTH - 190,
      lineBreak: false,
    })

  const boxX = PAGE.width - PAGE.margin - 180
  const boxY = PAGE.margin + 58
  doc.roundedRect(boxX, boxY, 180, 42, 6).fillAndStroke(COLORS.graySoft, COLORS.grayBorder)
  doc.circle(boxX + 16, boxY + 21, 8).fill(COLORS.green)
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(COLORS.white)
    .text('✓', boxX + 12, boxY + 16, { lineBreak: false })
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(COLORS.navy)
    .text('LAUDO CONCLUSIVO:', boxX + 30, boxY + 8, { width: 140, lineBreak: false })
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(COLORS.text)
    .text(conclusion, boxX + 30, boxY + 18, { width: 140 })

  doc.y = Math.max(boxY + 52, PAGE.margin + 100)
}

function drawDadosGerais(doc: PdfDocument, laudo: RatmLaudoPdfInput) {
  drawSectionTitle(doc, 1, 'DADOS GERAIS')
  ensureSpace(doc, 118)
  const y = doc.y
  const boxHeight = 110
  doc.roundedRect(PAGE.margin, y, CONTENT_WIDTH, boxHeight, 8).strokeColor(COLORS.grayBorder).lineWidth(1).stroke()

  const form = laudo.formData
  const colW = (CONTENT_WIDTH - 28) / 2
  const leftX = PAGE.margin + 12
  const rightX = PAGE.margin + 16 + colW
  const rows = [
    {
      left: ['Unidade Consumidora', textValue(laudo.client)],
      right: ['Data da Coleta', textValue(form.scheduleDate) !== '—' ? textValue(form.scheduleDate) : formatDate(laudo.createdAt)],
    },
    {
      left: ['Endereço', '—'],
      right: ['Data de Entrada no Laboratório', formatDate(laudo.createdAt)],
    },
    {
      left: ['Instalação', textValue(laudo.installation)],
      right: ['Data(s) do(s) Ensaio(s)', formatDate(laudo.createdAt)],
    },
    {
      left: ['Medidor (nº de série)', textValue(form.meter || laudo.meter)],
      right: ['Solicitante', textValue(form.fieldInspectionBy || laudo.createdByName)],
    },
    {
      left: ['Marca / Modelo', textValue(form.itemLookup)],
      right: ['Número da OS / Nota', textValue(laudo.note || form.analysisRequest)],
    },
  ]

  rows.forEach((row, index) => {
    const rowY = y + 10 + index * 18
    drawFieldPair(doc, leftX, rowY, colW - 8, row.left[0], row.left[1])
    drawFieldPair(doc, rightX, rowY, colW - 8, row.right[0], row.right[1])
  })

  doc.y = y + boxHeight + 12
}

function drawProcedimentos(doc: PdfDocument) {
  drawSectionTitle(doc, 2, 'PROCEDIMENTOS E REFERÊNCIAS')
  ensureSpace(doc, 70)
  const items = [
    'Portaria INMETRO nº 493/2021 — requisitos metrológicos para medidores em serviço.',
    'Resolução Normativa ANEEL nº 1.000/2021 — direitos e deveres dos consumidores.',
    'ABNT NBR ISO/IEC 17025 — requisitos gerais para competência de laboratórios.',
    'Procedimentos internos do Laboratório de Medição EDP SP para perícia metrológica.',
  ]
  items.forEach((item) => {
    ensureSpace(doc, 16)
    const y = doc.y
    doc.circle(PAGE.margin + 4, y + 4, 2).fill(COLORS.cyan)
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLORS.text)
      .text(item, PAGE.margin + 12, y, { width: CONTENT_WIDTH - 12 })
    doc.y = Math.max(doc.y, y + 14)
  })
  doc.y += 6
}

function drawEnsaios(doc: PdfDocument, form: Record<string, unknown>) {
  drawSectionTitle(doc, 3, 'ENSAIOS REALIZADOS')
  ensureSpace(doc, 92)
  const y = doc.y
  const gap = 8
  const boxW = (CONTENT_WIDTH - gap * 4) / 5
  const boxH = 78

  const ensaios = [
    { title: 'Inspeção visual', result: ensaioResult(form.visualTest) },
    {
      title: 'Integridade',
      result: ensaioResult(
        form.brokenMeter === 'Sim' || form.damagedCoil === 'Sim' || form.foreignBodyInMeter === 'Sim'
          ? 'Reprovado'
          : form.apparentlyInOrder === 'Sim'
            ? 'Aprovado'
            : form.brokenMeter || form.apparentlyInOrder,
        false,
      ),
    },
    {
      title: 'Exatidão',
      result: (() => {
        const worst = worstAccuracy(form)
        if (worst == null) return ensaioResult(form.cn || form.cp)
        return Math.abs(worst) > 4
          ? { label: 'Irregular', irregular: true }
          : { label: 'Regular', irregular: false }
      })(),
    },
    { title: 'Marcha em vazio', result: ensaioResult(form.march) },
    { title: 'Dielétrico', result: ensaioResult(form.dielectric || form.dielectricFailed, form.dielectricFailed === 'Sim') },
  ]

  ensaios.forEach((ensaio, index) => {
    const x = PAGE.margin + index * (boxW + gap)
    doc.roundedRect(x, y, boxW, boxH, 8).fillAndStroke(COLORS.white, COLORS.grayBorder)
    doc.circle(x + boxW / 2, y + 16, 8).fill(COLORS.grayBox)
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(COLORS.navy)
      .text(ensaio.title, x + 4, y + 30, { width: boxW - 8, align: 'center' })
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor(COLORS.green)
      .text('RESULTADO', x + 4, y + 46, { width: boxW - 8, align: 'center', lineBreak: false })
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(ensaio.result.irregular ? COLORS.red : COLORS.green)
      .text(ensaio.result.label, x + 4, y + 56, { width: boxW - 8, align: 'center', lineBreak: false })
  })

  doc.y = y + boxH + 14
}

function drawResultado(doc: PdfDocument, laudo: RatmLaudoPdfInput, fraud: boolean) {
  drawSectionTitle(doc, 4, 'RESULTADO DA PERÍCIA')
  ensureSpace(doc, 150)
  const y = doc.y
  const leftW = CONTENT_WIDTH * 0.58
  const rightW = CONTENT_WIDTH - leftW - 10
  const form = laudo.formData

  const conclusion = fraud
    ? 'Constatada fraude no medidor de energia elétrica.'
    : 'Não constatada irregularidade metrológica no medidor.'

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(COLORS.textMuted)
    .text('Conclusão', PAGE.margin, y, { lineBreak: false })
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(fraud ? COLORS.red : COLORS.green)
    .text(conclusion, PAGE.margin, y + 12, { width: leftW - 8 })

  const detailY = doc.y + 8
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(COLORS.text)
    .text(
      fraud
        ? 'Com base nos ensaios realizados no Laboratório de Medição da EDP SP, foram identificadas evidências de alteração/irregularidade capazes de comprometer o registro correto do consumo de energia elétrica.'
        : 'Com base nos ensaios realizados no Laboratório de Medição da EDP SP, o medidor apresentou comportamento metrológico compatível com os limites estabelecidos pela regulamentação vigente.',
      PAGE.margin,
      detailY,
      { width: leftW - 8 },
    )

  const bulletsStart = doc.y + 8
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.navy).text('Detalhamento', PAGE.margin, bulletsStart, {
    lineBreak: false,
  })

  const details = [
    `Irregularidade: ${irregularityLabel(form)}`,
    `Observações: ${textValue(form.irregularityNotes)}`,
    `Observações do laboratório: ${textValue(form.laboratoryNotes)}`,
    `Laudo de campo correto: ${textValue(form.fieldReportCorrect)}`,
    `TOI: ${textValue(laudo.toi)}`,
  ]

  let bulletY = bulletsStart + 14
  details.forEach((item) => {
    doc.circle(PAGE.margin + 3, bulletY + 3, 1.5).fill(COLORS.cyan)
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(COLORS.text)
      .text(item, PAGE.margin + 10, bulletY, { width: leftW - 14 })
    bulletY = Math.max(doc.y + 2, bulletY + 12)
  })

  const boxX = PAGE.margin + leftW + 10
  const boxH = Math.max(132, bulletY - y)
  doc.roundedRect(boxX, y, rightW, boxH, 8).fillAndStroke(COLORS.grayBox, COLORS.grayBorder)

  const worst = worstAccuracy(form)
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(COLORS.textMuted)
    .text('ERRO DE MEDIÇÃO ENCONTRADO', boxX + 10, y + 12, {
      width: rightW - 20,
      align: 'center',
      lineBreak: false,
    })
  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .fillColor(COLORS.red)
    .text(formatPercent(worst), boxX + 10, y + 28, {
      width: rightW - 20,
      align: 'center',
      lineBreak: false,
    })
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(COLORS.textMuted)
    .text(worst != null && worst < 0 ? 'Submedição' : worst != null && worst > 0 ? 'Sobremedição' : 'Não informado', boxX + 10, y + 54, {
      width: rightW - 20,
      align: 'center',
      lineBreak: false,
    })

  doc
    .moveTo(boxX + 14, y + 72)
    .lineTo(boxX + rightW - 14, y + 72)
    .strokeColor(COLORS.grayBorder)
    .lineWidth(0.8)
    .stroke()

  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(COLORS.textMuted)
    .text('LEITURA DO MEDIDOR', boxX + 10, y + 82, {
      width: rightW - 20,
      align: 'center',
      lineBreak: false,
    })
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(COLORS.navyDark)
    .text(textValue(form.meterReading), boxX + 10, y + 96, {
      width: rightW - 20,
      align: 'center',
      lineBreak: false,
    })
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(COLORS.textMuted)
    .text(textValue(form.meterReadingStatus), boxX + 10, y + 116, {
      width: rightW - 20,
      align: 'center',
      lineBreak: false,
    })

  doc.y = y + boxH + 12
}

function drawObservacoes(doc: PdfDocument) {
  drawSectionTitle(doc, 5, 'OBSERVAÇÕES')
  ensureSpace(doc, 54)
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(COLORS.textMuted)
    .text(
      'Este laudo é válido somente para o medidor identificado neste documento e para as condições de ensaio registradas. O cliente poderá comparecer a uma loja de atendimento ou interpor recurso no prazo de 15 dias, nos termos da Resolução Normativa ANEEL nº 1.000/2021. A análise observou os procedimentos da Portaria INMETRO nº 493/2021, admitindo erros máximos para medidores em serviço conforme regulamentação vigente.',
      PAGE.margin,
      doc.y,
      { width: CONTENT_WIDTH, align: 'justify' },
    )
  doc.y += 10
}

function drawAssinaturas(doc: PdfDocument, laudo: RatmLaudoPdfInput) {
  ensureSpace(doc, 110)
  const y = doc.y
  const gap = 12
  const boxW = (CONTENT_WIDTH - gap * 2) / 3
  const elaborador = textValue(laudo.formData.fieldInspectionBy || laudo.createdByName)
  const boxes = [
    { title: 'ELABORADO POR', name: elaborador, role: 'Técnico do Laboratório' },
    { title: 'REVISADO POR', name: '—', role: 'Responsável Técnico' },
    {
      title: 'APROVADO POR',
      name: laudo.status === 'Aprovado' ? textValue(laudo.createdByName) : '—',
      role: 'Aprovador do Laudo',
    },
  ]

  boxes.forEach((box, index) => {
    const x = PAGE.margin + index * (boxW + gap)
    doc.roundedRect(x, y, boxW, 88, 8).strokeColor(COLORS.grayBorder).lineWidth(1).stroke()
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor(COLORS.textMuted)
      .text(box.title, x + 8, y + 8, { width: boxW - 16, align: 'center', lineBreak: false })
    doc
      .moveTo(x + 18, y + 42)
      .lineTo(x + boxW - 18, y + 42)
      .strokeColor(COLORS.grayBorder)
      .lineWidth(0.8)
      .stroke()
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(COLORS.text)
      .text(box.name, x + 8, y + 48, { width: boxW - 16, align: 'center', lineBreak: false })
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(COLORS.textMuted)
      .text(box.role, x + 8, y + 62, { width: boxW - 16, align: 'center', lineBreak: false })
    if (laudo.createdByRegistration && index === 0) {
      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(COLORS.textLight)
        .text(`Matrícula ${laudo.createdByRegistration}`, x + 8, y + 74, {
          width: boxW - 16,
          align: 'center',
          lineBreak: false,
        })
    }
  })

  doc.y = y + 100
}

function drawAccreditation(doc: PdfDocument) {
  ensureSpace(doc, 46)
  const y = doc.y
  doc.roundedRect(PAGE.margin, y, CONTENT_WIDTH, 40, 6).fillAndStroke(COLORS.graySoft, COLORS.grayBorder)
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(COLORS.navy)
    .text('Credenciamento / Qualidade', PAGE.margin + 12, y + 8, { lineBreak: false })
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(COLORS.textMuted)
    .text(
      'Ensaios conduzidos sob sistema de gestão alinhado à ABNT NBR ISO/IEC 17025 e procedimentos metrológicos do Laboratório de Medição EDP SP.',
      PAGE.margin + 12,
      y + 20,
      { width: CONTENT_WIDTH - 24 },
    )
  doc.y = y + 48
}

function drawPhotos(doc: PdfDocument, photos: string[]) {
  if (!photos.length) return
  doc.addPage()
  doc.y = PAGE.margin
  drawSectionTitle(doc, 6, 'REGISTRO FOTOGRÁFICO')

  const columns = 2
  const gap = 12
  const cellWidth = (CONTENT_WIDTH - gap) / columns
  const imageHeight = 150
  const cellHeight = imageHeight + 28
  let rowY = doc.y

  photos.forEach((photo, index) => {
    const column = index % columns
    if (column === 0) {
      ensureSpace(doc, cellHeight + 8)
      rowY = doc.y
    }
    const x = PAGE.margin + column * (cellWidth + gap)
    const match = photo.match(/^data:image\/\w+;base64,(.+)$/)
    doc.roundedRect(x, rowY, cellWidth, cellHeight, 8).strokeColor(COLORS.grayBorder).lineWidth(1).stroke()
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(COLORS.navy)
      .text(`Foto ${index + 1}`, x + 8, rowY + 6, { lineBreak: false })
    if (match) {
      const buffer = Buffer.from(match[1], 'base64')
      doc.save()
      doc.roundedRect(x + 8, rowY + 20, cellWidth - 16, imageHeight, 4).clip()
      doc.image(buffer, x + 8, rowY + 20, {
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

export function generateRatmLaudoPdf(laudo: RatmLaudoPdfInput, res: Response) {
  const form = laudo.formData
  const fraud = isFraudConclusion(form)
  const conclusion = fraud
    ? 'Constatada fraude no medidor de energia elétrica.'
    : 'Não constatada irregularidade no medidor de energia elétrica.'

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
      Title: `Laudo de Perícia ${buildLaudoNumber(laudo)} - Medidor ${laudo.meter}`,
      Author: 'EDP SP - Laboratório de Medição',
      Subject: 'Laudo de Perícia / Fraude em Medidor',
    },
  })

  doc.pipe(res)

  drawHeader(doc, laudo, conclusion)
  drawDadosGerais(doc, laudo)
  drawProcedimentos(doc)
  drawEnsaios(doc, form)
  drawResultado(doc, laudo, fraud)
  drawObservacoes(doc)
  drawAssinaturas(doc, laudo)
  drawAccreditation(doc)

  const photos = Array.isArray(form.photos)
    ? form.photos.filter((photo): photo is string => typeof photo === 'string' && photo.startsWith('data:image/'))
    : []
  drawPhotos(doc, photos)

  const range = doc.bufferedPageRange()
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index)
    drawFooter(doc, index + 1, range.count)
  }

  doc.flushPages()
  doc.end()
}
