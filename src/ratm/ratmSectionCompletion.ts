import type { RatmFormData } from './types'
import {
  getRequiredEntryFieldCheckKeys,
  isEntryFieldChecked,
} from './entryFieldIndicators'

function isFilled(value: string | null | undefined) {
  return Boolean(value?.trim())
}

function isYesNoComplete(value: string, justification: string) {
  if (!isFilled(value)) return false
  if (value === 'nao') return isFilled(justification)
  return true
}

function hasScheduleDate(data: RatmFormData) {
  return isFilled(data.scheduleLabel) || isFilled(data.scheduleDate)
}

export function isEntryInfoSectionComplete(data: RatmFormData) {
  const checks = data.entryFieldChecks
  return (
    isFilled(data.meter) &&
    isFilled(data.client) &&
    isFilled(data.meterStatus) &&
    hasScheduleDate(data) &&
    isFilled(data.installation) &&
    isFilled(data.toi) &&
    isFilled(data.note) &&
    isFilled(data.csd) &&
    isFilled(data.deliveryDeadlineLabel) &&
    getRequiredEntryFieldCheckKeys(data).every((key) => isEntryFieldChecked(checks[key]))
  )
}

export function isInitialTestsSectionComplete(data: RatmFormData) {
  return (
    isFilled(data.analysisRequest) &&
    isFilled(data.clientAccompanied) &&
    isFilled(data.visualTest) &&
    isFilled(data.dielectric)
  )
}

export function isEnclosureSealSectionComplete(data: RatmFormData) {
  return (
    isFilled(data.enclosureSeal) &&
    isYesNoComplete(data.sealMatchesToi, data.sealMatchesToiJustification) &&
    isYesNoComplete(data.sealMatchesFieldImages, data.sealMatchesFieldImagesJustification) &&
    isFilled(data.enclosureStatus)
  )
}

export function isSeal1SectionComplete(data: RatmFormData) {
  return isFilled(data.seal1) && isFilled(data.seal1Status)
}

export function isSeal2SectionComplete(data: RatmFormData) {
  return isFilled(data.seal2) && isFilled(data.seal2Status)
}

function isMeasurementFieldComplete(value: string, preset: string) {
  return isFilled(value) || isFilled(preset)
}

export function isAssayDataSectionComplete(data: RatmFormData) {
  return (
    isMeasurementFieldComplete(data.meterReading, data.meterReadingPreset) &&
    isFilled(data.testBench) &&
    isFilled(data.march) &&
    isFilled(data.recorder) &&
    isFilled(data.interruptedPhase) &&
    isFilled(data.irregularityCode) &&
    isFilled(data.fieldReportCorrect) &&
    isFilled(data.fieldIrregularityCode) &&
    isFilled(data.laboratoryNotes) &&
    isFilled(data.fieldInspectionBy) &&
    isFilled(data.nsType)
  )
}

export function isMeasurementsSectionComplete(data: RatmFormData) {
  return (
    isMeasurementFieldComplete(data.cn, data.cnPreset) &&
    isMeasurementFieldComplete(data.ci, data.ciPreset) &&
    isMeasurementFieldComplete(data.cp, data.cpPreset) &&
    isMeasurementFieldComplete(data.cnRi, data.cnRiPreset) &&
    isMeasurementFieldComplete(data.cnRc, data.cnRcPreset)
  )
}

export function isTestResultsSectionComplete(data: RatmFormData) {
  return (
    isFilled(data.brokenMeter) &&
    isFilled(data.displayOff) &&
    isFilled(data.meterInteriorAccess) &&
    isFilled(data.damagedCoil) &&
    isFilled(data.apparentlyInOrder) &&
    isFilled(data.dielectricFailed) &&
    isFilled(data.foreignBodyInMeter)
  )
}

export function isPhotosSectionComplete(data: RatmFormData) {
  return data.photos.every((photo) => isFilled(photo))
}
