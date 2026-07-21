export type LabTrailStep = {
  key: string
  label: string
}

export const LAB_TRAIL_STEPS: LabTrailStep[] = [
  { key: 'Agendar', label: 'Agendamento' },
  { key: 'Entrada de medidores', label: 'Entrada' },
  { key: 'Ensaiar', label: 'Ensaio' },
  { key: 'Aprovação de RATM', label: 'Aprovação' },
  { key: 'Pesquisa de satisfação', label: 'Pesquisa de Satisfação' },
  { key: 'Sucata', label: 'Sucata' },
]

export const HOMOLOGATION_TRAIL_STEPS: LabTrailStep[] = [
  { key: 'Código de materiais', label: 'Código de materiais' },
  { key: 'Pedidos de Homologação', label: 'Pedido de homologação' },
  { key: 'Ensaio', label: 'Ensaio' },
  { key: 'Homologações', label: 'Homologações' },
]

export const LAB_TRAIL_KEYS = new Set(LAB_TRAIL_STEPS.map((step) => step.key))
export const HOMOLOGATION_TRAIL_KEYS = new Set(
  HOMOLOGATION_TRAIL_STEPS.map((step) => step.key),
)

export const ENTRADA_TRAIL_STEP = 'Entrada de medidores'
export const ENSAIAR_TRAIL_STEP = 'Ensaiar'
export const APROVACAO_TRAIL_STEP = 'Aprovação de RATM'
export const SUCATA_TRAIL_STEP = 'Sucata'

export const METER_PROCESS_STATUS = {
  Agendado: {
    trailStep: ENTRADA_TRAIL_STEP,
    availability: 'Disponível para dar Entrada de medidores',
  },
  Recebido: {
    trailStep: ENSAIAR_TRAIL_STEP,
    availability: 'Disponível para ensaiar',
  },
  Ensaiado: {
    trailStep: APROVACAO_TRAIL_STEP,
    availability: 'Disponível para aprovação',
  },
  Aprovado: {
    trailStep: SUCATA_TRAIL_STEP,
    availability: 'Disponível em sucata',
  },
} as const

export function getLabTrailLabel(section: string) {
  return LAB_TRAIL_STEPS.find((step) => step.key === section)?.label ?? section
}

export function isLabTrailSection(section: string) {
  return LAB_TRAIL_KEYS.has(section)
}
