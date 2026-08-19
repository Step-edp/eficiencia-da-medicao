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
  'clientPresent',
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
  fieldInspectionBy: string
  nsType: string
  brokenMeter: string
  displayOff: string
  meterInteriorAccess: string
  damagedCoil: string
  apparentlyInOrder: string
  dielectricFailed: string
  foreignBodyInMeter: string
  photos: string[]
}

export const IRREGULARITY_CODES: Record<string, string> = {
  '23': 'MANCAL FORA DE POSIÇÃO',
}

export const TEST_BENCH_OPTIONS = ['45079', '4137', '49093']
export const ITEM_LOOKUP_OPTIONS = [
  'Medidor monofásico',
  'Medidor trifásico',
  'TC externo',
  'TP externo',
  'Concentrador',
]

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
    fieldInspectionBy: '',
    nsType: '',
    brokenMeter: '',
    displayOff: '',
    meterInteriorAccess: '',
    damagedCoil: '',
    apparentlyInOrder: '',
    dielectricFailed: '',
    foreignBodyInMeter: '',
    photos: ['', '', '', ''],
  }
}

/** Garante campos novos em rascunhos/laudos antigos. */
export function normalizeRatmForm(data?: Partial<RatmFormData> | null): RatmFormData {
  return {
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
}
