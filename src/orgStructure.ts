/**
 * Hierarquia operacional:
 * Área (gestor) → Células (engenheiro dono / responsável) → Subcélulas
 * → Processos (até 3 executores).
 *
 * Células padrão vêm de ORG_STRUCTURE; células criadas pelo gestor
 * são persistidas em org_cells e mescladas em tempo de execução.
 */

export type OrgAreaId = string
export type OrgCellId = string
export type OrgSubcellId =
  | 'Medição'
  | 'Laboratório de Medição'
  | 'Laboratório de Homologação'
  | 'Equipe de campo'
  | 'Usuários'
  | 'Cadastros'

export type OrgSubcell = {
  id: OrgSubcellId | string
  label: string
  /** Chave do portal / tela existente no App. */
  portalKey: string
  description: string
}

export type OrgCellStatus = 'pendente' | 'ativa'

export function leadershipPendingReason(
  responsibleUserId: string | null | undefined,
  substituteUserId: string | null | undefined,
): string | null {
  const hasResponsible = Boolean(responsibleUserId)
  const hasSubstitute = Boolean(substituteUserId)
  if (hasResponsible && hasSubstitute) return null
  if (!hasResponsible && !hasSubstitute) {
    return 'Sem responsável e sem substituto'
  }
  if (!hasResponsible) return 'Sem responsável'
  return 'Sem substituto'
}

export type OrgCell = {
  id: OrgCellId
  areaId?: string
  label: string
  description: string
  /** Engenheiro responsável pela célula. */
  ownerRoleLabel: 'Engenheiro Responsável por célula'
  subcells: readonly OrgSubcell[]
  responsibleUserId?: string | null
  responsibleName?: string | null
  substituteUserId?: string | null
  substituteName?: string | null
  /** Sem responsável ou sem substituto = pendente. */
  status?: OrgCellStatus
}

export type OrgAreaLeadership = {
  id: OrgAreaId
  label: string
  description: string
  responsibleUserId: string | null
  responsibleName: string | null
  substituteUserId: string | null
  substituteName: string | null
  status: OrgCellStatus
}

export type OrgArea = {
  id: OrgAreaId
  label: string
  description: string
  /** Um gestor (responsável) e um substituto por área. */
  managerRoleLabel: 'Gestor'
  cells: readonly OrgCell[]
}

const MEDICAO_SUBCELLS: readonly OrgSubcell[] = [
  {
    id: 'Medição',
    label: 'Medição',
    portalKey: 'Medição',
    description: 'Processos de faturamento, massa, migração e ferramentas de medição.',
  },
  {
    id: 'Laboratório de Medição',
    label: 'Laboratório de Medição',
    portalKey: 'Laboratório de Medição',
    description: 'Trilha laboratorial, ensaios, auditoria e inventário.',
  },
  {
    id: 'Laboratório de Homologação',
    label: 'Laboratório de Homologação',
    portalKey: 'Laboratório de Homologação',
    description: 'Ensaios, pedidos de homologação e código de materiais.',
  },
  {
    id: 'Equipe de campo',
    label: 'Equipe de campo',
    portalKey: 'Equipe de campo',
    description: 'Agendamento e consulta de medidores em campo.',
  },
  {
    id: 'Usuários',
    label: 'Usuários',
    portalKey: 'Usuários',
    description: 'Gestão de cadastros, aprovações e perfis de acesso.',
  },
  {
    id: 'Cadastros',
    label: 'Cadastros',
    portalKey: 'Cadastros',
    description: 'Listas suspensas, perfis e dados de apoio do portal.',
  },
]

/** Subcélulas pré-definidas por id de célula conhecida. */
export const DEFAULT_SUBCELLS_BY_CELL: Record<string, readonly OrgSubcell[]> = {
  Medição: MEDICAO_SUBCELLS,
  Telemedição: [],
}

export const ORG_STRUCTURE: OrgArea = {
  id: 'Gestão Operacional',
  label: 'Gestão Operacional',
  description:
    'Área gerencial do portal. Cada área conta com um gestor; as células e subcélulas organizam a operação.',
  managerRoleLabel: 'Gestor',
  cells: [
    {
      id: 'Medição',
      label: 'Medição',
      description:
        'Célula liderada por um Engenheiro Responsável por célula, com subcélulas e processos sob engenheiros responsáveis por sub-célula.',
      ownerRoleLabel: 'Engenheiro Responsável por célula',
      subcells: MEDICAO_SUBCELLS,
      status: 'pendente',
    },
    {
      id: 'Telemedição',
      label: 'Telemedição',
      description: 'Célula de Telemedição. Subcélulas ainda em definição.',
      ownerRoleLabel: 'Engenheiro Responsável por célula',
      subcells: [],
      status: 'pendente',
    },
  ],
}

export type OrgCellRecord = {
  id: string
  areaId?: string
  label: string
  description: string
  responsibleUserId: string | null
  responsibleName: string | null
  substituteUserId: string | null
  substituteName: string | null
  status: OrgCellStatus
}

/** Mescla células do banco com o template de subcélulas conhecidas. */
export function buildOrgCellsFromRecords(records: OrgCellRecord[]): OrgCell[] {
  if (!records.length) {
    return ORG_STRUCTURE.cells.map((cell) => ({
      ...cell,
      areaId: ORG_STRUCTURE.id,
    }))
  }
  return records.map((record) => ({
    id: record.id,
    areaId: record.areaId,
    label: record.label,
    description: record.description,
    ownerRoleLabel: 'Engenheiro Responsável por célula',
    subcells: DEFAULT_SUBCELLS_BY_CELL[record.id] ?? [],
    responsibleUserId: record.responsibleUserId,
    responsibleName: record.responsibleName,
    substituteUserId: record.substituteUserId,
    substituteName: record.substituteName,
    status: record.status,
  }))
}

export const DEFAULT_ORG_AREA_LEADERSHIP: OrgAreaLeadership = {
  id: 'Gestão Operacional',
  label: 'Gestão Operacional',
  description: ORG_STRUCTURE.description,
  responsibleUserId: null,
  responsibleName: null,
  substituteUserId: null,
  substituteName: null,
  status: 'pendente',
}

export function getOrgCell(
  cellId: string,
  cells: readonly OrgCell[] = ORG_STRUCTURE.cells,
): OrgCell | undefined {
  return cells.find((cell) => cell.id === cellId)
}

export function getOrgSubcell(
  cellId: string,
  subcellId: string,
  cells: readonly OrgCell[] = ORG_STRUCTURE.cells,
): OrgSubcell | undefined {
  return getOrgCell(cellId, cells)?.subcells.find((item) => item.id === subcellId)
}

export type GestaoDashboardStats = {
  cellCount: number
  pendingCellCount: number
  subcellCount: number
  processCount: number
  processesBySubcell: Array<{
    cellId: string
    cellLabel: string
    subcellId: string
    subcellLabel: string
    processCount: number
  }>
}

/** Indicadores do dashboard gerencial da área Gestão Operacional. */
export function getGestaoDashboardStats(
  cells: readonly OrgCell[] = ORG_STRUCTURE.cells,
): GestaoDashboardStats {
  const processesBySubcell: GestaoDashboardStats['processesBySubcell'] = []

  for (const cell of cells) {
    if (cell.subcells.length === 0) {
      const processes =
        PROCESSES_BY_HOME_SUBAREA[cell.id as EngineerHomeSubarea] ?? []
      if (processes.length > 0) {
        processesBySubcell.push({
          cellId: cell.id,
          cellLabel: cell.label,
          subcellId: cell.id,
          subcellLabel: `${cell.label} (célula)`,
          processCount: processes.length,
        })
      }
      continue
    }

    for (const sub of cell.subcells) {
      const processes =
        PROCESSES_BY_HOME_SUBAREA[sub.portalKey as EngineerHomeSubarea] ?? []
      processesBySubcell.push({
        cellId: cell.id,
        cellLabel: cell.label,
        subcellId: sub.id,
        subcellLabel: sub.label,
        processCount: processes.length,
      })
    }
  }

  return {
    cellCount: cells.length,
    pendingCellCount: cells.filter((cell) => cell.status !== 'ativa').length,
    subcellCount: cells.reduce((sum, cell) => sum + cell.subcells.length, 0),
    processCount: processesBySubcell.reduce(
      (sum, item) => sum + item.processCount,
      0,
    ),
    processesBySubcell,
  }
}

/** Subcélulas usadas em cadastro/aprovação de engenheiro (com processos). */
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

/**
 * Processos por subcélula.
 * Codificação: `Subcélula::Processo`.
 */
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
    'Minha produtividade',
    'Consultar RATM',
    'Consultar Medidor',
    'Calendário de ensaios',
    'Reagendar',
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
    'Suporte',
    'Treinamentos',
    'Softwares',
    'Adicionar passivo',
  ],
  'Laboratório de Homologação': [
    'Código de materiais',
    'Pedidos de Homologação',
    'Ensaio',
    'Homologações',
  ],
  'Equipe de campo': [
    'Agendar',
    'Consultar',
    'Meus TOIs',
    'Lavratura de TOI - Equipe de Campo',
    'Lavratura de TOI - Ponto Focal',
    'Lavratura de TOI - Backoffice',
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

export function encodeOrgScope(parts: string[]): string {
  return parts.join('::')
}

export function orgAreaScopeKey() {
  return encodeOrgScope([ORG_STRUCTURE.id])
}

export function orgCellScopeKey(cellId: string) {
  return encodeOrgScope([ORG_STRUCTURE.id, cellId])
}

export function orgSubcellScopeKey(cellId: string, subcellId: string) {
  return encodeOrgScope([ORG_STRUCTURE.id, cellId, subcellId])
}
