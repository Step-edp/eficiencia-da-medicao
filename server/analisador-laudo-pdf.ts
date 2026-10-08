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
  doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.muted).text(label, x, y, { width, lineBreak: false })
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(COLORS.text)
    .text(value || '—', x, y + 9, { width, lineBreak: false })
}

function drawInfoCard(
  doc: PdfDocument,
  x: number,
  y: number,
  width: number,
  title: string,
  rows: Array<Array<{ label: string; value: string }>>,
) {
  const pad = 10
  const rowH = 26
  const height = 22 + rows.length * rowH + 8
  doc.roundedRect(x, y, width, height, 6).lineWidth(0.6).fillAndStroke('#F8FBFD', COLORS.line)
  doc
    .fillColor(COLORS.navy)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(title, x + pad, y + 8, { width: width - pad * 2, lineBreak: false })

  rows.forEach((row, index) => {
    const rowY = y + 24 + index * rowH
    const cellW = (width - pad * 2) / row.length
    row.forEach((cell, cellIndex) => {
      field(doc, x + pad + cellIndex * cellW, rowY, cell.label, cell.value, cellW - 6)
    })
  })

  return height
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

  const gap = 12
  const cardW = (CONTENT_WIDTH - gap) / 2
  const cardY = 58
  const padraoHeight = drawInfoCard(doc, PAGE.margin, cardY, cardW, 'Padrão utilizado', [
    [
      { label: 'INSTRUMENTO', value: PADRAO_CALIBRACAO.instrumento },
      { label: 'FABRICANTE', value: PADRAO_CALIBRACAO.fabricante },
    ],
    [
      { label: 'MODELO', value: PADRAO_CALIBRACAO.modelo },
      { label: 'Nº SÉRIE', value: PADRAO_CALIBRACAO.serie },
    ],
    [
      { label: 'CERTIFICADO', value: PADRAO_CALIBRACAO.certificado },
      { label: 'CLASSE', value: formatClassePadrao(PADRAO_CALIBRACAO.classe) },
    ],
    [
      { label: 'CALIBRADO EM', value: formatIsoDate(PADRAO_CALIBRACAO.calibradoEm) },
      { label: 'PRÓXIMA CALIBRAÇÃO', value: formatIsoDate(PADRAO_CALIBRACAO.proximaCalibracao) },
    ],
  ])
  drawInfoCard(doc, PAGE.margin + cardW + gap, cardY, cardW, 'Instrumento calibrado', [
    [{ label: 'INSTRUMENTO', value: laudo.instrumento }],
    [
      { label: 'FABRICANTE', value: laudo.fabricante },
      { label: 'MODELO', value: laudo.modelo },
    ],
    [
      { label: 'Nº SÉRIE', value: laudo.numeroSerie },
      { label: 'PATRIMÔNIO', value: laudo.equipmentNumber },
    ],
    [
      { label: 'CLASSE', value: `${laudo.classe} · ${laudo.vn} a ${laudo.vmax}` },
    ],
  ])

  let y = cardY + padraoHeight + 14
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

  y += rowH + 12
  const note =
    'UMP: unidade de medida do padrão. UST: unidade sendo testada. Erro: maior erro absoluto entre as cinco leituras, (UST − UMP) / UMP. U: incerteza expandida, com fator de abrangência K e probabilidade de 95%. Aprovado quando o erro somado e subtraído da incerteza permanece dentro de ±1% em todas as fases.'
  doc.font('Helvetica').fontSize(7.5)
  const noteHeight = doc.heightOfString(note, { width: CONTENT_WIDTH, lineGap: 1 })
  doc.fillColor(COLORS.muted).text(note, PAGE.margin, y, {
    width: CONTENT_WIDTH,
    height: noteHeight + 2,
    lineGap: 1,
  })
  y += noteHeight + 14
  const signH = 36
  const signGap = 8
  const signW = (CONTENT_WIDTH - signGap * 2) / 3
  const signs = [
    { label: 'REALIZADO POR', value: PADRAO_CALIBRACAO.realizadoPor },
    { label: 'APROVADO POR', value: PADRAO_CALIBRACAO.aprovadoPor },
    { label: 'DATA DA CALIBRAÇÃO', value: formatIsoDate(laudo.dataCalibracao) },
  ]
  signs.forEach((sign, index) => {
    const signX = PAGE.margin + index * (signW + signGap)
    doc.roundedRect(signX, y, signW, signH, 4).lineWidth(0.6).fillAndStroke(COLORS.white, COLORS.line)
    field(doc, signX + 8, y + 6, sign.label, sign.value, signW - 16)
  })

  doc.end()
}
