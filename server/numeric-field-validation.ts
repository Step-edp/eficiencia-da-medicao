const LIMITS = {
  medidor: 8,
  instalacao: 9,
  toi: 7,
  nota: 11,
} as const

function isSequential(digits: string): boolean {
  if (digits.length < 2) return false

  const values = digits.split('').map(Number)
  const step = values[1] - values[0]
  if (Math.abs(step) !== 1) return false

  for (let index = 2; index < values.length; index += 1) {
    if (values[index] - values[index - 1] !== step) return false
  }

  return true
}

function isRepeatedDigit(digits: string): boolean {
  if (digits.length < 2) return false
  return digits.split('').every((digit) => digit === digits[0])
}

export function validateScheduleNumericField(
  value: string,
  field: keyof typeof LIMITS,
): string | null {
  const labels = {
    medidor: 'Medidor',
    instalacao: 'Instalação',
    toi: 'TOI',
    nota: 'Nota',
  }
  const label = labels[field]
  const maxDigits = LIMITS[field]

  if (!value) return `O campo ${label} é obrigatório.`
  if (!/^\d+$/.test(value)) {
    return `O campo ${label} deve conter apenas números (máximo ${maxDigits} dígitos).`
  }
  if (value.length > maxDigits) {
    return `O campo ${label} deve ter no máximo ${maxDigits} dígitos.`
  }
  if (/^0+$/.test(value)) {
    return `O campo ${label} não pode ser composto apenas por zeros.`
  }
  if (isRepeatedDigit(value)) {
    return `O campo ${label} não pode ter todos os dígitos iguais.`
  }
  if (isSequential(value)) {
    return `O campo ${label} não pode ser uma sequência numérica.`
  }

  return null
}

export function formatScheduleNumericField(
  value: unknown,
  field: keyof typeof LIMITS,
): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  const width = LIMITS[field]
  const trimmed = digits.length > width ? digits.slice(0, width) : digits
  return trimmed.padStart(width, '0')
}

export function normalizeScheduleMeter(value: unknown): string {
  return formatScheduleNumericField(value, 'medidor')
}

export function normalizeScheduleNote(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  const trimmed = digits.replace(/^0+/, '') || '0'
  return trimmed.length > LIMITS.nota ? trimmed.slice(0, LIMITS.nota) : trimmed
}
