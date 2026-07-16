/** Catálogo servidor: processos por subcélula (espelha orgStructure / registrationOptions). */

export const ENGINEER_HOME_SUBAREAS = [
  'Medição',
  'Laboratório de Medição',
  'Laboratório de Homologação',
  'Equipe de campo',
  'Usuários',
  'Cadastros',
  'Telemedição',
] as const

export type EngineerHomeSubarea = (typeof ENGINEER_HOME_SUBAREAS)[number]

export const PROCESSES_BY_HOME_SUBAREA: Record<EngineerHomeSubarea, readonly string[]> = {
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
  'Equipe de campo': [
    'Agendar',
    'Consultar',
    'Lavratura de TOI',
    'Lavratura de TOI - Ponto Focal',
    'Leituras de faturamento',
  ],
  Usuários: ['Gestão de usuários', 'Aprovação de cadastros', 'Dashboard de usuários'],
  Cadastros: ['Listas suspensas', 'Perfis de acesso'],
  Telemedição: [
    'Monitoramento remoto',
    'Coleta de dados em tempo real',
    'Gestão de alertas',
  ],
}

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

export function isValidCrossAreaProcess(_ownWorkArea: string, encoded: string): boolean {
  return isValidHomeSubareaProcess(encoded)
}

export const ENGINEER_SUBTYPES = [
  'Responsável por célula',
  'Responsável por sub-célula',
] as const

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

export function isAllowedEngineerSubtype(value: string | null | undefined) {
  const normalized = normalizeEngineerSubtype(value)
  return (
    (ENGINEER_SUBTYPES as readonly string[]).includes(normalized) ||
    isEngineerProcessSubtype(normalized)
  )
}

/** Subáreas já atribuídas a outro engenheiro responsável por sub-célula. */
export function mapTakenSubcellAreas(
  users: Array<{
    id: string
    name: string
    approvalStatus?: string
    jobTitle?: string | null
    workSubtype?: string | null
    accessAreas?: string[] | null
  }>,
  excludeUserId?: string,
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
  return taken
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
