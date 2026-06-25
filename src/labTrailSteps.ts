export type LabTrailStep = {
  key: string
  label: string
}

export const LAB_TRAIL_STEPS: LabTrailStep[] = [
  { key: 'Agendar', label: 'Agendar' },
  { key: 'Entrada de medidores', label: 'Entrada' },
  { key: 'Ensaiar', label: 'Ensaiar' },
  { key: 'Aprovação de RATM', label: 'Aprovação' },
  { key: 'Pesquisa de satisfação', label: 'Pesquisa' },
  { key: 'Sucata', label: 'Sucata' },
]

export const LAB_TRAIL_KEYS = new Set(LAB_TRAIL_STEPS.map((step) => step.key))

export function isLabTrailSection(section: string) {
  return LAB_TRAIL_KEYS.has(section)
}
