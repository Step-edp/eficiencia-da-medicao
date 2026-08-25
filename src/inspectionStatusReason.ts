export function uniqueInspectionReasons(
  reasons: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const reason of reasons) {
    const trimmed = reason?.replace(/\s+/g, ' ').trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(trimmed.endsWith('.') ? trimmed : `${trimmed}.`)
  }
  return unique
}

export function joinInspectionReasons(
  reasons: Array<string | null | undefined>,
): string | null {
  const unique = uniqueInspectionReasons(reasons)
  return unique.length ? unique.join(' ') : null
}

export function missingInspectionDocumentReasons(
  hasToi: boolean,
  hasComunicado: boolean,
): string[] {
  if (!hasToi && !hasComunicado) return ['Sem documento de inspeção.']
  const reasons: string[] = []
  if (!hasToi) reasons.push('Falta o TOI.')
  if (!hasComunicado) reasons.push('Falta o Comunicado de Substituição (CSM).')
  return reasons
}

export function inspectionIssueReasons(item: {
  hasToi?: boolean
  hasComunicado?: boolean
  blockReason?: string | null
  blockReasons?: string | null
}): string[] {
  return uniqueInspectionReasons([
    ...missingInspectionDocumentReasons(Boolean(item.hasToi), Boolean(item.hasComunicado)),
    item.blockReasons,
    item.blockReason,
  ])
}

export function inspectionIssueReason(item: {
  hasToi?: boolean
  hasComunicado?: boolean
  blockReason?: string | null
  blockReasons?: string | null
}): string | null {
  return joinInspectionReasons(inspectionIssueReasons(item))
}
