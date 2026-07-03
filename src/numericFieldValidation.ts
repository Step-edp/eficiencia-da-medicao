export const NUMERIC_FIELD_LIMITS = {
  medidor: 8,
  instalacao: 9,
  toi: 7,
  nota: 11,
} as const

export type NumericFieldKey = keyof typeof NUMERIC_FIELD_LIMITS

const FIELD_LABELS: Record<NumericFieldKey, string> = {
  medidor: 'Medidor',
  instalacao: 'Instalação',
  toi: 'TOI',
  nota: 'Nota',
}

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

export function sanitizeNumericInput(value: string, maxDigits: number): string {
  return value.replace(/\D/g, '').slice(0, maxDigits)
}

export function validateNumericField(
  value: string,
  field: NumericFieldKey,
  inline = false,
): string | null {
  const label = FIELD_LABELS[field]
  const maxDigits = NUMERIC_FIELD_LIMITS[field]

  if (!value) {
    return inline ? 'Campo obrigatório.' : `O campo ${label} é obrigatório.`
  }

  if (!/^\d+$/.test(value)) {
    return inline
      ? `Somente números (máximo ${maxDigits} dígitos).`
      : `O campo ${label} deve conter apenas números (máximo ${maxDigits} dígitos).`
  }

  if (value.length > maxDigits) {
    return inline
      ? `Máximo de ${maxDigits} dígitos.`
      : `O campo ${label} deve ter no máximo ${maxDigits} dígitos.`
  }

  if (/^0+$/.test(value)) {
    return inline
      ? 'Não pode ser composto apenas por zeros.'
      : `O campo ${label} não pode ser composto apenas por zeros.`
  }

  if (isRepeatedDigit(value)) {
    return inline
      ? 'Não pode ter todos os dígitos iguais.'
      : `O campo ${label} não pode ter todos os dígitos iguais.`
  }

  if (isSequential(value)) {
    return inline
      ? 'Não pode ser uma sequência numérica.'
      : `O campo ${label} não pode ser uma sequência numérica.`
  }

  return null
}

export function validateNumericFieldOptional(
  value: string,
  field: NumericFieldKey,
  inline = false,
): string | null {
  if (!value) return null
  return validateNumericField(value, field, inline)
}
