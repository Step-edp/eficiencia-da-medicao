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
  'Laboratório de Metrologia EDP SP - Av. Cassiano Ricardo, 1973 - Jardim Alvorada, São José dos Campos - SP'

const PAGE_MARGIN = 40
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2
const COLUMN_GAP = 18
const COLUMN_WIDTH = (CONTENT_WIDTH - COLUMN_GAP) / 2

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

function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/)
  if (!match) {
    return null
  }

  return Buffer.from(match[1], 'base64')
}

function ensureSpace(doc: PdfDocument, height = 60) {
  if (doc.y + height > 780) {
    doc.addPage()
  }
}

function drawMainTitle(doc: PdfDocument, ratmId: string) {
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#111111')
    .text('Relatório de Avaliação Técnica de Medidor RATM N°', PAGE_MARGIN, PAGE_MARGIN, {
      width: CONTENT_WIDTH,
      align: 'center',
    })

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(ratmId, PAGE_MARGIN, doc.y + 4, {
      width: CONTENT_WIDTH,
      align: 'center',
    })

  doc.moveDown(0.8)
}

function drawSectionHeader(doc: PdfDocument, title: string) {
  ensureSpace(doc, 40)

  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor('#111111')
    .text(title, PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      underline: true,
    })

  doc.moveDown(0.35)
}

function drawField(doc: PdfDocument, label: string, value: string) {
  ensureSpace(doc, 24)

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#222222')
    .text(label, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, continued: true })

  doc.font('Helvetica').fillColor('#111111').text(` ${value}`, { width: CONTENT_WIDTH })
  doc.moveDown(0.2)
}

function drawTwoColumnFields(
  doc: PdfDocument,
  rows: Array<[string, string, string, string]>,
) {
  rows.forEach(([leftLabel, leftValue, rightLabel, rightValue]) => {
    ensureSpace(doc, 28)
    const rowY = doc.y

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#222222')
      .text(`${leftLabel} `, PAGE_MARGIN, rowY, { continued: true, width: COLUMN_WIDTH })
    doc.font('Helvetica').fillColor('#111111').text(leftValue, { width: COLUMN_WIDTH })

    const rightX = PAGE_MARGIN + COLUMN_WIDTH + COLUMN_GAP
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#222222')
      .text(`${rightLabel} `, rightX, rowY, { continued: true, width: COLUMN_WIDTH })
    doc.font('Helvetica').fillColor('#111111').text(rightValue, { width: COLUMN_WIDTH })

    doc.y = rowY + 14
    doc.moveDown(0.15)
  })
}

function drawYesNoBlock(doc: PdfDocument, label: string, value: unknown) {
  ensureSpace(doc, 18)
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#111111')
    .text(`${label}: ${yesNo(value)}`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH })
  doc.moveDown(0.12)
}

function buildTechnicalReport(form: Record<string, unknown>) {
  if (form.apparentlyInOrder === 'Sim') {
    return 'MEDIDOR EM ORDEM'
  }

  if (form.visualTest === 'Reprovado' || form.dielectric === 'Reprovado' || form.march === 'Reprovado') {
    return 'MEDIDOR REPROVADO NOS ENSAIOS'
  }

  if (
    form.brokenMeter === 'Sim' ||
    form.damagedCoil === 'Sim' ||
    form.dielectricFailed === 'Sim'
  ) {
    return 'MEDIDOR COM NÃO CONFORMIDADE IDENTIFICADA'
  }

  return 'MEDIDOR EM ORDEM'
}

function buildRatmNumber(laudo: RatmLaudoPdfInput) {
  const year = new Date(laudo.createdAt).getFullYear()
  return `${laudo.ratmNumber}_${laudo.meter}_${year}`
}

export function generateRatmLaudoPdf(laudo: RatmLaudoPdfInput, res: Response) {
  const form = laudo.formData
  const irregularityCode = textValue(form.irregularityCode)
  const fieldIrregularityCode = textValue(form.fieldIrregularityCode)
  const irregularityDescription =
    IRREGULARITY_CODES[fieldIrregularityCode !== '—' ? fieldIrregularityCode : irregularityCode] ??
    'Não especificada'

  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: PAGE_MARGIN,
      bottom: PAGE_MARGIN,
      left: PAGE_MARGIN,
      right: PAGE_MARGIN,
    },
    info: {
      Title: `RATM ${buildRatmNumber(laudo)} - Medidor ${laudo.meter}`,
      Author: 'EDP - Laboratório de Medição',
      Subject: 'Relatório de Avaliação Técnica de Medidor RATM',
    },
  })

  doc.pipe(res)

  drawMainTitle(doc, buildRatmNumber(laudo))

  drawSectionHeader(doc, 'Dados da Instalação')
  drawTwoColumnFields(doc, [
    ['Cliente', laudo.client, 'Instalação', '—'],
    ['Medidor', textValue(form.meter), 'Leitura', textValue(form.meterReading)],
    ['Nota/TOI', '—', 'Status medidor', textValue(form.meterStatus)],
  ])

  drawSectionHeader(doc, 'Dados do Padrão')
  drawTwoColumnFields(doc, [
    ['Patrimônio/Serial', textValue(form.testBench), 'Modelo', textValue(form.itemLookup)],
    ['Fabricante', '—', 'Classe de exatidão', '—'],
    ['Validade certificado', '—', 'Certificado de calibração', '—'],
  ])
  drawField(doc, 'Local', LAB_LOCAL)

  drawSectionHeader(doc, 'Dados do Medidor')
  drawTwoColumnFields(doc, [
    ['1° lacre tampa', textValue(form.seal1), 'Status lacre 1', textValue(form.seal1Status)],
    ['2° lacre tampa', textValue(form.seal2), 'Status lacre 2', textValue(form.seal2Status)],
    ['N° medidor', textValue(form.meter), 'Lacre do invólucro', textValue(form.enclosureSeal)],
    ['Tipo', textValue(form.itemLookup), 'Status invólucro', textValue(form.enclosureStatus)],
    ['Fabricante', '—', 'Modelo', '—'],
  ])

  drawSectionHeader(doc, 'Resultados de ensaio')
  drawYesNoBlock(doc, 'Medidor quebrado/ Furado', form.brokenMeter)
  drawYesNoBlock(doc, 'Display apagado/ Não liga', form.displayOff)
  drawYesNoBlock(doc, 'Facilidade de acesso ao interior do medidor', form.meterInteriorAccess)
  drawYesNoBlock(doc, 'Bobina danificada', form.damagedCoil)
  drawYesNoBlock(doc, 'Aparentemente em ordem', form.apparentlyInOrder)
  drawYesNoBlock(doc, 'Reprovado no Dielétrico', form.dielectricFailed)
  drawYesNoBlock(doc, 'Corpo estranho no interior do medidor', form.foreignBodyInMeter)
  drawYesNoBlock(doc, 'Inspeção Geral', form.visualTest)
  drawYesNoBlock(doc, 'Borne queimado', form.interruptedPhase)

  drawSectionHeader(doc, 'Resultados de ensaio de Exatidão')
  drawTwoColumnFields(doc, [
    ['Exatidão Carga Pequena Ativa FP1:', textValue(form.cp), 'Exatidão Carga Nominal Ativa FP1:', textValue(form.cn)],
    [
      'Exatidão Carga Nominal Ativa FP 0,5 Ind:',
      textValue(form.ci),
      'Exatidão Carga Nominal Reativa FP 0,5 Ind:',
      textValue(form.cnRi),
    ],
    [
      'Exatidão Carga Nominal Reativa FP 0,8 Cap:',
      textValue(form.cnRc),
      'Registro de energia sem carga:',
      textValue(form.meterReadingPreset),
    ],
    ['Registrador/Mostrador:', textValue(form.recorder), 'Marcha:', textValue(form.march)],
    ['Ensaio visual:', textValue(form.visualTest), 'Dielétrico:', textValue(form.dielectric)],
  ])

  drawSectionHeader(doc, 'Relatório Técnico')
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#111111')
    .text(buildTechnicalReport(form), PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH })
  doc.moveDown(0.4)

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor('#222222')
    .text(
      'Análise realizada conforme procedimentos estabelecidos pela Portaria nº 493 de 10/12/2021, emitida pelo órgão metrológico oficial INMETRO, admitindo erros máximos para medidores em serviço de ±4,0% (diferente nos eletrônicos).',
      PAGE_MARGIN,
      doc.y,
      { width: CONTENT_WIDTH, align: 'justify', lineGap: 2 },
    )
  doc.moveDown(0.25)
  doc.text(
    'O Cliente deverá comparecer a uma loja de atendimento ou interpor recurso no prazo de 15 dias (ART.253 da resolução 1000 da ANEEL).',
    PAGE_MARGIN,
    doc.y,
    { width: CONTENT_WIDTH, align: 'justify', lineGap: 2 },
  )
  doc.moveDown(0.5)

  drawSectionHeader(doc, 'Irregularidades')
  drawField(doc, 'Descrição da Irregularidade', irregularityDescription)
  drawField(doc, 'Observações da Irregularidade', textValue(form.irregularityNotes))
  drawField(doc, 'Observações para Laboratório', textValue(form.laboratoryNotes))
  drawField(doc, 'Laudo de campo correto', textValue(form.fieldReportCorrect))
  drawField(doc, 'Tipo NS', textValue(form.nsType))

  drawSectionHeader(doc, 'Dados da Realização da Avaliação Técnica')
  drawTwoColumnFields(doc, [
    ['Realizado por:', textValue(form.fieldInspectionBy), 'Aprovado por:', '—'],
    ['Data:', formatDate(laudo.createdAt), 'Análise a Pedido:', textValue(form.analysisRequest)],
    [
      'Cliente compareceu a calibração?',
      textValue(form.clientAccompanied),
      'Status leitura:',
      textValue(form.meterReadingStatus),
    ],
    ['CN preset', textValue(form.cnPreset), 'CI preset', textValue(form.ciPreset)],
    ['CP preset', textValue(form.cpPreset), 'Fase interrompida', textValue(form.interruptedPhaseOption)],
  ])

  ensureSpace(doc, 70)
  doc.moveDown(0.6)
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#111111')
    .text('Assinatura do Cliente:', PAGE_MARGIN, doc.y)

  const signatureY = doc.y + 28
  doc
    .moveTo(PAGE_MARGIN, signatureY)
    .lineTo(PAGE_MARGIN + 220, signatureY)
    .strokeColor('#333333')
    .stroke()

  doc
    .moveTo(PAGE_MARGIN + 260, signatureY)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, signatureY)
    .stroke()

  doc
    .fontSize(8)
    .fillColor('#666666')
    .text('Realizado por', PAGE_MARGIN, signatureY + 6, { width: 220, align: 'center' })
  doc.text('Aprovado por', PAGE_MARGIN + 260, signatureY + 6, {
    width: CONTENT_WIDTH - 260,
    align: 'center',
  })

  const photos = Array.isArray(form.photos)
    ? form.photos.filter((photo): photo is string => typeof photo === 'string' && photo.length > 0)
    : []

  if (photos.length > 0) {
    doc.addPage()
    drawSectionHeader(doc, 'Registro Fotográfico')

    photos.forEach((photo, index) => {
      const buffer = dataUrlToBuffer(photo)
      if (!buffer) {
        return
      }

      ensureSpace(doc, 250)
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#333333')
        .text(`Foto ${index + 1}`, PAGE_MARGIN, doc.y)
      doc.moveDown(0.2)

      const imageY = doc.y
      doc.image(buffer, PAGE_MARGIN, imageY, {
        fit: [CONTENT_WIDTH, 200],
        align: 'center',
      })
      doc.y = imageY + 210
    })
  }

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor('#666666')
    .text(
      `Documento gerado eletronicamente — Eficiência da Medição | Laudo ${laudo.id} | Emitido em ${formatDate(laudo.createdAt)}`,
      PAGE_MARGIN,
      805,
      { width: CONTENT_WIDTH, align: 'center' },
    )

  doc.end()
}
