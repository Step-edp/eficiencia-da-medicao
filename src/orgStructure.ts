/**
 * Hierarquia operacional:
 * Área (gestor) → Células (engenheiro dono) → Subcélulas (engenheiro responsável)
 * → Processos (responsável + executor).
 */

export type OrgAreaId = 'Gestão'
export type OrgCellId = 'Medição' | 'Telemedição'
export type OrgSubcellId =
  | 'Medição'
  | 'Laboratório de Medição'
  | 'Laboratório de Homologação'
  | 'Equipe de campo'
  | 'Usuários'
  | 'Cadastros'

export type OrgSubcell = {
  id: OrgSubcellId
  label: string
  /** Chave do portal / tela existente no App. */
  portalKey: OrgSubcellId
  description: string
}

export type OrgCell = {
  id: OrgCellId
  label: string
  description: string
  /** Engenheiro Dono da Área (célula). */
  ownerRoleLabel: 'Engenheiro Dono de Área'
  subcells: readonly OrgSubcell[]
}

export type OrgArea = {
  id: OrgAreaId
  label: string
  description: string
  /** Um gestor por área. */
  managerRoleLabel: 'Gestor'
  cells: readonly OrgCell[]
}

export const ORG_STRUCTURE: OrgArea = {
  id: 'Gestão',
  label: 'Gestão',
  description:
    'Área gerencial do portal. Cada área conta com um gestor; as células e subcélulas organizam a operação.',
  managerRoleLabel: 'Gestor',
  cells: [
    {
      id: 'Medição',
      label: 'Medição',
      description:
        'Célula liderada por um Engenheiro Dono de Área, com subcélulas e processos sob engenheiros responsáveis.',
      ownerRoleLabel: 'Engenheiro Dono de Área',
      subcells: [
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
      ],
    },
    {
      id: 'Telemedição',
      label: 'Telemedição',
      description:
        'Célula de Telemedição. Subcélulas ainda em definição.',
      ownerRoleLabel: 'Engenheiro Dono de Área',
      subcells: [],
    },
  ],
}

export function getOrgCell(cellId: string): OrgCell | undefined {
  return ORG_STRUCTURE.cells.find((cell) => cell.id === cellId)
}

export function getOrgSubcell(cellId: string, subcellId: string): OrgSubcell | undefined {
  return getOrgCell(cellId)?.subcells.find((item) => item.id === subcellId)
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
