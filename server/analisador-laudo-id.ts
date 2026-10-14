const CERTIFICADO_PATTERN = /^VM(\d+)_(\d{4})\/(\d+)$/i

export function calibrationYear(date: Date) {
  const year = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
    }).format(date),
  )
  return Number.isInteger(year) ? year : date.getFullYear()
}

/** VM2_2024/075 no ano de 2026 vira VM3_2026/075. O ID depois da barra permanece. */
export function nextIdentificacaoLaudo(current: string, year: number) {
  const match = current.trim().match(CERTIFICADO_PATTERN)
  if (!match || !Number.isInteger(year)) return current.trim()
  return `VM${Number(match[1]) + 1}_${year}/${match[3]}`
}
