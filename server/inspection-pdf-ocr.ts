import { createCanvas } from '@napi-rs/canvas'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createWorker, type Worker } from 'tesseract.js'

const OCR_SCALE = 1.25
const MAX_OCR_PAGES = 6

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height)
    return { canvas, context: canvas.getContext('2d') }
  }

  reset(
    canvasAndContext: { canvas: { width: number; height: number } },
    width: number,
    height: number,
  ) {
    canvasAndContext.canvas.width = width
    canvasAndContext.canvas.height = height
  }

  destroy(canvasAndContext: { canvas: { width: number; height: number } }) {
    canvasAndContext.canvas.width = 0
    canvasAndContext.canvas.height = 0
  }
}

let ocrWorkerPromise: Promise<Worker> | null = null

async function getOcrWorker(): Promise<Worker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('por')
  }
  return ocrWorkerPromise
}

/** Pré-carrega o worker de OCR na subida do servidor (evita timeout na 1ª importação). */
export async function warmupInspectionOcr(): Promise<void> {
  await getOcrWorker()
}

export function isUnreadablePdfText(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return true

  const controlChars = (normalized.match(/[\u0000-\u001f\u007f-\u009f]/g) ?? []).length
  if (controlChars / normalized.length > 0.12) return true

  const letters = (normalized.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length
  if (letters / normalized.length < 0.04) return true

  return false
}

export type PdfOcrOptions = {
  scale?: number
  maxPages?: number
  topFraction?: number
  stopWhen?: (accumulatedText: string) => boolean
}

export async function extractInspectionPdfTextViaOcr(
  buffer: Buffer,
  options?: PdfOcrOptions,
): Promise<string> {
  const canvasFactory = new NodeCanvasFactory()
  const pdf = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: false,
  }).promise

  const worker = await getOcrWorker()
  const pageCount = Math.min(pdf.numPages, options?.maxPages ?? MAX_OCR_PAGES)
  const scale = options?.scale ?? OCR_SCALE
  const topFraction = Math.min(1, Math.max(0.2, options?.topFraction ?? 1))
  const parts: string[] = []

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale })
    const pageCanvas = createCanvas(viewport.width, viewport.height)
    const context = pageCanvas.getContext('2d')
    const canvasRef = { canvas: pageCanvas }

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvasFactory,
    } as never).promise

    const cropHeight = Math.max(1, Math.floor(viewport.height * topFraction))
    let image = pageCanvas
    if (cropHeight < viewport.height) {
      const cropped = createCanvas(viewport.width, cropHeight)
      cropped.getContext('2d').drawImage(pageCanvas, 0, 0)
      image = cropped
    }

    const { data } = await worker.recognize(image.toBuffer('image/png'))
    parts.push(data.text)
    canvasFactory.destroy(canvasRef)

    const accumulated = parts.join('\n').replace(/\s+/g, ' ').trim()
    if (options?.stopWhen?.(accumulated)) break
  }

  return parts.join('\n').replace(/\s+/g, ' ').trim()
}
