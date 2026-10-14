import PDFDocument from 'pdfkit'
import type { Response } from 'express'
import { formatIsoDate } from './analisador-calibracao.js'
import type { AnalisadorLaudoPdfInput } from './analisador-laudo-pdf.js'

type PdfDocument = InstanceType<typeof PDFDocument>

const PAGE = { width: 360, height: 228, margin: 16 }

function safeFilePart(value: string) {
  const cleaned = value.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned.slice(0, 40) || 'analisador'
}

function field(doc: PdfDocument, x: number, y: number, label: string, value: string, width: number) {
  doc.font('Helvetica').fontSize(7).fillColor('#4d6478').text(label, x, y, { width, lineBreak: false })
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#102033')
    .text(value || '—', x, y + 10, { width, lineBreak: false })
}

export function sendAnalisadorEtiquetaPdf(res: Response, laudo: AnalisadorLaudoPdfInput) {
  const fileName = `Etiqueta_${safeFilePart(laudo.numeroSerie)}.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`)

  const doc = new PDFDocument({
    size: [PAGE.width, PAGE.height],
    margins: {
      top: PAGE.margin,
      bottom: PAGE.margin,
      left: PAGE.margin,
      right: PAGE.margin,
    },
    info: {
      Title: `Etiqueta ${laudo.identificacaoLaudo || laudo.numeroSerie}`,
      Author: 'EDP SP - Laboratório de Medição',
      Subject: 'Etiqueta de calibração de analisador de tensão',
    },
  })
  doc.pipe(res)

  doc.rect(0, 0, PAGE.width, 36).fill('#031424')
  doc.rect(0, 36, PAGE.width, 3).fill('#18d8f0')
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text('ETIQUETA DE CALIBRAÇÃO', PAGE.margin, 8, {
    width: PAGE.width - PAGE.margin * 2 - 120,
    lineBreak: false,
  })
  doc.fillColor('#18d8f0').font('Helvetica').fontSize(8).text(laudo.identificacaoLaudo || '—', PAGE.width - PAGE.margin - 130, 12, {
    width: 130,
    align: 'right',
    lineBreak: false,
  })

  const aprovado = laudo.certificado.resultado === 'Aprovado'
  const colW = (PAGE.width - PAGE.margin * 2 - 12) / 2
  const left = PAGE.margin
  const right = PAGE.margin + colW + 12
  let y = 52
  field(doc, left, y, 'Nº SÉRIE', laudo.numeroSerie, colW)
  field(doc, right, y, 'PATRIMÔNIO', laudo.equipmentNumber, colW)
  y += 32
  field(doc, left, y, 'MODELO', laudo.modelo, colW)
  field(doc, right, y, 'CALIBRADO EM', formatIsoDate(laudo.dataCalibracao), colW)
  y += 32
  doc.font('Helvetica').fontSize(7).fillColor('#4d6478').text('RESULTADO', left, y, { width: colW, lineBreak: false })
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(aprovado ? '#1FA971' : '#d22b4a')
    .text(aprovado ? 'APROVADO' : 'REPROVADO', left, y + 10, { width: colW, lineBreak: false })
  doc.font('Helvetica').fontSize(7).fillColor('#4d6478').text('REALIZADO POR', left, y + 28, {
    width: PAGE.width - PAGE.margin * 2,
    lineBreak: false,
  })
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#102033').text(laudo.realizadoPor || '—', left, y + 38, {
    width: PAGE.width - PAGE.margin * 2,
    height: 24,
  })

  doc.font('Helvetica').fontSize(7).fillColor('#4d6478').text('EDP · Laboratório de Medição', PAGE.margin, PAGE.height - 28, {
    width: PAGE.width - PAGE.margin * 2,
    lineBreak: false,
  })

  doc.end()
}
