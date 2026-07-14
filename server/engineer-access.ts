/** Catálogo compartilhado: processos específicos por subárea da home. */

export const ENGINEER_HOME_SUBAREAS = [
  'Gestão',
  'Medição',
  'Laboratório de Medição',
  'Laboratório de Homologação',
  'Telemedição',
  'Equipe de campo',
] as const

export type EngineerHomeSubarea = (typeof ENGINEER_HOME_SUBAREAS)[number]

export const PROCESSES_BY_HOME_SUBAREA: Record<EngineerHomeSubarea, readonly string[]> = {
  Gestão: ['Indicadores', 'Dashboards', 'Metas operacionais'],
  Medição: [
    'Faturamento de clientes livres',
    'Faturamento de clientes cativos',
    'Faturamento de consumo próprio',
    'Memória de massa',
    'Medidas inconsistentes',
    'Migração',
    'Arcesp',
    'Pirâmide',
    'Capex',
    'Geração de senha',
    'Geração de número de série',
    'Sap Hana',
  ],
  'Laboratório de Medição': [
    'Agendar',
    'Entrada de medidores',
    'Ensaiar',
    'Aprovação de RATM',
    'Pesquisa de satisfação',
    'Sucata',
    'Dashboard',
    'Consultar RATM',
    'Calendário de ensaios',
    'Auditoria',
    'Analisadores de Tensão',
    'Inventário',
    'Aferição de Padrões BT',
    'Grandes Clientes',
    'Criar Modelo',
    'Galeria',
    'Apresentação',
    'Fornecedores',
    'CSDs',
    'Treinamentos',
    'Softwares',
  ],
  'Laboratório de Homologação': [
    'Ensaio',
    'Pedidos de Homologação',
    'Código de materiais',
  ],
  Telemedição: [
    'Monitoramento remoto',
    'Coleta de dados em tempo real',
    'Gestão de alertas',
  ],
  'Equipe de campo': [
    'Agendar',
    'Consultar',
    'Lavratura de TOI',
    'Lavratura de TOI - Ponto Focal',
    'Leituras de faturamento',
  ],
}

/** Alias para atribuições/ranking. */
export const PROCESSES_BY_AREA: Record<string, readonly string[]> = PROCESSES_BY_HOME_SUBAREA

export function parseAccessProcess(value: string): { area: string; process: string } | null {
  const separator = value.indexOf('::')
  if (separator <= 0) return null
  const area = value.slice(0, separator).trim()
  const process = value.slice(separator + 2).trim()
  if (!area || !process) return null
  return { area, process }
}

export function encodeAccessProcess(area: string, process: string): string {
  return `${area}::${process}`
}

export function isValidHomeSubareaProcess(encoded: string): boolean {
  const parsed = parseAccessProcess(encoded)
  if (!parsed) return false
  if (!(ENGINEER_HOME_SUBAREAS as readonly string[]).includes(parsed.area)) return false
  return (PROCESSES_BY_HOME_SUBAREA[parsed.area as EngineerHomeSubarea] ?? []).includes(
    parsed.process,
  )
}

/** @deprecated Use isValidHomeSubareaProcess. */
export function isValidCrossAreaProcess(_ownWorkArea: string, encoded: string): boolean {
  return isValidHomeSubareaProcess(encoded)
}

export function portalAreasFromProcesses(
  _ownWorkArea: string,
  accessProcesses: string[],
): string[] {
  const portals = new Set<string>()

  for (const encoded of accessProcesses) {
    const parsed = parseAccessProcess(encoded)
    if (!parsed) continue
    if ((ENGINEER_HOME_SUBAREAS as readonly string[]).includes(parsed.area)) {
      portals.add(parsed.area)
    }
  }

  return ENGINEER_HOME_SUBAREAS.filter((area) => portals.has(area))
}
