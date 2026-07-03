export const ENTRADA_TRAIL_STEP = 'Entrada de medidores'
export const ENSAIAR_TRAIL_STEP = 'Ensaiar'
export const APROVACAO_TRAIL_STEP = 'Aprovação de RATM'
export const SUCATA_TRAIL_STEP = 'Sucata'

export const METER_PROCESS_STATUSES = ['Agendado', 'Recebido', 'Ensaiado', 'Aprovado'] as const
export type MeterProcessStatus = (typeof METER_PROCESS_STATUSES)[number]

export const STATUS_TRAIL_MAP: Record<MeterProcessStatus, string> = {
  Agendado: ENTRADA_TRAIL_STEP,
  Recebido: ENSAIAR_TRAIL_STEP,
  Ensaiado: APROVACAO_TRAIL_STEP,
  Aprovado: SUCATA_TRAIL_STEP,
}

export const STATUS_AVAILABILITY_LABEL: Record<MeterProcessStatus, string> = {
  Agendado: 'Disponível para dar Entrada de medidores',
  Recebido: 'Disponível para ensaiar',
  Ensaiado: 'Disponível para aprovação',
  Aprovado: 'Disponível em sucata',
}

export function mapMeterStatusToTrailStep(status: string): string {
  return STATUS_TRAIL_MAP[status as MeterProcessStatus] ?? ENTRADA_TRAIL_STEP
}

export function getStatusAvailabilityLabel(status: string): string {
  return STATUS_AVAILABILITY_LABEL[status as MeterProcessStatus] ?? status
}

export function isMeterAvailableForEntrada(status: string): boolean {
  return status === 'Agendado'
}

export function hasMeterEntradaGiven(status: string): boolean {
  return status === 'Recebido' || status === 'Ensaiado' || status === 'Aprovado'
}

export function getNextStatusAfterEntrada(): MeterProcessStatus {
  return 'Recebido'
}
