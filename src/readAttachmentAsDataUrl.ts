const OFFICE_EXTENSIONS = /\.(pdf|ppt|pptx|doc|docx|xls|xlsx|odp|odt|ods)$/i

const OFFICE_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/octet-stream',
])

export type ReadAttachmentOptions = {
  maxBytes?: number
  allowOfficeDocuments?: boolean
  allowAnyFile?: boolean
}

function mimeDoArquivo(file: File) {
  const extensao = file.name.split('.').pop()?.toLowerCase() ?? ''
  const porExtensao: Record<string, string> = {
    zip: 'application/zip',
    rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    tgz: 'application/gzip',
    bz2: 'application/x-bzip2',
    xz: 'application/x-xz',
    apk: 'application/vnd.android.package-archive',
    cab: 'application/vnd.ms-cab-compressed',
    iso: 'application/x-iso9660-image',
    exe: 'application/octet-stream',
    msi: 'application/octet-stream',
  }
  return porExtensao[extensao] || file.type || 'application/octet-stream'
}

function bufferParaDataUrl(buffer: ArrayBuffer, mime: string) {
  const bytes = new Uint8Array(buffer)
  let binario = ''
  const passo = 8192
  for (let i = 0; i < bytes.length; i += passo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + passo))
  }
  return `data:${mime};base64,${btoa(binario)}`
}
function isAllowedAttachment(
  file: File,
  allowOfficeDocuments: boolean,
  allowAnyFile: boolean,
) {
  if (allowAnyFile) {
    return true
  }
  if (file.type.startsWith('image/') || file.type === 'application/pdf') {
    return true
  }
  if (!allowOfficeDocuments) {
    return false
  }
  return OFFICE_MIME_TYPES.has(file.type) || OFFICE_EXTENSIONS.test(file.name)
}

/** Lê imagem/PDF (e opcionalmente docs de escritório) como data URL. */
export function readAttachmentAsDataUrl(
  file: File,
  maxBytesOrOptions: number | ReadAttachmentOptions = 2_000_000,
): Promise<string> {
  const options: ReadAttachmentOptions =
    typeof maxBytesOrOptions === 'number'
      ? { maxBytes: maxBytesOrOptions }
      : maxBytesOrOptions
  const maxBytes = options.maxBytes ?? 2_000_000
  const allowOfficeDocuments = options.allowOfficeDocuments ?? false
  const allowAnyFile = options.allowAnyFile ?? false

  return new Promise((resolve, reject) => {
    if (!isAllowedAttachment(file, allowOfficeDocuments, allowAnyFile)) {
      reject(
        new Error(
          allowOfficeDocuments
            ? 'Selecione PDF, PowerPoint, Word, Excel ou imagem.'
            : 'Selecione uma imagem ou um PDF.',
        ),
      )
      return
    }
    if (file.size > maxBytes) {
      const maxMb = Math.max(1, Math.round(maxBytes / 1_000_000))
      const sizeLabel =
        file.size < 1_000_000
          ? `${Math.max(1, Math.round(file.size / 1000))} KB`
          : `${(file.size / 1_000_000).toFixed(1)} MB`
      reject(new Error(`O arquivo tem ${sizeLabel}. O limite é ${maxMb} MB.`))
      return
    }

    if (allowAnyFile) {
      const bufferReader = new FileReader()
      bufferReader.onload = () => {
        if (!(bufferReader.result instanceof ArrayBuffer)) {
          reject(new Error('Não foi possível ler o arquivo selecionado.'))
          return
        }
        resolve(bufferParaDataUrl(bufferReader.result, mimeDoArquivo(file)))
      }
      bufferReader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'))
      bufferReader.readAsArrayBuffer(file)
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Não foi possível ler o arquivo selecionado.'))
    }
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'))
    reader.readAsDataURL(file)
  })
}
