import type { MeterScheduleRecord } from './api'

function formatPerson(name?: string, registration?: string) {
  const normalizedName = name?.trim()
  const normalizedRegistration = registration?.trim()
  if (!normalizedName && !normalizedRegistration) return ''
  if (normalizedName && normalizedRegistration) {
    return `${normalizedName} (${normalizedRegistration})`
  }
  return normalizedName || normalizedRegistration || ''
}

export function formatSchedulePartnerLabel(
  item: Pick<
    MeterScheduleRecord,
    | 'partnerName'
    | 'partnerRegistration'
    | 'toiCollaborator1Name'
    | 'toiCollaborator1Registration'
    | 'toiCollaborator2Name'
    | 'toiCollaborator2Registration'
    | 'source'
    | 'scheduledByName'
  >,
) {
  if (item.partnerName?.trim()) {
    return `${item.partnerName.trim()}${
      item.partnerRegistration?.trim() ? ` (${item.partnerRegistration.trim()})` : ''
    }`
  }

  const team = [
    formatPerson(item.toiCollaborator1Name, item.toiCollaborator1Registration),
    formatPerson(item.toiCollaborator2Name, item.toiCollaborator2Registration),
  ].filter(Boolean)

  if (team.length) {
    return `Equipe TOI: ${team.join(', ')}`
  }

  if (item.source === 'passivo' && item.scheduledByName?.trim()) {
    return item.scheduledByName.trim()
  }

  return ''
}
