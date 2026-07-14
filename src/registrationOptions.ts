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

/** Subáreas da home disponíveis para engenheiro. */
export const ENGINEER_HOME_SUBAREAS = [
  'Gestão',
  'Medição',
  'Laboratório de Medição',
  'Laboratório de Homologação',
  'Telemedição',
  'Equipe de campo',
] as const

export type EngineerHomeSubarea = (typeof ENGINEER_HOME_SUBAREAS)[number]

/**
 * Processos específicos dentro de cada subárea da home.
 * Codificação: `Subárea::Processo`.
 */
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

/** Alias usado em ranking/atribuições — processos por subárea da home. */
export const PROCESSES_BY_AREA: Record<string, readonly string[]> = PROCESSES_BY_HOME_SUBAREA

/** Mapeia área de negócio do cadastro para subáreas da home. */
export const BUSINESS_AREA_TO_HOME_PORTALS: Record<string, readonly EngineerHomeSubarea[]> = {
  Medição: ['Medição', 'Laboratório de Medição', 'Equipe de campo', 'Gestão'],
  Telemedição: ['Telemedição', 'Gestão'],
  CSD: ['Equipe de campo'],
  'Consumo Irregular': ['Equipe de campo'],
  'Grandes Clientes': ['Medição'],
  Qualidade: ['Laboratório de Medição'],
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

/** Grupos de processos por subárea da home (para UI de processos específicos). */
export function getHomeSubareaProcessGroups(): Array<{
  area: EngineerHomeSubarea
  processes: readonly string[]
}> {
  return ENGINEER_HOME_SUBAREAS.map((area) => ({
    area,
    processes: PROCESSES_BY_HOME_SUBAREA[area],
  }))
}

/** @deprecated Use getHomeSubareaProcessGroups — processos ficam nas subáreas da home. */
export function getCrossAreaProcesses(_ownWorkArea = ''): Array<{
  area: string
  processes: readonly string[]
}> {
  return getHomeSubareaProcessGroups()
}

export function isValidHomeSubareaProcess(encoded: string): boolean {
  const parsed = parseAccessProcess(encoded)
  if (!parsed) return false
  if (!(ENGINEER_HOME_SUBAREAS as readonly string[]).includes(parsed.area)) return false
  return (PROCESSES_BY_HOME_SUBAREA[parsed.area as EngineerHomeSubarea] ?? []).includes(
    parsed.process,
  )
}

/** Deriva as subáreas da home a partir dos processos específicos escolhidos. */
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

export function processCountForHomePortal(portal: string): number {
  return PROCESSES_BY_HOME_SUBAREA[portal as EngineerHomeSubarea]?.length ?? 0
}

/**
 * Quantidade de processos sob responsabilidade do usuário,
 * conforme cargo, escopo/abrangência e processos específicos.
 */
export function countResponsibleProcesses(user: {
  role?: string
  jobTitle?: string | null
  workArea?: string | null
  workSubtype?: string | null
  accessAreas?: string[] | null
  accessProcesses?: string[] | null
}): number {
  if (user.role === 'admin') return 0

  const jobTitle = user.jobTitle?.trim() ?? ''
  const workArea = user.workArea?.trim() ?? ''
  const workSubtype = user.workSubtype?.trim() ?? ''

  if (jobTitle === 'Engenheiro') {
    if (workSubtype === 'Área') {
      const portals = BUSINESS_AREA_TO_HOME_PORTALS[workArea] ?? []
      return portals.reduce((sum, portal) => sum + processCountForHomePortal(portal), 0)
    }
    if (workSubtype === 'Sub-área') {
      return (user.accessAreas ?? []).reduce(
        (sum, portal) => sum + processCountForHomePortal(portal),
        0,
      )
    }
    if (workSubtype === 'Processos específicos') {
      return user.accessProcesses?.length ?? 0
    }
  }

  if (jobTitle === 'Técnico' && workSubtype) {
    return 1
  }

  return user.accessProcesses?.length ?? 0
}

/** Monta o rótulo do perfil: Área → Cargo → Escopo → demais infos. */
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
