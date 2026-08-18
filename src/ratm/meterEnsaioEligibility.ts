import type { MeterScheduleRecord } from '../api'
import { ENTRADA_TRAIL_STEP } from '../labTrailSteps'

export const METER_NOT_RECEIVED_MESSAGE =
  'Este medidor ainda não foi recebido na Entrada. Registre a DEMM antes de iniciar o ensaio.'

function hasRegistryEntrada(status?: string | null): boolean {
  return status === 'Recebido' || status === 'Ensaiado' || status === 'Aprovado'
}

export function isMeterReadyForEnsaio(
  input: Pick<MeterScheduleRecord, 'trailStep' | 'demmDocumentId'> & {
    registryStatus?: string | null
  },
): boolean {
  if (input.demmDocumentId) {
    return true
  }

  if (hasRegistryEntrada(input.registryStatus)) {
    return true
  }

  const step = input.trailStep?.trim()
  return Boolean(step && step !== ENTRADA_TRAIL_STEP)
}

export function isMeterReadyForEnsaioFromForm(input: {
  meterStatus?: string
  demmDocumentId?: string | null
  registryStatus?: string | null
}): boolean {
  return isMeterReadyForEnsaio({
    trailStep: input.meterStatus || '',
    demmDocumentId: input.demmDocumentId ?? null,
    registryStatus: input.registryStatus ?? null,
  })
}
