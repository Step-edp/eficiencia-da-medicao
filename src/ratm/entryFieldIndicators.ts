import type { EntryFieldCheck, EntryFieldChecks, RatmFormData } from './types'
import { ENTRY_FIELD_CHECK_KEYS } from './types'

export const SCHEDULING_TEAM_ENTRY_FIELD_KEYS = [
  'partner',
  'collaborator1',
  'collaborator2',
] as const satisfies ReadonlyArray<keyof EntryFieldChecks>

export function isBulkImportedScheduleSource(source?: string | null) {
  return source === 'bulk_import'
}

export function isToiTeamScheduleData(data: Pick<RatmFormData, 'entryComparisons'>) {
  const comparisons = data.entryComparisons
  if (!comparisons) return false
  return Boolean(
    comparisons.collaborator1.registered?.trim() ||
      comparisons.collaborator2.registered?.trim(),
  )
}

export function excludesCollaboratorChecks(data: Pick<RatmFormData, 'scheduleSource' | 'entryComparisons'>) {
  if (isBulkImportedScheduleSource(data.scheduleSource)) return true
  return Boolean(data.entryComparisons?.excludeCollaboratorChecks)
}

/** Campos de parceiro/colaboradores exibidos no ensaio conforme o tipo de agendamento. */
export function getVisibleSchedulingTeamFieldKeys(
  data: Pick<RatmFormData, 'scheduleSource' | 'entryComparisons'>,
): Array<(typeof SCHEDULING_TEAM_ENTRY_FIELD_KEYS)[number]> {
  if (excludesCollaboratorChecks(data)) return []

  if (isToiTeamScheduleData(data)) {
    return ['collaborator1', 'collaborator2']
  }

  return ['partner']
}

/** Campos obrigatórios para concluir a seção Informações de entrada. */
export function getRequiredEntryFieldCheckKeys(
  data: Pick<RatmFormData, 'scheduleSource' | 'entryComparisons'>,
): Array<(typeof ENTRY_FIELD_CHECK_KEYS)[number]> {
  const hiddenTeamKeys = new Set(getVisibleSchedulingTeamFieldKeys(data))
  const skipTeamKeys = new Set<(typeof SCHEDULING_TEAM_ENTRY_FIELD_KEYS)[number]>(
    SCHEDULING_TEAM_ENTRY_FIELD_KEYS,
  )

  return ENTRY_FIELD_CHECK_KEYS.filter((key) => {
    if (skipTeamKeys.has(key as (typeof SCHEDULING_TEAM_ENTRY_FIELD_KEYS)[number])) {
      return hiddenTeamKeys.has(key as (typeof SCHEDULING_TEAM_ENTRY_FIELD_KEYS)[number])
    }
    return true
  })
}

/** Campos que entram nos indicadores de erro de agendamento. */
export function getSchedulingErrorIndicatorKeys(
  data: Pick<RatmFormData, 'scheduleSource' | 'entryComparisons'>,
): Array<(typeof ENTRY_FIELD_CHECK_KEYS)[number]> {
  return getRequiredEntryFieldCheckKeys(data)
}

export function countSchedulingEntryErrors(
  checks: EntryFieldChecks,
  data: Pick<RatmFormData, 'scheduleSource' | 'entryComparisons'>,
): number {
  return getSchedulingErrorIndicatorKeys(data).filter(
    (key) => checks[key] === 'incorrect',
  ).length
}

export function isEntryFieldChecked(value: EntryFieldCheck) {
  return value === 'correct' || value === 'incorrect'
}
