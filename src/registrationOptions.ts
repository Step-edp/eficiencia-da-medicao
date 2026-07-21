/** Abrangência do cadastro (própria ou terceira). */
export const EDP_SCOPE_OPTIONS = ['EDP SP', 'EDP ES', 'Transversal'] as const

export const TECHNICIAN_SCOPES_BY_AREA: Record<string, readonly string[]> = {
  Medição: [
    'Atividades administrativas da Medição',
    'Laboratório de Medição',
  ],
  CSD: [
    'Lavratura de TOI - Equipe de Campo',
    'Lavratura de TOI - Ponto Focal',
    'Lavratura de TOI - Backoffice',
    'Leituras de faturamento',
  ],
}

export const TECHNICIAN_SUBTYPES = [
  ...TECHNICIAN_SCOPES_BY_AREA.Medição,
  ...TECHNICIAN_SCOPES_BY_AREA.CSD,
] as const

export const ENGINEER_SUBTYPES = [
  'Responsável por célula',
  'Responsável por sub-célula',
] as const

/** Escopos de lavratura disponíveis para Engenheiro na área CSD. */
export const CSD_ENGINEER_LAVRATURA_SCOPES = [
  'Lavratura de TOI - Equipe de Campo',
  'Lavratura de TOI - Ponto Focal',
  'Lavratura de TOI - Backoffice',
] as const

export function isCsdEngineerLavraturaScope(value: string | null | undefined) {
  return (CSD_ENGINEER_LAVRATURA_SCOPES as readonly string[]).includes(value?.trim() ?? '')
}

/** Aceita rótulos novos e legados na base. */
export function isEngineerAreaSubtype(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  return (
    normalized === 'Responsável por célula' ||
    normalized === 'Responsável de célula' ||
    normalized === 'Responsável de área' ||
    normalized === 'Área'
  )
}

export function isEngineerSubcellSubtype(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  return normalized === 'Responsável por sub-célula' || normalized === 'Sub-área'
}

export function isEngineerProcessSubtype(value: string | null | undefined) {
  return (value?.trim() ?? '') === 'Processos específicos'
}

/** Converte rótulos legados para os atuais usados no cadastro. */
export function normalizeEngineerSubtype(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  if (
    normalized === 'Área' ||
    normalized === 'Responsável de área' ||
    normalized === 'Responsável de célula'
  ) {
    return 'Responsável por célula'
  }
  if (normalized === 'Sub-área') return 'Responsável por sub-célula'
  return normalized
}

/** Subáreas já atribuídas a outro engenheiro responsável por sub-célula. */
export function mapTakenSubcellAreas(
  users: Array<{
    id: string
    name: string
    approvalStatus?: string
    jobTitle?: string | null
    workArea?: string | null
    workSubtype?: string | null
    accessAreas?: string[] | null
  }>,
  excludeUserId?: string,
  options?: {
    candidateId?: string
    candidateSubtype?: string
    orgCells?: Array<{
      id: string
      responsibleUserId: string | null
      responsibleName: string | null
    }>
  },
): Map<string, string> {
  const taken = new Map<string, string>()
  for (const user of users) {
    if (excludeUserId && user.id === excludeUserId) continue
    if (user.approvalStatus && user.approvalStatus !== 'approved') continue
    if ((user.jobTitle?.trim() ?? '') !== 'Engenheiro') continue
    if (!isEngineerSubcellSubtype(user.workSubtype)) continue
    for (const area of user.accessAreas ?? []) {
      const normalized = area.trim()
      if (!normalized || taken.has(normalized)) continue
      taken.set(normalized, user.name)
    }
  }

  const candidateId = options?.candidateId
  const candidateSubtype = options?.candidateSubtype
  if (candidateId && isEngineerSubcellSubtype(candidateSubtype)) {
    for (const cell of options?.orgCells ?? []) {
      if (cell.responsibleUserId !== candidateId) continue
      const ownerLabel = cell.responsibleName?.trim() || 'Responsável pela célula'
      const portals = BUSINESS_AREA_TO_HOME_PORTALS[cell.id] ?? (cell.id ? [cell.id] : [])
      for (const portal of portals) {
        if (!taken.has(portal)) {
          taken.set(portal, `${ownerLabel} (célula)`)
        }
      }
    }
  }

  return taken
}

export {
  ENGINEER_HOME_SUBAREAS,
  PROCESSES_BY_HOME_SUBAREA,
  type EngineerHomeSubarea,
} from './orgStructure'

import {
  ENGINEER_HOME_SUBAREAS,
  PROCESSES_BY_HOME_SUBAREA,
  type EngineerHomeSubarea,
} from './orgStructure'

/** Alias usado em ranking/atribuições — processos por subcélula. */
export const PROCESSES_BY_AREA: Record<string, readonly string[]> = PROCESSES_BY_HOME_SUBAREA

/** Mapeia área de negócio do cadastro para subcélulas acessíveis. */
export const BUSINESS_AREA_TO_HOME_PORTALS: Record<string, readonly EngineerHomeSubarea[]> = {
  Medição: [
    'Medição',
    'Laboratório de Medição',
    'Laboratório de Homologação',
    'Equipe de campo',
    'Usuários',
    'Cadastros',
  ],
  Telemedição: ['Telemedição'],
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

/** Grupos de processos por subcélula (UI de processos específicos). */
export function getHomeSubareaProcessGroups(): Array<{
  area: EngineerHomeSubarea
  processes: readonly string[]
}> {
  return ENGINEER_HOME_SUBAREAS.map((area) => ({
    area,
    processes: PROCESSES_BY_HOME_SUBAREA[area],
  }))
}

/** @deprecated Use getHomeSubareaProcessGroups. */
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

/** Deriva subcélulas a partir dos processos específicos escolhidos. */
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

export function subtypesForCargo(
  jobTitle: string,
  workArea = '',
  options?: { csdScopes?: readonly string[] },
): readonly string[] {
  const cargo = jobTitle.trim()
  const area = workArea.trim()
  if (cargo === 'Engenheiro') {
    if (area === 'CSD') {
      return [...ENGINEER_SUBTYPES, ...CSD_ENGINEER_LAVRATURA_SCOPES]
    }
    return ENGINEER_SUBTYPES
  }
  // CSD: escopo obrigatório para qualquer cargo (própria ou terceira).
  if (area === 'CSD') {
    const fromCatalog = options?.csdScopes?.filter((item) => item.trim()) ?? []
    return fromCatalog.length > 0 ? fromCatalog : TECHNICIAN_SCOPES_BY_AREA.CSD
  }
  if (cargo === 'Técnico') {
    return TECHNICIAN_SCOPES_BY_AREA[area] ?? []
  }
  if (cargo === 'Analista' && area === 'Medição') {
    return ['Atividades administrativas da Medição']
  }
  return []
}

export function processCountForHomePortal(portal: string): number {
  return PROCESSES_BY_HOME_SUBAREA[portal as EngineerHomeSubarea]?.length ?? 0
}

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
    if (isEngineerAreaSubtype(workSubtype)) {
      const portals = BUSINESS_AREA_TO_HOME_PORTALS[workArea] ?? []
      return portals.reduce((sum, portal) => sum + processCountForHomePortal(portal), 0)
    }
    if (isEngineerSubcellSubtype(workSubtype)) {
      return (user.accessAreas ?? []).reduce(
        (sum, portal) => sum + processCountForHomePortal(portal),
        0,
      )
    }
    if (isEngineerProcessSubtype(workSubtype)) {
      return user.accessProcesses?.length ?? 0
    }
  }

  if ((jobTitle === 'Técnico' || workArea === 'CSD') && workSubtype) {
    return 1
  }

  return user.accessProcesses?.length ?? 0
}

/** Formata o 3º segmento do perfil (abrangência/escopo) no padrão de exibição. */
export function formatProfileDetail(workSubtype: string, jobTitle = ''): string {
  const cargo = jobTitle.trim()
  // Gestor e Estagiário: só Área – Cargo (sem complemento).
  if (cargo === 'Gestor' || cargo === 'Estagiário') return ''

  const normalized = workSubtype.trim()
  if (normalized === 'Lavratura de TOI - Equipe de Campo' || normalized === 'Lavratura de TOI') {
    return 'Lavratura de TOI – Equipe de Campo'
  }
  if (normalized === 'Lavratura de TOI - Ponto Focal') {
    return 'Lavratura de TOI – Ponto Focal'
  }
  if (normalized === 'Lavratura de TOI - Backoffice') {
    return 'Lavratura de TOI – Backoffice'
  }
  if (!normalized) return 'Não aplicável'
  return normalized
}

export function buildRequestedProfile(
  jobTitle: string,
  workSubtype: string,
  workArea: string,
  ...extraParts: Array<string | undefined | null>
): string {
  const detail = formatProfileDetail(workSubtype, jobTitle)
  return [workArea, jobTitle, detail, ...extraParts]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' – ')
}
