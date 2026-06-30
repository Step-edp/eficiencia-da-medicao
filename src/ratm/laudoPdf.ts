export async function fetchRatmLaudoPdfBlob(laudoId: string) {
  const response = await fetch(`/api/ratm-laudos/${laudoId}/pdf`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? 'Não foi possível gerar o laudo em PDF.')
  }

  return response.blob()
}

export async function openRatmLaudoPdf(laudoId: string) {
  const blob = await fetchRatmLaudoPdfBlob(laudoId)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function downloadRatmLaudoPdf(laudoId: string, filename: string) {
  const blob = await fetchRatmLaudoPdfBlob(laudoId)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
