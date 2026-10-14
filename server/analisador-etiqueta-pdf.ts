import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { Resvg } from '@resvg/resvg-js'
import type { Response } from 'express'
import { formatIsoDate } from './analisador-calibracao.js'

type PdfDocument = InstanceType<typeof PDFDocument>

const PAGE = { width: 595.28, height: 841.89, marginX: 18, marginY: 22 }
const COLS = 3
const GAP_X = 10
const GAP_Y = 12
const LABEL_H = 108
const QR_SIZE = 48

export type AnalisadorEtiquetaItem = {
  numeroSerie: string
  identificacaoLaudo: string
  dataCalibracao: string | null
  resultado: 'Aprovado' | 'Reprovado'
  certificadoUrl: string
}

let cachedLogo: Buffer | null | undefined

function loadEtiquetaLogo() {
  if (cachedLogo !== undefined) return cachedLogo
  const here = path.dirname(fileURLToPath(import.meta.url))
  const roots = [
    path.join(process.cwd(), 'public', 'logo'),
    path.join(process.cwd(), 'dist', 'logo'),
    path.join(here, '../public/logo'),
    path.join(here, '../../public/logo'),
    path.join(here, '../../dist/logo'),
  ]
  const file = roots
    .map((root) => path.join(root, 'EDP_2022.svg'))
    .find((candidate) => existsSync(candidate))
  if (!file) {
    cachedLogo = null
    return null
  }
  try {
    const svg = readFileSync(file)
    cachedLogo = Buffer.from(
      new Resvg(svg, {
        fitTo: { mode: 'height', value: 64 },
        background: 'rgba(0,0,0,0)',
      })
        .render()
        .asPng(),
    )
  } catch {
    cachedLogo = null
  }
  return cachedLogo
}

function labelWidth() {
  return (PAGE.width - PAGE.marginX * 2 - GAP_X * (COLS - 1)) / COLS
}

function drawLabel(
  doc: PdfDocument,
  item: AnalisadorEtiquetaItem,
  qr: Buffer,
  x: number,
  y: number,
  width: number,
) {
  const logo = loadEtiquetaLogo()
  const logoH = 14
  const logoW = logo ? Math.min(46, logoH * (logo.readUInt32BE(16) / logo.readUInt32BE(20))) : 0
  if (logo) doc.image(logo, x, y, { width: logoW, height: logoH })
  doc.image(qr, x + width - QR_SIZE, y, { width: QR_SIZE, height: QR_SIZE })

  const textX = x
  const textW = width - QR_SIZE - 8
  const line = (value: string, top: number, size: number, align: 'left' | 'center' = 'left') => {
    doc.font('Helvetica-Bold').fontSize(size).fillColor('#111111').text(value, textX, top, {
      width: textW,
      height: size + 2,
      align,
      lineBreak: false,
    })
  }

  line('LABORATÓRIO DE MEDIÇÃO-SP', y + 16, 6)
  line(`EQUIPAMENTO: ${item.numeroSerie}`, y + 28, 7)
  line(`N° CERTIFICADO: ${item.identificacaoLaudo || '—'}`, y + 40, 7)
  line(`STATUS: ${item.resultado === 'Aprovado' ? 'APROVADO' : 'REPROVADO'}`, y + 52, 7)
  line(`DATA DE CALIBRAÇÃO: ${formatIsoDate(item.dataCalibracao)}`, y + 64, 7)
  line('*VÁLIDO POR 24 MESES', y + 78, 6.2, 'center')
}

export async function sendAnalisadorEtiquetasPdf(res: Response, items: AnalisadorEtiquetaItem[]) {
  const fileName = 'Etiquetas_calibracao.pdf'
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`)

  const qrByUrl = new Map<string, Buffer>()
  for (const item of items) {
    if (qrByUrl.has(item.certificadoUrl)) continue
    qrByUrl.set(
      item.certificadoUrl,
      await QRCode.toBuffer(item.certificadoUrl, {
        type: 'png',
        margin: 1,
        width: 256,
        errorCorrectionLevel: 'M',
      }),
    )
  }

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: PAGE.marginY, bottom: PAGE.marginY, left: PAGE.marginX, right: PAGE.marginX },
    info: {
      Title: 'Etiquetas de calibração',
      Author: 'EDP SP - Laboratório de Medição',
      Subject: 'Etiquetas de calibração de analisadores de tensão',
    },
  })
  doc.pipe(res)

  const width = labelWidth()
  const perPage = COLS * Math.floor((PAGE.height - PAGE.marginY * 2 + GAP_Y) / (LABEL_H + GAP_Y))
  items.forEach((item, index) => {
    const onPage = index % perPage
    if (index > 0 && onPage === 0) doc.addPage()
    const col = onPage % COLS
    const row = Math.floor(onPage / COLS)
    const x = PAGE.marginX + col * (width + GAP_X)
    const y = PAGE.marginY + row * (LABEL_H + GAP_Y)
    drawLabel(doc, item, qrByUrl.get(item.certificadoUrl)!, x, y, width)
  })

  doc.end()
}
