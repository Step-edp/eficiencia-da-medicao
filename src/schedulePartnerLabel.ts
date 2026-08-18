import type { MeterScheduleRecord } from './api'

function formatPerson(name?: string | null, registration?: string | null) {
  const normalizedName = name?.trim()
  const normalizedRegistration = registration?.trim()
  if (!normalizedName && !normalizedRegistration) return ''
  if (normalizedName && normalizedRegistration) {
    return `${normalizedName} (${normalizedRegistration})`
  }
  return normalizedName || normalizedRegistration || ''
}

function normalizeRegistration(value?: string | null) {
  return value?.trim().toUpperCase() ?? ''
}

function isSameRegistration(left?: string | null, right?: string | null) {
  const normalizedLeft = normalizeRegistration(left)
  const normalizedRight = normalizeRegistration(right)
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight)
}

function isScheduleCreator(
  item: Pick<
    MeterScheduleRecord,
    'createdByUserId' | 'createdByRegistration' | 'partnerUserId' | 'partnerRegistration'
  >,
  userId?: string | null,
  registration?: string | null,
) {
  if (userId && item.createdByUserId && userId === item.createdByUserId) {
    return true
  }
  return isSameRegistration(registration, item.createdByRegistration)
}

export function formatScheduleCreatedByLabel(
  item: Pick<
    MeterScheduleRecord,
    'createdByName' | 'createdByRegistration' | 'scheduledByName'
  >,
) {
  if (item.createdByName?.trim() || item.createdByRegistration?.trim()) {
    return formatPerson(item.createdByName, item.createdByRegistration)
  }
  if (item.scheduledByName?.trim()) {
    return item.scheduledByName.trim()
  }
  return ''
}

export function formatScheduleCreatedAtLabel(createdAt?: string) {
  if (!createdAt) return ''
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatScheduleCollaborator1Label(
  item: Pick<MeterScheduleRecord, 'toiCollaborator1Name' | 'toiCollaborator1Registration'>,
) {
  return formatPerson(item.toiCollaborator1Name, item.toiCollaborator1Registration)
}

export function formatScheduleCollaborator2Label(
  item: Pick<MeterScheduleRecord, 'toiCollaborator2Name' | 'toiCollaborator2Registration'>,
) {
  return formatPerson(item.toiCollaborator2Name, item.toiCollaborator2Registration)
}

export function formatSchedulePartnerLabel(
  item: Pick<
    MeterScheduleRecord,
    | 'partnerName'
    | 'partnerRegistration'
    | 'partnerUserId'
    | 'createdByUserId'
    | 'createdByRegistration'
  >,
) {
  const partnerIsCreator = isScheduleCreator(
    item,
    item.partnerUserId,
    item.partnerRegistration,
  )

  if (item.partnerName?.trim() && !partnerIsCreator) {
    return formatPerson(item.partnerName, item.partnerRegistration)
  }

  return ''
}

export function formatSchedulePartnerAndTeamLabel(
  item: Pick<
    MeterScheduleRecord,
    | 'partnerName'
    | 'partnerRegistration'
    | 'partnerUserId'
    | 'createdByUserId'
    | 'createdByRegistration'
    | 'toiCollaborator1Name'
    | 'toiCollaborator1Registration'
    | 'toiCollaborator2Name'
    | 'toiCollaborator2Registration'
  >,
) {
  const parts = [
    formatSchedulePartnerLabel(item),
    formatScheduleCollaborator1Label(item),
    formatScheduleCollaborator2Label(item),
  ].filter(Boolean)

  return parts.join(' · ')
}

export function scheduleAuditSearchText(
  item: Pick<
    MeterScheduleRecord,
    | 'createdByName'
    | 'createdByRegistration'
    | 'scheduledByName'
    | 'createdAt'
  >,
) {
  return [
    formatScheduleCreatedByLabel(item),
    item.createdByRegistration,
    item.scheduledByName,
    formatScheduleCreatedAtLabel(item.createdAt),
  ]
    .filter(Boolean)
    .join(' ')
}
