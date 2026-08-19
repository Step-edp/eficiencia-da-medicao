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

function isToiTeamSchedule(
  item: Pick<
    MeterScheduleRecord,
    | 'toiCollaborator1Registration'
    | 'toiCollaborator2Registration'
    | 'toiTeamReason'
  >,
) {
  return Boolean(
    item.toiCollaborator1Registration?.trim() ||
      item.toiCollaborator2Registration?.trim() ||
      item.toiTeamReason?.trim(),
  )
}

function isBulkImportedSchedule(item: { source?: string | null }) {
  return item.source === 'bulk_import'
}

type ScheduleAuthorFields = {
  source?: string | null
  createdByName?: string | null
  createdByRegistration?: string | null
  scheduledByName?: string | null
}

export function formatScheduleCreatedByLabel(item: ScheduleAuthorFields) {
  if (isBulkImportedSchedule(item)) {
    return item.scheduledByName?.trim() ?? ''
  }
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
  item: Pick<
    MeterScheduleRecord,
    | 'toiCollaborator1Name'
    | 'toiCollaborator1Registration'
    | 'toiCollaborator2Registration'
    | 'toiTeamReason'
    | 'createdByName'
    | 'createdByRegistration'
    | 'scheduledByName'
  > &
    ScheduleAuthorFields,
) {
  if (isBulkImportedSchedule(item)) return ''
  if (isToiTeamSchedule(item)) {
    return formatPerson(item.toiCollaborator1Name, item.toiCollaborator1Registration)
  }
  return formatScheduleCreatedByLabel(item)
}

export function formatScheduleCollaborator2Label(
  item: Pick<
    MeterScheduleRecord,
    | 'toiCollaborator2Name'
    | 'toiCollaborator2Registration'
    | 'toiCollaborator1Registration'
    | 'toiTeamReason'
    | 'partnerName'
    | 'partnerRegistration'
  > &
    ScheduleAuthorFields,
) {
  if (isBulkImportedSchedule(item)) return ''
  if (isToiTeamSchedule(item)) {
    return formatPerson(item.toiCollaborator2Name, item.toiCollaborator2Registration)
  }
  return formatPerson(item.partnerName, item.partnerRegistration)
}

export function formatSchedulePartnerLabel(
  item: Pick<
    MeterScheduleRecord,
    | 'partnerName'
    | 'partnerRegistration'
    | 'toiCollaborator1Registration'
    | 'toiCollaborator2Registration'
    | 'toiTeamReason'
  >,
) {
  if (isToiTeamSchedule(item)) {
    return ''
  }
  return formatPerson(item.partnerName, item.partnerRegistration)
}

export function formatSchedulePartnerAndTeamLabel(
  item: Pick<
    MeterScheduleRecord,
    | 'partnerName'
    | 'partnerRegistration'
    | 'createdByName'
    | 'createdByRegistration'
    | 'scheduledByName'
    | 'toiCollaborator1Name'
    | 'toiCollaborator1Registration'
    | 'toiCollaborator2Name'
    | 'toiCollaborator2Registration'
    | 'toiTeamReason'
  > &
    ScheduleAuthorFields,
) {
  if (isToiTeamSchedule(item)) {
    return [formatScheduleCollaborator1Label(item), formatScheduleCollaborator2Label(item)]
      .filter(Boolean)
      .join(' · ')
  }
  return formatSchedulePartnerLabel(item)
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
