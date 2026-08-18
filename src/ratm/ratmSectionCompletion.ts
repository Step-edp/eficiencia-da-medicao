import type { RatmFormData } from './types'

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
  return (
    isFilled(data.meter) &&
    isFilled(data.meterStatus) &&
    hasScheduleDate(data) &&
    isFilled(data.installation) &&
    isFilled(data.toi) &&
    isFilled(data.note) &&
    isFilled(data.csd) &&
    isFilled(data.clientPresent) &&
    isFilled(data.deliveryDeadlineLabel)
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

export function isTestResultsSectionComplete(data: RatmFormData) {
  return (
    isFilled(data.brokenMeter) &&
    isFilled(data.displayOff) &&
    isFilled(data.meterInteriorAccess) &&
    isFilled(data.damagedCoil) &&
    isFilled(data.apparentlyInOrder) &&
    isFilled(data.dielectricFailed) &&
    isFilled(data.foreignBodyInMeter) &&
    data.photos.every((photo) => isFilled(photo))
  )
}
