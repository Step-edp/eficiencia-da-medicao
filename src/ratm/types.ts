import type { ScheduleEntryComparisons } from '../api'

export type EntryFieldCheck = 'correct' | 'incorrect' | ''

export type EntryFieldChecks = {
  scheduleDate: EntryFieldCheck
  installation: EntryFieldCheck
  toi: EntryFieldCheck
  note: EntryFieldCheck
  csd: EntryFieldCheck
  partner: EntryFieldCheck
  collaborator1: EntryFieldCheck
  collaborator2: EntryFieldCheck
  clientPresent: EntryFieldCheck
  deliveryDeadline: EntryFieldCheck
  schedulingNotes: EntryFieldCheck
}

export const ENTRY_FIELD_CHECK_KEYS = [
  'scheduleDate',
  'installation',
  'toi',
  'note',
  'csd',
  'partner',
  'collaborator1',
  'collaborator2',
  'deliveryDeadline',
  'schedulingNotes',
] as const satisfies ReadonlyArray<keyof EntryFieldChecks>

export function createEmptyEntryFieldChecks(): EntryFieldChecks {
  return {
    scheduleDate: '',
    installation: '',
    toi: '',
    note: '',
    csd: '',
    partner: '',
    collaborator1: '',
    collaborator2: '',
    clientPresent: '',
    deliveryDeadline: '',
    schedulingNotes: '',
  }
}

function entryCheckFromMatch(matches: boolean | null | undefined): EntryFieldCheck {
  if (matches === true) return 'correct'
  if (matches === false) return 'incorrect'
  return ''
}

/** Preenche sugestões de ✓/✗ com base na comparação documento × cadastro. */
export function entryFieldChecksFromComparisons(
  comparisons: ScheduleEntryComparisons | null | undefined,
): EntryFieldChecks {
  if (!comparisons) return createEmptyEntryFieldChecks()

  return {
    scheduleDate: entryCheckFromMatch(comparisons.scheduleDate.matches),
    installation: entryCheckFromMatch(comparisons.installation.matches),
    toi: entryCheckFromMatch(comparisons.toi.matches),
    note: entryCheckFromMatch(comparisons.note.matches),
    csd: entryCheckFromMatch(comparisons.csd.matches),
    partner: entryCheckFromMatch(comparisons.partner.matches),
    collaborator1: entryCheckFromMatch(comparisons.collaborator1.matches),
    collaborator2: entryCheckFromMatch(comparisons.collaborator2.matches),
    clientPresent: entryCheckFromMatch(comparisons.clientPresent.matches),
    deliveryDeadline: entryCheckFromMatch(comparisons.deliveryDeadline.matches),
    schedulingNotes: entryCheckFromMatch(comparisons.schedulingNotes.matches),
  }
}

export type RatmFormData = {
  meterSearch: string
  meter: string
  meterStatus: string
  demmDocumentId: string | null
  registryStatus: string
  scheduleId: string
  scheduleSource: string
  entryComparisons: ScheduleEntryComparisons | null
  entryFieldChecks: EntryFieldChecks
  scheduleDate: string
  scheduleHour: string
  scheduleMinute: string
  scheduleLabel: string
  installation: string
  toi: string
  note: string
  csd: string
  partnerLabel: string
  clientPresent: string
  schedulingNotes: string
  deliveryDeadlineLabel: string
  client: string
  analysisRequest: string
  clientAccompanied: string
  satisfactionWhatsapp: string
  visualTest: string
  dielectric: string
  enclosureSeal: string
  sealMatchesToi: string
  sealMatchesToiJustification: string
  sealMatchesFieldImages: string
  sealMatchesFieldImagesJustification: string
  enclosureStatus: string
  seal1: string
  seal1Status: string
  seal2: string
  seal2Status: string
  meterReading: string
  meterReadingPreset: string
  meterReadingStatus: string
  testBench: string
  cn: string
  cnPreset: string
  ci: string
  ciPreset: string
  cp: string
  cpPreset: string
  cnRi: string
  cnRiPreset: string
  cnRc: string
  cnRcPreset: string
  march: string
  recorder: string
  interruptedPhase: string
  interruptedPhaseOption: string
  irregularityCode: string
  irregularityNotes: string
  itemLookup: string
  fieldReportCorrect: string
  fieldIrregularityCode: string
  laboratoryNotes: string
  fieldDocumentDescription: string
  fieldInspectionBy: string
  fieldCollaborator1: string
  fieldCollaborator1Name: string
  fieldCollaborator1Registration: string
  fieldCollaborator2: string
  fieldCollaborator2Name: string
  fieldCollaborator2Registration: string
  nsType: string
  brokenMeter: string
  displayOff: string
  meterInteriorAccess: string
  damagedCoil: string
  apparentlyInOrder: string
  dielectricFailed: string
  foreignBodyInMeter: string
  missingEnvelopeNumber: string
  missingCoverSeal: string
  missingFoundMeterNumber: string
  sealMissingOnToiPresentPhysically: string
  sealOnToiMissingPhysically: string
  sealViolatedOnToiOkPhysically: string
  toiNotSentPhysically: string
  csmCutWithoutTeam: string
  deviceMissingOnToi: string
  noDocumentSent: string
  csmNotSentPhysically: string
  photos: string[]
}

export const IRREGULARITY_CODES: Record<string, string> = {
  '23': 'MANCAL FORA DE POSIÇÃO',
}

export const TEST_BENCH_OPTIONS = ['45079', '4137', '49093']

export function createEmptyRatmForm(): RatmFormData {
  return {
    meterSearch: '',
    meter: '',
    meterStatus: '',
    demmDocumentId: null,
    registryStatus: '',
    scheduleId: '',
    scheduleSource: '',
    entryComparisons: null,
    entryFieldChecks: createEmptyEntryFieldChecks(),
    scheduleDate: '',
    scheduleHour: '08',
    scheduleMinute: '30',
    scheduleLabel: '',
    installation: '',
    toi: '',
    note: '',
    csd: '',
    partnerLabel: '',
    clientPresent: '',
    schedulingNotes: '',
    deliveryDeadlineLabel: '',
    client: '',
    analysisRequest: '',
    clientAccompanied: '',
    satisfactionWhatsapp: '',
    visualTest: '',
    dielectric: '',
    enclosureSeal: '',
    sealMatchesToi: '',
    sealMatchesToiJustification: '',
    sealMatchesFieldImages: '',
    sealMatchesFieldImagesJustification: '',
    enclosureStatus: '',
    seal1: '',
    seal1Status: '',
    seal2: '',
    seal2Status: '',
    meterReading: '',
    meterReadingPreset: '',
    meterReadingStatus: '',
    testBench: '',
    cn: '',
    cnPreset: '',
    ci: '',
    ciPreset: '',
    cp: '',
    cpPreset: '',
    cnRi: '',
    cnRiPreset: '',
    cnRc: '',
    cnRcPreset: '',
    march: '',
    recorder: '',
    interruptedPhase: '',
    interruptedPhaseOption: '',
    irregularityCode: '23',
    irregularityNotes: '',
    itemLookup: '',
    fieldReportCorrect: '',
    fieldIrregularityCode: '23',
    laboratoryNotes: '',
    fieldDocumentDescription: '',
    fieldInspectionBy: '',
    fieldCollaborator1: '',
    fieldCollaborator1Name: '',
    fieldCollaborator1Registration: '',
    fieldCollaborator2: '',
    fieldCollaborator2Name: '',
    fieldCollaborator2Registration: '',
    nsType: '',
    brokenMeter: '',
    displayOff: '',
    meterInteriorAccess: '',
    damagedCoil: '',
    apparentlyInOrder: '',
    dielectricFailed: '',
    foreignBodyInMeter: '',
    missingEnvelopeNumber: '',
    missingCoverSeal: '',
    missingFoundMeterNumber: '',
    sealMissingOnToiPresentPhysically: '',
    sealOnToiMissingPhysically: '',
    sealViolatedOnToiOkPhysically: '',
    toiNotSentPhysically: '',
    csmCutWithoutTeam: '',
    deviceMissingOnToi: '',
    noDocumentSent: '',
    csmNotSentPhysically: '',
    photos: ['', '', '', ''],
  }
}

/** Garante campos novos em rascunhos/laudos antigos. */
export function normalizeRatmForm(data?: Partial<RatmFormData> | null): RatmFormData {
  const form: RatmFormData = {
    ...createEmptyRatmForm(),
    ...(data ?? {}),
    entryFieldChecks: {
      ...createEmptyEntryFieldChecks(),
      ...(data?.entryFieldChecks ?? {}),
    },
    photos: Array.isArray(data?.photos) && data.photos.length
      ? [...data.photos, '', '', '', ''].slice(0, 4)
      : ['', '', '', ''],
  }
  if (!form.fieldCollaborator1 && !form.fieldCollaborator2 && form.fieldInspectionBy.trim()) {
    const [first, second] = form.fieldInspectionBy.split(/\s*\/\s*/)
    form.fieldCollaborator1 = first?.trim() ?? ''
    form.fieldCollaborator2 = second?.trim() ?? ''
  }
  const splitCollaborator = (value: string) => {
    const trimmed = value.trim()
    const match = trimmed.match(/^(.*\D)\s+(\d{3,})$/)
    if (!match) return { name: trimmed, registration: '' }
    return { name: match[1].trim(), registration: match[2] }
  }
  if (!form.fieldCollaborator1Name && !form.fieldCollaborator1Registration && form.fieldCollaborator1) {
    const split = splitCollaborator(form.fieldCollaborator1)
    form.fieldCollaborator1Name = split.name
    form.fieldCollaborator1Registration = split.registration
  }
  if (!form.fieldCollaborator2Name && !form.fieldCollaborator2Registration && form.fieldCollaborator2) {
    const split = splitCollaborator(form.fieldCollaborator2)
    form.fieldCollaborator2Name = split.name
    form.fieldCollaborator2Registration = split.registration
  }
  return form
}
