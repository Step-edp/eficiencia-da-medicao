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

const PAGE_MARGIN = 48
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2

function textValue(value: unknown) {
  if (value === null || value === undefined) {
    return '—'
  }

  const normalized = String(value).trim()
  return normalized || '—'
}

function formatDateTime(isoDate: string) {
  return new Date(isoDate).toLocaleString('pt-BR')
}

function formatScheduleDate(form: Record<string, unknown>) {
  const date = textValue(form.scheduleDate)
  if (date === '—') {
    return '—'
  }

  const [year, month, day] = date.split('-')
  const hour = textValue(form.scheduleHour)
  const minute = textValue(form.scheduleMinute)
  return `${day}/${month}/${year} ${hour}:${minute}`
}

function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/)
  if (!match) {
    return null
  }

  return Buffer.from(match[1], 'base64')
}

function drawSectionTitle(doc: PdfDocument, title: string) {
  doc.moveDown(0.8)
  doc
    .fillColor('#0B3D2E')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(title.toUpperCase(), PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      underline: true,
    })
  doc.moveDown(0.4)
  doc.fillColor('#111111').font('Helvetica').fontSize(10)
}

function drawFieldRow(doc: PdfDocument, label: string, value: string) {
  const y = doc.y

  if (y > 740) {
    doc.addPage()
    drawPageFooter(doc)
  }

  doc
    .font('Helvetica-Bold')
    .fillColor('#333333')
    .text(`${label}:`, PAGE_MARGIN, doc.y, { continued: true, width: CONTENT_WIDTH })
  doc.font('Helvetica').fillColor('#111111').text(` ${value}`, {
    width: CONTENT_WIDTH,
  })
  doc.moveDown(0.15)
}

function drawPageFooter(doc: PdfDocument) {
  const footerY = 805
  doc
    .strokeColor('#18D8F0')
    .lineWidth(0.5)
    .moveTo(PAGE_MARGIN, footerY)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, footerY)
    .stroke()

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#666666')
    .text(
      'Documento gerado eletronicamente pelo Sistema Eficiência da Medição — EDP. Laudo técnico de perícia metrológica.',
      PAGE_MARGIN,
      footerY + 8,
      { width: CONTENT_WIDTH, align: 'center' },
    )
}

function buildConclusion(form: Record<string, unknown>) {
  const reproaches = [
    form.visualTest === 'Reprovado' ? 'ensaio visual reprovado' : null,
    form.dielectric === 'Reprovado' ? 'ensaio dielétrico reprovado' : null,
    form.march === 'Reprovado' ? 'marcha reprovada' : null,
    form.recorder === 'Reprovado' ? 'registrador reprovado' : null,
    form.dielectricFailed === 'Sim' ? 'reprovação no teste dielétrico' : null,
    form.brokenMeter === 'Sim' ? 'medidor quebrado ou furado' : null,
    form.damagedCoil === 'Sim' ? 'bobina danificada' : null,
  ].filter(Boolean)

  if (reproaches.length > 0) {
    return `Com base nos ensaios realizados, constatou-se situação técnica incompatível com operação regular, destacando-se: ${reproaches.join(', ')}. Recomenda-se análise complementar conforme normas internas da EDP e procedimentos do Laboratório de Medição.`
  }

  if (form.apparentlyInOrder === 'Sim') {
    return 'Os ensaios realizados indicam que o equipamento encontra-se aparentemente em ordem, sem indícios relevantes de comprometimento metrológico nos testes executados.'
  }

  return 'Os ensaios laboratoriais foram concluídos e registrados neste laudo técnico de perícia metrológica, para fins de rastreabilidade, auditoria e deliberação da área responsável.'
}

export function generateRatmLaudoPdf(laudo: RatmLaudoPdfInput, res: Response) {
  const form = laudo.formData
  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: PAGE_MARGIN,
      bottom: PAGE_MARGIN,
      left: PAGE_MARGIN,
      right: PAGE_MARGIN,
    },
    info: {
      Title: `Laudo RATM ${laudo.ratmNumber} - Medidor ${laudo.meter}`,
      Author: 'EDP - Laboratório de Medição',
      Subject: 'Laudo Técnico de Perícia Metrológica',
    },
  })

  doc.pipe(res)

  doc
    .rect(PAGE_MARGIN, 40, CONTENT_WIDTH, 78)
    .fillAndStroke('#0A2A44', '#18D8F0')

  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('EDP', PAGE_MARGIN + 16, 54)

  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .text('LAUDO TÉCNICO DE PERÍCIA METROLÓGICA', PAGE_MARGIN + 70, 52, {
      width: CONTENT_WIDTH - 86,
      align: 'right',
    })

  doc
    .font('Helvetica')
    .fontSize(9)
    .text('Laboratório de Medição | Eficiência da Medição', PAGE_MARGIN + 70, 72, {
      width: CONTENT_WIDTH - 86,
      align: 'right',
    })

  doc
    .fontSize(8.5)
    .text('Documento oficial para registro, rastreabilidade e aprovação de RATM', PAGE_MARGIN + 70, 88, {
      width: CONTENT_WIDTH - 86,
      align: 'right',
    })

  doc.y = 130
  doc.fillColor('#111111')

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(`Laudo nº ${laudo.id}`, PAGE_MARGIN, doc.y)
  doc
    .font('Helvetica')
    .text(`RATM ${laudo.ratmNumber} | Status: ${laudo.status}`, PAGE_MARGIN, doc.y + 14)
  doc.text(`Emitido em: ${formatDateTime(laudo.createdAt)}`, PAGE_MARGIN, doc.y + 14)

  drawSectionTitle(doc, '1. Identificação do objeto periciado')
  drawFieldRow(doc, 'Nº do medidor', textValue(form.meter))
  drawFieldRow(doc, 'Status do medidor', textValue(form.meterStatus))
  drawFieldRow(doc, 'Cliente / instalação', laudo.client)
  drawFieldRow(doc, 'Data de agendamento', formatScheduleDate(form))
  drawFieldRow(doc, 'Análise a pedido de', textValue(form.analysisRequest))
  drawFieldRow(doc, 'Cliente acompanhou ensaio', textValue(form.clientAccompanied))
  drawFieldRow(doc, 'Mesa de ensaio', textValue(form.testBench))
  drawFieldRow(doc, 'Item verificado', textValue(form.itemLookup))

  drawSectionTitle(doc, '2. Inspeção de lacres e invólucro')
  drawFieldRow(doc, 'Lacre do invólucro', textValue(form.enclosureSeal))
  drawFieldRow(doc, 'Status do invólucro', textValue(form.enclosureStatus))
  drawFieldRow(doc, 'Lacre 1', textValue(form.seal1))
  drawFieldRow(doc, 'Status lacre 1', textValue(form.seal1Status))
  drawFieldRow(doc, 'Lacre 2', textValue(form.seal2))
  drawFieldRow(doc, 'Status lacre 2', textValue(form.seal2Status))
  drawFieldRow(doc, 'Leitura do medidor', textValue(form.meterReading))
  drawFieldRow(doc, 'Status da leitura', textValue(form.meterReadingStatus))

  drawSectionTitle(doc, '3. Ensaios metrológicos realizados')
  drawFieldRow(doc, 'Ensaio visual', textValue(form.visualTest))
  drawFieldRow(doc, 'Ensaio dielétrico', textValue(form.dielectric))
  drawFieldRow(doc, 'CN', textValue(form.cn))
  drawFieldRow(doc, 'CI', textValue(form.ci))
  drawFieldRow(doc, 'CP', textValue(form.cp))
  drawFieldRow(doc, 'CN_R_I', textValue(form.cnRi))
  drawFieldRow(doc, 'CN_R_C', textValue(form.cnRc))
  drawFieldRow(doc, 'Marcha', textValue(form.march))
  drawFieldRow(doc, 'Registrador', textValue(form.recorder))
  drawFieldRow(doc, 'Fase interrompida', textValue(form.interruptedPhase))
  drawFieldRow(doc, 'Opção de fase', textValue(form.interruptedPhaseOption))

  drawSectionTitle(doc, '4. Resultados de ensaio em campo e laboratório')
  drawFieldRow(doc, 'Medidor quebrado/furado', textValue(form.brokenMeter))
  drawFieldRow(doc, 'Display apagado/não liga', textValue(form.displayOff))
  drawFieldRow(doc, 'Facilidade de acesso ao interior', textValue(form.meterInteriorAccess))
  drawFieldRow(doc, 'Bobina danificada', textValue(form.damagedCoil))
  drawFieldRow(doc, 'Aparentemente em ordem', textValue(form.apparentlyInOrder))
  drawFieldRow(doc, 'Reprovado dielétrico', textValue(form.dielectricFailed))
  drawFieldRow(doc, 'Corpo estranho no interior', textValue(form.foreignBodyInMeter))
  drawFieldRow(doc, 'Tipo NS', textValue(form.nsType))

  drawSectionTitle(doc, '5. Irregularidades e observações')
  const irregularityCode = textValue(form.irregularityCode)
  const irregularityDescription =
    IRREGULARITY_CODES[irregularityCode] ?? 'Não especificada'
  drawFieldRow(doc, 'Código de irregularidade', `${irregularityCode} - ${irregularityDescription}`)
  drawFieldRow(doc, 'Observações de irregularidade', textValue(form.irregularityNotes))
  drawFieldRow(doc, 'Laudo de campo correto', textValue(form.fieldReportCorrect))
  const fieldCode = textValue(form.fieldIrregularityCode)
  const fieldDescription = IRREGULARITY_CODES[fieldCode] ?? 'Não especificada'
  drawFieldRow(
    doc,
    'Irregularidade constatada em campo',
    `${fieldCode} - ${fieldDescription}`,
  )
  drawFieldRow(doc, 'Observações para laboratório', textValue(form.laboratoryNotes))
  drawFieldRow(doc, 'Inspeção de campo realizada por', textValue(form.fieldInspectionBy))

  drawSectionTitle(doc, '6. Parecer técnico conclusivo')
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#111111')
    .text(buildConclusion(form), PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      align: 'justify',
      lineGap: 3,
    })

  const photos = Array.isArray(form.photos)
    ? form.photos.filter((photo): photo is string => typeof photo === 'string' && photo.length > 0)
    : []

  if (photos.length > 0) {
    doc.addPage()
    drawPageFooter(doc)
    drawSectionTitle(doc, '7. Registro fotográfico da perícia')

    photos.forEach((photo, index) => {
      const buffer = dataUrlToBuffer(photo)
      if (!buffer) {
        return
      }

      if (doc.y > 620) {
        doc.addPage()
        drawPageFooter(doc)
      }

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#333333')
        .text(`Foto ${index + 1}`, PAGE_MARGIN, doc.y)
      doc.moveDown(0.3)

      const imageY = doc.y
      doc.image(buffer, PAGE_MARGIN, imageY, {
        fit: [CONTENT_WIDTH, 220],
        align: 'center',
      })
      doc.y = imageY + 230
    })
  }

  if (doc.y > 680) {
    doc.addPage()
  }

  drawSectionTitle(doc, '8. Responsáveis técnicos')
  doc.moveDown(0.5)
  const signatureY = doc.y + 40
  doc
    .moveTo(PAGE_MARGIN, signatureY)
    .lineTo(PAGE_MARGIN + 220, signatureY)
    .strokeColor('#333333')
    .stroke()
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#333333')
    .text('Perito responsável pelo ensaio', PAGE_MARGIN, signatureY + 6, { width: 220, align: 'center' })

  doc
    .moveTo(PAGE_MARGIN + 260, signatureY)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, signatureY)
    .stroke()
  doc.text('Responsável pela aprovação', PAGE_MARGIN + 260, signatureY + 6, {
    width: CONTENT_WIDTH - 260,
    align: 'center',
  })

  drawPageFooter(doc)
  doc.end()
}
