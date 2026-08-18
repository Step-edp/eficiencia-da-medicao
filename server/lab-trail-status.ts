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

export function isMeterReadyForEnsaio(options: {
  registryStatus?: string | null
  trailStep?: string | null
  hasDemmEntry?: boolean
}): boolean {
  if (options.hasDemmEntry) {
    return true
  }

  if (options.registryStatus && hasMeterEntradaGiven(options.registryStatus)) {
    return true
  }

  const step = options.trailStep?.trim()
  return Boolean(step && step !== ENTRADA_TRAIL_STEP)
}

export function getNextStatusAfterEntrada(): MeterProcessStatus {
  return 'Recebido'
}

export type CalendarMeterStatus = 'Agendado' | 'Recebido' | 'Ensaiado'

export function resolveCalendarMeterStatus(
  registryStatus: string | null | undefined,
  trailStep: string,
): CalendarMeterStatus {
  const registry = registryStatus?.trim()
  if (registry === 'Aprovado' || registry === 'Ensaiado') return 'Ensaiado'
  if (registry === 'Recebido') return 'Recebido'
  if (registry === 'Agendado') return 'Agendado'

  const step = trailStep.trim()
  if (step === ENSAIAR_TRAIL_STEP) return 'Recebido'
  if (
    step === APROVACAO_TRAIL_STEP ||
    step === 'Pesquisa de satisfação' ||
    step === SUCATA_TRAIL_STEP
  ) {
    return 'Ensaiado'
  }
  return 'Agendado'
}
