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
}

function isAllowedAttachment(file: File, allowOfficeDocuments: boolean) {
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

  return new Promise((resolve, reject) => {
    if (!isAllowedAttachment(file, allowOfficeDocuments)) {
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
      reject(new Error(`O arquivo deve ter no máximo ${maxMb} MB.`))
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
