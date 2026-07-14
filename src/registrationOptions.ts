/** Abrangência do cadastro (própria ou terceira). */
export const EDP_SCOPE_OPTIONS = ['EDP SP', 'EDP ES', 'Transversal'] as const

export const TECHNICIAN_SCOPES_BY_AREA: Record<string, readonly string[]> = {
  Medição: [
    'Atividades administrativas da Medição',
    'Laboratório de Medição',
  ],
  CSD: [
    'Lavratura de TOI',
    'Lavratura de TOI - Ponto Focal',
    'Leituras de faturamento',
  ],
}

export const TECHNICIAN_SUBTYPES = [
  ...TECHNICIAN_SCOPES_BY_AREA.Medição,
  ...TECHNICIAN_SCOPES_BY_AREA.CSD,
] as const

export const ENGINEER_SUBTYPES = [
  'Área',
  'Sub-área',
  'Processos específicos',
] as const

/** Subáreas da home disponíveis para engenheiro com abrangência Sub-área. */
export const ENGINEER_HOME_SUBAREAS = [
  'Gestão',
  'Medição',
  'Laboratório de Medição',
  'Laboratório de Homologação',
  'Telemedição',
  'Equipe de campo',
] as const

export type EngineerHomeSubarea = (typeof ENGINEER_HOME_SUBAREAS)[number]

/** Processos específicos por área de negócio (exceto a área própria do engenheiro). */
export const PROCESSES_BY_AREA: Record<string, readonly string[]> = {
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
  Telemedição: [
    'Monitoramento remoto',
    'Coleta de dados em tempo real',
    'Gestão de alertas',
  ],
  CSD: [
    'Lavratura de TOI',
    'Lavratura de TOI - Ponto Focal',
    'Leituras de faturamento',
  ],
  'Consumo Irregular': [
    'Inspeção de irregularidade',
    'Análise de perda',
    'Acompanhamento de TOI',
  ],
  'Grandes Clientes': [
    'Medição especial',
    'Acompanhamento de grandes clientes',
    'Atendimento técnico',
  ],
  Qualidade: [
    'Ensaios de qualidade',
    'Auditoria de qualidade',
    'Acompanhamento de não conformidades',
  ],
  'Laboratório de Medição': [
    'Entrada de medidores',
    'Ensaiar',
    'Aprovação de RATM',
    'Calendário de ensaios',
    'Auditoria',
    'Inventário',
  ],
  'Laboratório de Homologação': [
    'Ensaio',
    'Pedidos de Homologação',
    'Código de materiais',
  ],
  'Equipe de campo': ['Agendar', 'Consultar'],
  Gestão: ['Indicadores', 'Dashboards', 'Metas operacionais'],
}

/** Mapeia área de processo para cards da home. */
export const AREA_TO_HOME_PORTALS: Record<string, readonly string[]> = {
  Medição: ['Medição'],
  Telemedição: ['Telemedição'],
  CSD: ['Equipe de campo'],
  'Consumo Irregular': ['Equipe de campo'],
  'Grandes Clientes': ['Medição'],
  Qualidade: ['Laboratório de Medição'],
  'Laboratório de Medição': ['Laboratório de Medição'],
  'Laboratório de Homologação': ['Laboratório de Homologação'],
  'Equipe de campo': ['Equipe de campo'],
  Gestão: ['Gestão'],
}

export type AccessProcess = {
  area: string
  process: string
}

export function encodeAccessProcess(area: string, process: string): string {
  return `${area}::${process}`
}

export function parseAccessProcess(value: string): AccessProcess | null {
  const separator = value.indexOf('::')
  if (separator <= 0) return null
  const area = value.slice(0, separator).trim()
  const process = value.slice(separator + 2).trim()
  if (!area || !process) return null
  return { area, process }
}

/** Áreas (e processos) disponíveis fora da área própria do engenheiro. */
export function getCrossAreaProcesses(ownWorkArea: string): Array<{
  area: string
  processes: readonly string[]
}> {
  return Object.entries(PROCESSES_BY_AREA)
    .filter(([area]) => area !== ownWorkArea)
    .map(([area, processes]) => ({ area, processes }))
}

export function portalAreasFromProcesses(
  ownWorkArea: string,
  accessProcesses: string[],
): string[] {
  const portals = new Set<string>(AREA_TO_HOME_PORTALS[ownWorkArea] ?? [])

  for (const encoded of accessProcesses) {
    const parsed = parseAccessProcess(encoded)
    if (!parsed) continue
    for (const portal of AREA_TO_HOME_PORTALS[parsed.area] ?? []) {
      portals.add(portal)
    }
  }

  return [...portals]
}

export const DEFAULT_AREA_OPTIONS = [
  'Medição',
  'Telemedição',
  'CSD',
  'Consumo Irregular',
  'Grandes Clientes',
  'Qualidade',
] as const

export const DEFAULT_LOCALITIES = [
  'Aparecida',
  'Biritiba-Mirim',
  'Caçapava',
  'Cachoeira Paulista',
  'Canas',
  'Caraguatatuba',
  'Cruzeiro',
  'Ferraz de Vasconcelos',
  'Guararema',
  'Guaratinguetá',
  'Guarulhos',
  'Itaquaquecetuba',
  'Jacareí',
  'Jambeiro',
  'Lorena',
  'Mogi das Cruzes',
  'Monteiro Lobato',
  'Pindamonhangaba',
  'Poá',
  'Potim',
  'Roseira',
  'Salesópolis',
  'Santa Branca',
  'São José dos Campos',
  'São Sebastião',
  'Suzano',
  'Taubaté',
  'Tremembé',
] as const

export function subtypesForCargo(jobTitle: string, workArea = ''): readonly string[] {
  if (jobTitle === 'Engenheiro') return ENGINEER_SUBTYPES
  if (jobTitle === 'Técnico') {
    return TECHNICIAN_SCOPES_BY_AREA[workArea] ?? []
  }
  return []
}

/** Monta o rótulo do perfil: Área → Cargo → Escopo → demais informações. */
export function buildRequestedProfile(
  jobTitle: string,
  workSubtype: string,
  workArea: string,
  ...extraParts: Array<string | undefined | null>
): string {
  return [workArea, jobTitle, workSubtype, ...extraParts]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' – ')
}
