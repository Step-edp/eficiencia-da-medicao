import PDFDocument from 'pdfkit'
import type { Response } from 'express'
import {
  PADRAO_CALIBRACAO,
  formatClassePadrao,
  formatErroPercent,
  formatIsoDate,
  formatVolt,
  type CertificadoCalibracao,
  type FaseCalibracao,
} from './analisador-calibracao.js'

type PdfDocument = InstanceType<typeof PDFDocument>

export type AnalisadorLaudoPdfInput = {
  numeroSerie: string
  equipmentNumber: string
  identificacaoLaudo: string
  modelo: string
  fabricante: string
  classe: string
  vn: string
  vmax: string
  instrumento: string
  dataCalibracao: string | null
  certificado: CertificadoCalibracao
}

const PAGE = { width: 841.89, height: 595.28, margin: 32 }
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2

const COLORS = {
  navy: '#0B3A66',
  text: '#1F2A37',
  muted: '#5B6B7C',
  line: '#D7DEE7',
  soft: '#F4F7FA',
  green: '#1FA971',
  red: '#C62828',
  white: '#FFFFFF',
}

const FASES: FaseCalibracao[] = ['a', 'b', 'c']

function safeFilePart(value: string) {
  const cleaned = value.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned.slice(0, 40) || 'analisador'
}

export function buildAnalisadorLaudoFileName(numeroSerie: string) {
  return `Certificado_calibracao_${safeFilePart(numeroSerie)}.pdf`
}

function field(doc: PdfDocument, x: number, y: number, label: string, value: string, width: number) {
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted).text(label, x, y, { width, lineBreak: false })
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.text)
    .text(value || '—', x, y + 10, { width, lineBreak: false })
}

export function sendAnalisadorLaudoPdf(res: Response, laudo: AnalisadorLaudoPdfInput) {
  const fileName = buildAnalisadorLaudoFileName(laudo.numeroSerie)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: {
      top: PAGE.margin,
      bottom: PAGE.margin,
      left: PAGE.margin,
      right: PAGE.margin,
    },
    info: {
      Title: fileName.replace(/\.pdf$/, ''),
      Author: 'EDP SP - Laboratório de Medição',
      Subject: 'Certificado de calibração de analisador de tensão',
    },
  })
  doc.pipe(res)

  doc.rect(0, 0, PAGE.width, 46).fill(COLORS.navy)
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(16).text('CERTIFICADO DE CALIBRAÇÃO', PAGE.margin, 16, {
    width: CONTENT_WIDTH - 180,
    lineBreak: false,
  })
  doc.font('Helvetica').fontSize(9).text(laudo.identificacaoLaudo || '—', PAGE.width - PAGE.margin - 180, 18, {
    width: 180,
    align: 'right',
    lineBreak: false,
  })

  let y = 62
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(10).text('Padrão utilizado', PAGE.margin, y)
  y += 16
  const col = CONTENT_WIDTH / 4
  field(doc, PAGE.margin, y, 'INSTRUMENTO', PADRAO_CALIBRACAO.instrumento, col)
  field(doc, PAGE.margin + col, y, 'MODELO', PADRAO_CALIBRACAO.modelo, col + 40)
  field(doc, PAGE.margin + col * 2 + 40, y, 'Nº SÉRIE', PADRAO_CALIBRACAO.serie, col - 40)
  field(doc, PAGE.margin + col * 3, y, 'FABRICANTE', PADRAO_CALIBRACAO.fabricante, col)
  y += 32
  field(doc, PAGE.margin, y, 'CERTIFICADO', PADRAO_CALIBRACAO.certificado, col)
  field(doc, PAGE.margin + col, y, 'CLASSE', formatClassePadrao(PADRAO_CALIBRACAO.classe), col)
  field(doc, PAGE.margin + col * 2, y, 'CALIBRADO EM', formatIsoDate(PADRAO_CALIBRACAO.calibradoEm), col)
  field(doc, PAGE.margin + col * 3, y, 'PRÓXIMA CALIBRAÇÃO', formatIsoDate(PADRAO_CALIBRACAO.proximaCalibracao), col)

  y += 40
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(10).text('Instrumento calibrado', PAGE.margin, y)
  y += 16
  field(doc, PAGE.margin, y, 'INSTRUMENTO', laudo.instrumento, col * 1.6)
  field(doc, PAGE.margin + col * 1.6, y, 'FABRICANTE', laudo.fabricante, col)
  field(doc, PAGE.margin + col * 2.6, y, 'MODELO', laudo.modelo, col * 0.7)
  field(doc, PAGE.margin + col * 3.3, y, 'PATRIMÔNIO', laudo.equipmentNumber, col * 0.7)
  y += 32
  field(doc, PAGE.margin, y, 'Nº SÉRIE', laudo.numeroSerie, col)
  field(doc, PAGE.margin + col, y, 'CLASSE', laudo.classe, col)
  field(doc, PAGE.margin + col * 2, y, 'VN', laudo.vn, col)
  field(doc, PAGE.margin + col * 3, y, 'Vmáx', laudo.vmax, col)

  y += 36
  doc
    .fillColor(COLORS.text)
    .font('Helvetica')
    .fontSize(8)
    .text(`Classe de exatidão: ${laudo.classe} - ${laudo.vn} a ${laudo.vmax}`, PAGE.margin, y)

  y += 18
  const tensaoW = 58
  const resultW = 78
  const faseW = (CONTENT_WIDTH - tensaoW - resultW) / 3
  const cellW = faseW / 4
  const rowH = 18

  const drawCell = (
    x: number,
    top: number,
    width: number,
    text: string,
    options?: { bold?: boolean; fill?: string; color?: string; align?: 'left' | 'center' },
  ) => {
    doc.rect(x, top, width, rowH).fillAndStroke(options?.fill ?? COLORS.white, COLORS.line)
    doc
      .fillColor(options?.color ?? COLORS.text)
      .font(options?.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(7.5)
      .text(text, x + 3, top + 5, {
        width: width - 6,
        align: options?.align ?? 'center',
        lineBreak: false,
      })
  }

  let x = PAGE.margin
  drawCell(x, y, tensaoW, '', { fill: COLORS.navy })
  x += tensaoW
  for (const fase of ['Fase A', 'Fase B', 'Fase C']) {
    drawCell(x, y, faseW, fase, { bold: true, fill: COLORS.navy, color: COLORS.white })
    x += faseW
  }
  drawCell(x, y, resultW, 'Resultado', { bold: true, fill: COLORS.navy, color: COLORS.white })

  y += rowH
  x = PAGE.margin
  drawCell(x, y, tensaoW, 'Tensão', { bold: true, fill: COLORS.soft })
  x += tensaoW
  for (let fase = 0; fase < 3; fase += 1) {
    for (const label of ['UMP', 'UST', 'Erro(%)', 'U(%)']) {
      drawCell(x, y, cellW, label, { bold: true, fill: COLORS.soft })
      x += cellW
    }
  }
  drawCell(x, y, resultW, '', { fill: COLORS.soft })

  for (const tensao of laudo.certificado.tensoes) {
    y += rowH
    x = PAGE.margin
    drawCell(x, y, tensaoW, tensao.voltage, { bold: true, align: 'left' })
    x += tensaoW
    for (const fase of FASES) {
      const resultado = tensao.fases[fase]
      drawCell(x, y, cellW, formatVolt(resultado.ump))
      x += cellW
      drawCell(x, y, cellW, formatVolt(resultado.ust))
      x += cellW
      drawCell(x, y, cellW, formatErroPercent(resultado.erro))
      x += cellW
      drawCell(x, y, cellW, formatErroPercent(resultado.incerteza))
      x += cellW
    }
    const aprovado = tensao.aprovado
    drawCell(x, y, resultW, aprovado ? 'APROVADO' : 'REPROVADO', {
      bold: true,
      color: aprovado ? COLORS.green : COLORS.red,
    })
  }

  y += rowH + 16
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
  const notes = [
    'UMP: unidade de medida do padrão. UST: unidade sendo testada.',
    'Erro: maior erro absoluto entre as cinco leituras, (UST − UMP) / UMP.',
    'U: incerteza expandida, incerteza combinada multiplicada pelo fator de abrangência K de uma distribuição t, com probabilidade de 95%.',
    'Aprovado quando o erro somado e subtraído da incerteza permanece dentro de ±1% em todas as fases.',
  ]
  for (const note of notes) {
    doc.text(note, PAGE.margin, y, { width: CONTENT_WIDTH })
    y = doc.y + 3
  }

  y += 12
  const signW = CONTENT_WIDTH / 3
  field(doc, PAGE.margin, y, 'REALIZADO POR', PADRAO_CALIBRACAO.realizadoPor, signW)
  field(doc, PAGE.margin + signW, y, 'APROVADO POR', PADRAO_CALIBRACAO.aprovadoPor, signW)
  field(doc, PAGE.margin + signW * 2, y, 'DATA DA CALIBRAÇÃO', formatIsoDate(laudo.dataCalibracao), signW)

  doc.end()
}
