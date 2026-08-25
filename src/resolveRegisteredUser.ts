import type { FieldPartnerOption } from './api'

export function registrationDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function resolveRegisteredUser(
  queryValue: string,
  selectedId: string,
  source: FieldPartnerOption[],
): FieldPartnerOption | null {
  const query = queryValue.trim().toUpperCase()
  if (!query) return null

  const exact = source.filter((user) => user.registration.trim().toUpperCase() === query)
  if (exact.length === 1) return exact[0]

  const digits = registrationDigits(query)
  if (digits.length >= 3) {
    const byDigits = source.filter(
      (user) => registrationDigits(user.registration) === digits,
    )
    if (byDigits.length === 1) return byDigits[0]
    if (selectedId) {
      const selected = byDigits.find((user) => user.id === selectedId)
      if (selected) return selected
    }
  }

  if (selectedId) {
    return source.find((user) => user.id === selectedId) ?? null
  }

  return null
}
