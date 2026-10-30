import type { MeterScheduleRecord } from '../api'

export const METER_NOT_RECEIVED_MESSAGE =
  'Este medidor ainda não foi recebido pela entrada em massa da DEMM.'

export function isMeterReadyForEnsaio(
  input: Pick<MeterScheduleRecord, 'receivedAt'>,
): boolean {
  return Boolean(input.receivedAt)
}

export function isMeterReadyForEnsaioFromForm(input: {
  receivedAt?: string | null
}): boolean {
  return Boolean(input.receivedAt)
}
