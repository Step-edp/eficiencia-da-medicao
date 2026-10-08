import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
  navy: '#031424',
  navyMid: '#0e3157',
  cyan: '#18d8f0',
  text: '#102033',
  muted: '#4d6478',
  line: '#c5dde8',
  soft: '#e7f6fa',
  card: '#f4fbfd',
  red: '#d22b4a',
  white: '#FFFFFF',
}

let cachedLogo: Buffer | null | undefined

function loadEdpLogo() {
  if (cachedLogo !== undefined) return cachedLogo
  const here = path.dirname(fileURLToPath(import.meta.url))
  const names = ['edp-logo.png', 'Logso edp branca.png']
  const roots = [
    path.join(process.cwd(), 'public', 'logo'),
    path.join(process.cwd(), 'dist', 'logo'),
    path.join(here, '../public/logo'),
    path.join(here, '../../public/logo'),
    path.join(here, '../../dist/logo'),
  ]
  for (const root of roots) {
    for (const name of names) {
      const candidate = path.join(root, name)
      if (!existsSync(candidate)) continue
      cachedLogo = readFileSync(candidate)
      return cachedLogo
    }
  }
  cachedLogo = null
  return null
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
  doc.roundedRect(x, y, width, height, 6).lineWidth(0.6).fillAndStroke(COLORS.card, COLORS.line)
  doc.rect(x, y + 6, 3, height - 12).fill(COLORS.cyan)
  doc
    .fillColor(COLORS.navyMid)
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

  const headerH = 52
  doc.rect(0, 0, PAGE.width, headerH).fill(COLORS.navy)
  doc.rect(0, headerH, PAGE.width, 3).fill(COLORS.cyan)

  const logo = loadEdpLogo()
  let titleX = PAGE.margin
  if (logo && logo.length >= 24) {
    const pngWidth = logo.readUInt32BE(16)
    const pngHeight = logo.readUInt32BE(20)
    const logoHeight = 30
    const logoWidth = pngHeight > 0 ? Math.round(logoHeight * (pngWidth / pngHeight)) : 82
    doc.image(logo, 20, 11, { width: logoWidth, height: logoHeight })
    titleX = 20 + logoWidth + 14
  }

  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(15).text('CERTIFICADO DE CALIBRAÇÃO', titleX, 18, {
    width: CONTENT_WIDTH - (titleX - PAGE.margin) - 160,
    lineBreak: false,
  })
  doc.fillColor(COLORS.cyan).font('Helvetica').fontSize(9).text(laudo.identificacaoLaudo || '—', PAGE.width - PAGE.margin - 180, 19, {
    width: 180,
    align: 'right',
    lineBreak: false,
  })

  const gap = 12
  const cardW = (CONTENT_WIDTH - gap) / 2
  const cardY = headerH + 16
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
  drawCell(x, y, tensaoW, '', { fill: COLORS.navyMid })
  x += tensaoW
  for (const fase of ['Fase A', 'Fase B', 'Fase C']) {
    drawCell(x, y, faseW, fase, { bold: true, fill: COLORS.navyMid, color: COLORS.white })
    x += faseW
  }
  drawCell(x, y, resultW, 'Resultado', { bold: true, fill: COLORS.navyMid, color: COLORS.white })

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
      color: aprovado ? '#1FA971' : COLORS.red,
    })
  }

  y += rowH + 14
  const geralAprovado = laudo.certificado.resultado === 'Aprovado'
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.text)
  doc.text('Resultado: ', PAGE.margin, y, { lineBreak: false, continued: true })
  doc.fillColor(geralAprovado ? '#1FA971' : COLORS.red).text(geralAprovado ? 'APROVADO' : 'REPROVADO', {
    lineBreak: false,
  })
  y += 18
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
