/** Lê imagem ou PDF como data URL (até ~2 MB). */
export function readAttachmentAsDataUrl(
  file: File,
  maxBytes = 2_000_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const isImage = file.type.startsWith('image/')
    const isPdf = file.type === 'application/pdf'
    if (!isImage && !isPdf) {
      reject(new Error('Selecione uma imagem ou um PDF.'))
      return
    }
    if (file.size > maxBytes) {
      reject(new Error('O arquivo deve ter no máximo 2 MB.'))
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
