export function buildSatisfactionSurveyLink(laudoId: string) {
  return `${window.location.origin}${window.location.pathname}#/pesquisa/${laudoId}`
}

export function normalizeWhatsappNumber(input: string) {
  const digits = input.replace(/\D/g, '')

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }

  return digits
}

export function isValidWhatsappNumber(input: string) {
  const normalized = normalizeWhatsappNumber(input)
  return normalized.length >= 12 && normalized.length <= 13
}

export function buildWhatsAppSurveyUrl(phone: string, laudoId: string) {
  const link = buildSatisfactionSurveyLink(laudoId)
  const message = `Olá! Obrigado por comparecer ao Laboratório de Medição EDP. Por favor, responda nossa pesquisa de satisfação: ${link}`

  return `https://wa.me/${normalizeWhatsappNumber(phone)}?text=${encodeURIComponent(message)}`
}
