export type ReadImageAsDataUrlOptions = {
  maxBytes?: number
  maxDimension?: number
  quality?: number
}

const DEFAULT_MAX_BYTES = 2_000_000
const ENVELOPE_PHOTO_MAX_BYTES = 20_000_000

function maxMbLabel(maxBytes: number) {
  return Math.max(1, Math.round(maxBytes / 1_000_000))
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Não foi possível ler a imagem selecionada.'))
    }
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'))
    reader.readAsDataURL(file)
  })
}

async function compressImage(file: File, maxDimension: number, quality: number): Promise<string> {
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const image = await loadHtmlImage(file)
    return drawToJpeg(image, image.naturalWidth, image.naturalHeight, maxDimension, quality)
  }

  try {
    return drawToJpeg(bitmap, bitmap.width, bitmap.height, maxDimension, quality)
  } finally {
    bitmap.close()
  }
}

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível ler a imagem selecionada.'))
    }
    image.src = url
  })
}

function drawToJpeg(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
  quality: number,
): string {
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight, 1))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Não foi possível processar a imagem selecionada.')
  }
  context.drawImage(source, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

function parseOptions(
  maxBytesOrOptions: number | ReadImageAsDataUrlOptions = DEFAULT_MAX_BYTES,
): { maxBytes: number; maxDimension: number; quality: number } {
  if (typeof maxBytesOrOptions === 'number') {
    return { maxBytes: maxBytesOrOptions, maxDimension: 0, quality: 0.82 }
  }
  return {
    maxBytes: maxBytesOrOptions.maxBytes ?? DEFAULT_MAX_BYTES,
    maxDimension: maxBytesOrOptions.maxDimension ?? 0,
    quality: maxBytesOrOptions.quality ?? 0.82,
  }
}

/** Lê imagem como data URL (até ~2 MB, salvo opções). */
export async function readImageAsDataUrl(
  file: File,
  maxBytesOrOptions: number | ReadImageAsDataUrlOptions = DEFAULT_MAX_BYTES,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem.')
  }

  const options = parseOptions(maxBytesOrOptions)
  if (file.size > options.maxBytes) {
    throw new Error(`A imagem deve ter no máximo ${maxMbLabel(options.maxBytes)} MB.`)
  }

  if (options.maxDimension > 0) {
    try {
      return await compressImage(file, options.maxDimension, options.quality)
    } catch (error) {
      if (file.size > DEFAULT_MAX_BYTES) {
        throw error instanceof Error
          ? error
          : new Error('Não foi possível processar a imagem selecionada.')
      }
    }
  }

  return readFileAsDataUrl(file)
}

/** Foto do invólucro no agendamento: aceita até 20 MB e reduz para envio. */
export function readEnvelopePhotoAsDataUrl(file: File) {
  return readImageAsDataUrl(file, {
    maxBytes: ENVELOPE_PHOTO_MAX_BYTES,
    maxDimension: 1920,
    quality: 0.82,
  })
}
