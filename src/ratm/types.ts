export type RatmFormData = {
  meterSearch: string
  meter: string
  meterStatus: string
  scheduleDate: string
  scheduleHour: string
  scheduleMinute: string
  client: string
  analysisRequest: string
  clientAccompanied: string
  visualTest: string
  dielectric: string
  enclosureSeal: string
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
    scheduleDate: '',
    scheduleHour: '08',
    scheduleMinute: '30',
    client: '',
    analysisRequest: '',
    clientAccompanied: '',
    visualTest: '',
    dielectric: '',
    enclosureSeal: '',
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
    fieldIrregularityCode: '',
  }
}
