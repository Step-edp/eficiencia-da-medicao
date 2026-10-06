function fileNameFromDisposition(disposition: string | null) {
  const match = disposition?.match(/filename="([^"]+)"/)
  return match?.[1] || 'RATM.pdf'
}

export async function fetchRatmLaudoPdf(laudoId: string) {
  const response = await fetch(`/api/ratm-laudos/${laudoId}/pdf`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? 'Não foi possível gerar o laudo em PDF.')
  }

  const blob = await response.blob()
  return {
    blob,
    filename: fileNameFromDisposition(response.headers.get('Content-Disposition')),
  }
}

export async function fetchRatmLaudoPdfBlob(laudoId: string) {
  const { blob } = await fetchRatmLaudoPdf(laudoId)
  return blob
}

function namedPdfFile(blob: Blob, filename: string) {
  return new File([blob], filename, { type: 'application/pdf' })
}

export function openRatmLaudoPdf(laudoId: string) {
  window.open(`/api/ratm-laudos/${encodeURIComponent(laudoId)}/pdf`, '_blank', 'noopener,noreferrer')
}

export async function printRatmLaudoPdf(laudoId: string) {
  const { blob } = await fetchRatmLaudoPdf(laudoId)
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.title = 'Imprimir laudo'
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'
  iframe.src = url
  iframe.onload = () => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    window.setTimeout(() => {
      iframe.remove()
      URL.revokeObjectURL(url)
    }, 60_000)
  }
  document.body.appendChild(iframe)
}

export async function downloadRatmLaudoPdf(laudoId: string, filename?: string) {
  const fetched = await fetchRatmLaudoPdf(laudoId)
  const downloadName = filename || fetched.filename
  const url = URL.createObjectURL(namedPdfFile(fetched.blob, downloadName))
  const link = document.createElement('a')
  link.href = url
  link.download = downloadName
  link.click()
  URL.revokeObjectURL(url)
}
