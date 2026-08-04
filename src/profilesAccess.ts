import type { UserRole } from './api'
import {
  BUSINESS_AREA_TO_HOME_PORTALS,
  isConsumoIrregularWorkArea,
  isEngineerAreaSubtype,
  isEngineerSubcellSubtype,
} from './registrationOptions'

/** Áreas do portal (portas/telas navegáveis). */
export const PORTAL_AREAS = [
  'Gestão Operacional',
  'Medição',
  'Laboratório de Medição',
  'Laboratório de Homologação',
  'Telemedição',
  'Equipe de campo',
  'Usuários',
  'Cadastros',
  'Agenda',
] as const

export type PortalArea = (typeof PORTAL_AREAS)[number]

export function portalsToHomeCards(portals: readonly PortalArea[]): readonly PortalArea[] {
  const hasAgenda = portals.includes('Agenda')
  const withoutAgenda = portals.filter((portal) => portal !== 'Agenda')

  // Gestor: um único card Gestão Operacional. Responsável por célula vê todas as áreas
  // (trata-se em getHomeAreasForUser / getHomeAreasForProfilePreview).
  const cards: PortalArea[] = withoutAgenda.includes('Gestão Operacional')
    ? ['Gestão Operacional']
    : [...withoutAgenda]

  if (hasAgenda && !cards.includes('Agenda')) {
    cards.push('Agenda')
  }

  return cards
}

/** Mantém a ordem do catálogo de portais, sem colapsar em Gestão Operacional. */
function portalsInCatalogOrder(portals: readonly PortalArea[]): readonly PortalArea[] {
  return PORTAL_AREAS.filter((area) => portals.includes(area))
}

/** Acesso especial fora dos cards da home. */
export const COMPRAS_DEDICATED_ACCESS = 'Pedidos de Homologação' as const

export type ProfileAccessArea = PortalArea | typeof COMPRAS_DEDICATED_ACCESS

/** Perfis de negócio e áreas que cada um visualiza no portal. */
export type CadastroProfile = {
  id: string
  name: string
  description: string
  areas: PortalArea[]
  /** Critérios para localizar usuários reais com esse perfil. */
  match: {
    workArea: string
    jobTitle: string
    workSubtype?: string
    /** Engenheiro responsável por sub-célula: exige esta área na home. */
    accessArea?: PortalArea
  }
}

/** Padrão: Área – Cargo – (abrangência/escopo quando houver). */
function profileName(workArea: string, jobTitle: string, detail?: string) {
  return [workArea, jobTitle, detail]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' – ')
}

const MEDICAO_CELL_AREAS: PortalArea[] = [
  'Medição',
  'Laboratório de Medição',
  'Laboratório de Homologação',
  'Equipe de campo',
  'Usuários',
  'Cadastros',
]

const MEDICAO_SUBCELL_AREAS: PortalArea[] = [
  'Medição',
  'Laboratório de Medição',
  'Laboratório de Homologação',
  'Equipe de campo',
  'Usuários',
  'Cadastros',
]

export const CADASTRO_PROFILES: CadastroProfile[] = [
  // CSD – Lavratura de TOI (Equipe de Campo | Ponto Focal | Backoffice)
  {
    id: 'csd-tecnico-equipe-campo',
    name: profileName('CSD', 'Técnico', 'Lavratura de TOI – Equipe de Campo'),
    description:
      'Agendar e acompanhar Meus TOIs na Equipe de campo para medidores destinados a ensaios no Laboratório de Medição.',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Técnico',
      workSubtype: 'Lavratura de TOI - Equipe de Campo',
    },
  },
  {
    id: 'csd-analista-equipe-campo',
    name: profileName('CSD', 'Analista', 'Lavratura de TOI – Equipe de Campo'),
    description:
      'Agendar e acompanhar Meus TOIs na Equipe de campo para equipamentos provenientes de lavratura de TOI.',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Analista',
      workSubtype: 'Lavratura de TOI - Equipe de Campo',
    },
  },
  {
    id: 'csd-tecnico-ponto-focal',
    name: profileName('CSD', 'Técnico', 'Lavratura de TOI – Ponto Focal'),
    description:
      'Agendar, consultar e acompanhar o Dashboard de atrasos na Equipe de campo, informando a equipe que executou o TOI, com acesso a Suporte e Agenda.',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Técnico',
      workSubtype: 'Lavratura de TOI - Ponto Focal',
    },
  },
  {
    id: 'csd-analista-ponto-focal',
    name: profileName('CSD', 'Analista', 'Lavratura de TOI – Ponto Focal'),
    description:
      'Agendar, consultar e acompanhar o Dashboard de atrasos na Equipe de campo, informando a equipe que executou o TOI, com acesso a Suporte e Agenda.',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Analista',
      workSubtype: 'Lavratura de TOI - Ponto Focal',
    },
  },
  {
    id: 'csd-tecnico-backoffice',
    name: profileName('CSD', 'Técnico', 'Lavratura de TOI – Backoffice'),
    description:
      'Agendar Meus TOIs na Equipe de campo em nome de uma equipe, informando os colaboradores que lavraram o TOI.',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Técnico',
      workSubtype: 'Lavratura de TOI - Backoffice',
    },
  },
  {
    id: 'csd-analista-backoffice',
    name: profileName('CSD', 'Analista', 'Lavratura de TOI – Backoffice'),
    description:
      'Agendar Meus TOIs na Equipe de campo em nome de uma equipe, informando os colaboradores que lavraram o TOI.',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Analista',
      workSubtype: 'Lavratura de TOI - Backoffice',
    },
  },
  {
    id: 'csd-engenheiro-equipe-campo',
    name: profileName('CSD', 'Engenheiro', 'Lavratura de TOI – Equipe de Campo'),
    description:
      'Agendar e acompanhar Meus TOIs na Equipe de campo para medidores destinados a ensaios no Laboratório de Medição.',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Engenheiro',
      workSubtype: 'Lavratura de TOI - Equipe de Campo',
    },
  },
  {
    id: 'csd-engenheiro-ponto-focal',
    name: profileName('CSD', 'Engenheiro', 'Lavratura de TOI – Ponto Focal'),
    description:
      'Agendar, consultar e acompanhar o Dashboard de atrasos na Equipe de campo, informando a equipe que executou o TOI, com acesso a Suporte e Agenda.',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Engenheiro',
      workSubtype: 'Lavratura de TOI - Ponto Focal',
    },
  },
  {
    id: 'csd-engenheiro-backoffice',
    name: profileName('CSD', 'Engenheiro', 'Lavratura de TOI – Backoffice'),
    description:
      'Agendar Meus TOIs na Equipe de campo em nome de uma equipe, informando os colaboradores que lavraram o TOI.',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Engenheiro',
      workSubtype: 'Lavratura de TOI - Backoffice',
    },
  },
  // CSD – Leituras de faturamento
  {
    id: 'csd-tecnico-leituras',
    name: profileName('CSD', 'Técnico', 'Leituras de faturamento'),
    description:
      'Consultar senhas cadastradas direto na home. Sem acesso à Equipe de campo nem ao card Medição.',
    areas: ['Medição'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Técnico',
      workSubtype: 'Leituras de faturamento',
    },
  },
  {
    id: 'csd-analista-leituras',
    name: profileName('CSD', 'Analista', 'Leituras de faturamento'),
    description:
      'Consultar senhas cadastradas direto na home. Sem acesso à Equipe de campo nem ao card Medição.',
    areas: ['Medição'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Analista',
      workSubtype: 'Leituras de faturamento',
    },
  },
  // Medição – Técnico (escopo operacional)
  {
    id: 'medicao-tecnico-laboratorio',
    name: profileName('Medição', 'Técnico', 'Laboratório de Medição'),
    description:
      'Executar atividades operacionais do Laboratório de Medição, incluindo processamento, análise e registro dos ensaios.',
    areas: ['Laboratório de Medição'],
    match: {
      workArea: 'Medição',
      jobTitle: 'Técnico',
      workSubtype: 'Laboratório de Medição',
    },
  },
  {
    id: 'medicao-tecnico-administrativo',
    name: profileName('Medição', 'Técnico', 'Atividades administrativas da Medição'),
    description: 'Executar atividades administrativas da Medição.',
    areas: ['Medição'],
    match: {
      workArea: 'Medição',
      jobTitle: 'Técnico',
      workSubtype: 'Atividades administrativas da Medição',
    },
  },
  // Engenheiro – Responsável por célula | Responsável por sub-célula
  {
    id: 'engenheiro-responsavel-celula-medicao',
    name: profileName('Medição', 'Engenheiro', 'Responsável por célula'),
    description:
      'Engenheiro responsável pela célula Medição: acessa apenas o conteúdo da célula (Medição, laboratórios, Equipe de campo, Usuários e Cadastros). Gestão Operacional fica com o gestor da área.',
    areas: MEDICAO_CELL_AREAS,
    match: {
      workArea: 'Medição',
      jobTitle: 'Engenheiro',
      workSubtype: 'Responsável por célula',
    },
  },
  {
    id: 'engenheiro-responsavel-subcelula-medicao',
    name: profileName('Medição', 'Engenheiro', 'Responsável por sub-célula'),
    description:
      'Engenheiro responsável por uma ou mais subcélulas da Medição (definidas na aprovação).',
    areas: MEDICAO_SUBCELL_AREAS,
    match: {
      workArea: 'Medição',
      jobTitle: 'Engenheiro',
      workSubtype: 'Responsável por sub-célula',
    },
  },
  {
    id: 'engenheiro-responsavel-celula-telemedicao',
    name: profileName('Telemedição', 'Engenheiro', 'Responsável por célula'),
    description:
      'Engenheiro responsável pela célula Telemedição: acessa o conteúdo da célula. Gestão Operacional fica com o gestor da área.',
    areas: ['Telemedição'],
    match: {
      workArea: 'Telemedição',
      jobTitle: 'Engenheiro',
      workSubtype: 'Responsável por célula',
    },
  },
  {
    id: 'engenheiro-responsavel-subcelula-telemedicao',
    name: profileName('Telemedição', 'Engenheiro', 'Responsável por sub-célula'),
    description:
      'Engenheiro responsável por subcélula(s) de Telemedição (definidas na aprovação).',
    areas: ['Telemedição'],
    match: {
      workArea: 'Telemedição',
      jobTitle: 'Engenheiro',
      workSubtype: 'Responsável por sub-célula',
    },
  },
  {
    id: 'engenheiro-responsavel-celula-csd',
    name: profileName('CSD', 'Engenheiro', 'Responsável por célula'),
    description:
      'Engenheiro responsável pela célula CSD: acessa Equipe de campo. Gestão Operacional fica com o gestor da área.',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Engenheiro',
      workSubtype: 'Responsável por célula',
    },
  },
  {
    id: 'engenheiro-responsavel-subcelula-csd',
    name: profileName('CSD', 'Engenheiro', 'Responsável por sub-célula'),
    description:
      'Engenheiro responsável por subcélula(s) do CSD (definidas na aprovação).',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Engenheiro',
      workSubtype: 'Responsável por sub-célula',
    },
  },
  // Gestor: apenas Área – Gestor (a área é a selecionada no cadastro)
  {
    id: 'gestor-medicao',
    name: profileName('Medição', 'Gestor'),
    description:
      'Acesso aos indicadores e dashboards consolidados das áreas de Medição sob sua concessão.',
    areas: ['Gestão Operacional', 'Medição'],
    match: {
      workArea: 'Medição',
      jobTitle: 'Gestor',
    },
  },
  {
    id: 'gestor-telemedicao',
    name: profileName('Telemedição', 'Gestor'),
    description:
      'Acesso aos indicadores e dashboards da área de Telemedição sob sua concessão.',
    areas: ['Gestão Operacional', 'Telemedição'],
    match: {
      workArea: 'Telemedição',
      jobTitle: 'Gestor',
    },
  },
  {
    id: 'gestor-csd',
    name: profileName('CSD', 'Gestor'),
    description: 'Acesso gerencial da área CSD sob sua concessão.',
    areas: ['Gestão Operacional', 'Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Gestor',
    },
  },
  {
    id: 'analista-medicao',
    name: profileName('Medição', 'Analista', 'Atividades administrativas da Medição'),
    description: 'Executar atividades administrativas da Medição.',
    areas: ['Medição'],
    match: {
      workArea: 'Medição',
      jobTitle: 'Analista',
      workSubtype: 'Atividades administrativas da Medição',
    },
  },
  {
    id: 'estagiario-medicao',
    name: profileName('Medição', 'Estagiário'),
    description:
      'Home com Agenda e Suporte; visualiza apenas os processos que forem atribuídos.',
    // Sem card de área: só Agenda (automática) + Suporte na home.
    areas: [],
    match: {
      workArea: 'Medição',
      jobTitle: 'Estagiário',
    },
  },
  {
    id: 'consumo-irregular',
    name: profileName('Consumo Irregular', 'Operacional'),
    description:
      'Acesso a Reagendar, Consultar Medidor e Consultar RATM no Laboratório de Medição.',
    areas: ['Laboratório de Medição'],
    match: {
      workArea: 'Consumo Irregular',
      jobTitle: 'Técnico',
    },
  },
  {
    id: 'consumo-irregular-analista',
    name: profileName('Consumo Irregular', 'Analista'),
    description:
      'Acesso a Reagendar, Consultar Medidor e Consultar RATM no Laboratório de Medição.',
    areas: ['Laboratório de Medição'],
    match: {
      workArea: 'Consumo Irregular',
      jobTitle: 'Analista',
    },
  },
  {
    id: 'consumo-irregular-engenheiro',
    name: profileName('Consumo Irregular', 'Engenheiro'),
    description:
      'Acesso a Reagendar, Consultar Medidor e Consultar RATM no Laboratório de Medição.',
    areas: ['Laboratório de Medição'],
    match: {
      workArea: 'Consumo Irregular',
      jobTitle: 'Engenheiro',
    },
  },
]

/** Área Consumo Irregular: Reagendar, Consultar Medidor e Consultar RATM. */
export function isConsumoIrregular(user: { workArea?: string | null }) {
  return isConsumoIrregularWorkArea(user.workArea)
}

/** Estagiário da Medição: Agenda + Suporte + lista de processos atribuídos. */
export function isMedicaoEstagiario(user: {
  workArea?: string | null
  jobTitle?: string | null
}) {
  return (
    (user.workArea?.trim() ?? '') === 'Medição' &&
    (user.jobTitle?.trim() ?? '') === 'Estagiário'
  )
}

/** Engenheiro responsável pela célula Medição (inclui subtypes legados). */
export function isMedicaoCellOwner(user: {
  jobTitle?: string | null
  workArea?: string | null
  workSubtype?: string | null
}) {
  return (
    (user.jobTitle?.trim() ?? '') === 'Engenheiro' &&
    (user.workArea?.trim() ?? '') === 'Medição' &&
    isEngineerAreaSubtype(user.workSubtype)
  )
}

/** Pode abrir o Lab de Medição, mas só visualizar (sem criar/editar/executar). */
export function isLabMedicaoViewOnly(user: {
  jobTitle?: string | null
  workArea?: string | null
  workSubtype?: string | null
}) {
  return isMedicaoCellOwner(user)
}

/** IDs antigos → id atual (pré-visualização / favoritos do admin). */
const CADASTRO_PROFILE_ID_ALIASES: Record<string, string> = {
  'tecnico-inspecao': 'csd-tecnico-equipe-campo',
  'analista-lavratura-toi': 'csd-analista-equipe-campo',
  'ponto-focal-inspecao': 'csd-tecnico-ponto-focal',
  'backoffice-inspecao': 'csd-analista-backoffice',
  'tecnico-laboratorio-medicao': 'medicao-tecnico-laboratorio',
  'engenheiro-dono-area-medicao': 'engenheiro-responsavel-celula-medicao',
  'engenheiro-dono-area-telemedicao': 'engenheiro-responsavel-celula-telemedicao',
  'engenheiro-responsavel-medicao': 'engenheiro-responsavel-subcelula-medicao',
  'engenheiro-responsavel-laboratorio-medicao': 'engenheiro-responsavel-subcelula-medicao',
  'engenheiro-responsavel-subcelula-laboratorio': 'engenheiro-responsavel-subcelula-medicao',
  'engenheiro-responsavel-subcelula-homologacao': 'engenheiro-responsavel-subcelula-medicao',
  'engenheiro-responsavel-subcelula-equipe-campo': 'engenheiro-responsavel-subcelula-medicao',
  'engenheiro-responsavel-subcelula-usuarios': 'engenheiro-responsavel-subcelula-medicao',
  'engenheiro-responsavel-subcelula-cadastros': 'engenheiro-responsavel-subcelula-medicao',
  'engenheiro-responsavel-telemedicao': 'engenheiro-responsavel-subcelula-telemedicao',
}

export const ADMIN_PREVIEW_PROFILE_ID = 'admin-completo'

/** Controle de acesso técnico do portal (JWT / home). */
const SYSTEM_ROLE_ACCESS: Record<
  UserRole,
  { label: string; areas: ProfileAccessArea[] }
> = {
  admin: {
    label: 'Administrador',
    areas: [...PORTAL_AREAS],
  },
  compras: {
    label: 'Compras',
    areas: [COMPRAS_DEDICATED_ACCESS],
  },
  field: {
    label: 'Equipe de campo',
    areas: ['Equipe de campo'],
  },
}

export function roleLabel(role: UserRole): string {
  return SYSTEM_ROLE_ACCESS[role]?.label ?? role
}

export function getHomeAreasForRole(role: UserRole): readonly PortalArea[] {
  const areas = SYSTEM_ROLE_ACCESS[role]?.areas ?? []
  return portalsToHomeCards(PORTAL_AREAS.filter((area) => areas.includes(area)))
}

/** Normaliza hífens tipográficos para comparação de escopos. */
export function normalizeWorkSubtype(workSubtype?: string | null) {
  return (workSubtype?.trim() ?? '')
    .replace(/\u2013/g, '-') // en-dash
    .replace(/\u2014/g, '-') // em-dash
}

/** Escopo CSD – Leituras de faturamento (consulta de senhas em Medição). */
export function isCsdLeiturasFaturamentoScope(workSubtype?: string | null) {
  return normalizeWorkSubtype(workSubtype) === 'Leituras de faturamento'
}

/** Escopos CSD que liberam Equipe de campo (Agendar / Consultar). */
export function isFieldTeamCsdScope(workSubtype?: string | null) {
  const normalized = normalizeWorkSubtype(workSubtype)
  return (
    normalized === 'Lavratura de TOI - Equipe de Campo' ||
    normalized === 'Lavratura de TOI' || // legado
    normalized === 'Lavratura de TOI - Ponto Focal' ||
    normalized === 'Lavratura de TOI - Backoffice'
  )
}

/** Escopo Lavratura de TOI - Equipe de Campo (inclui legado). */
export function isLavraturaEquipeCampoScope(workSubtype?: string | null) {
  const normalized = normalizeWorkSubtype(workSubtype)
  return (
    normalized === 'Lavratura de TOI - Equipe de Campo' ||
    normalized === 'Lavratura de TOI' // legado
  )
}

/** Escopo CSD – Ponto Focal – Inspeção. */
export function isLavraturaPontoFocalScope(workSubtype?: string | null) {
  return normalizeWorkSubtype(workSubtype) === 'Lavratura de TOI - Ponto Focal'
}

/** Backoffice agenda em nome da equipe e exige colaboradores no formulário. */
export function isLavraturaBackofficeScope(workSubtype?: string | null) {
  return normalizeWorkSubtype(workSubtype) === 'Lavratura de TOI - Backoffice'
}

/** Equipe de Campo e Backoffice não usam Agenda de férias. */
export function skipsVacationAgenda(workSubtype?: string | null) {
  const normalized = normalizeWorkSubtype(workSubtype)
  return (
    normalized === 'Lavratura de TOI - Equipe de Campo' ||
    normalized === 'Lavratura de TOI' || // legado
    normalized === 'Lavratura de TOI - Backoffice'
  )
}

/** Portais que o usuário pode abrir (sem colapsar em Gestão Operacional). */
export function getAccessiblePortals(user: {
  role: UserRole
  accessAreas?: string[] | null
  workArea?: string | null
  jobTitle?: string | null
  workSubtype?: string | null
  approvalStatus?: string
}): readonly PortalArea[] {
  const assigned = (user.accessAreas ?? []).filter((area): area is PortalArea =>
    (PORTAL_AREAS as readonly string[]).includes(area),
  )

  let portals: PortalArea[]
  if (assigned.length > 0) {
    portals = PORTAL_AREAS.filter((area) => assigned.includes(area))
  } else {
    const matchedProfile = CADASTRO_PROFILES.find((profile) =>
      userMatchesCadastroProfile(
        {
          ...user,
          approvalStatus: user.approvalStatus ?? 'approved',
        },
        profile,
      ),
    )
    if (matchedProfile) {
      portals = PORTAL_AREAS.filter((area) => matchedProfile.areas.includes(area))
    } else {
      const areas = SYSTEM_ROLE_ACCESS[user.role]?.areas ?? []
      portals = PORTAL_AREAS.filter((area) => areas.includes(area))
    }
  }

  // Responsável por célula: só o conteúdo da célula (não a área Gestão Operacional).
  if (
    (user.jobTitle?.trim() ?? '') === 'Engenheiro' &&
    isEngineerAreaSubtype(user.workSubtype)
  ) {
    const workArea = user.workArea?.trim() ?? ''
    const cellPortals = BUSINESS_AREA_TO_HOME_PORTALS[workArea] ?? []
    portals = PORTAL_AREAS.filter(
      (area) =>
        area !== 'Gestão Operacional' &&
        (portals.includes(area) || (cellPortals as readonly string[]).includes(area)),
    )
  }

  // Lavratura de TOI (e Ponto Focal) sempre acessam Equipe de campo → Agendar/Consultar.
  if (
    user.workArea?.trim() === 'CSD' &&
    isFieldTeamCsdScope(user.workSubtype) &&
    !portals.includes('Equipe de campo')
  ) {
    portals = [...portals, 'Equipe de campo']
  }

  // CSD Leituras de faturamento: Medição (consulta de senha), sem Equipe de campo.
  if (
    user.workArea?.trim() === 'CSD' &&
    isCsdLeiturasFaturamentoScope(user.workSubtype)
  ) {
    portals = portals.filter((portal) => portal !== 'Equipe de campo')
    if (!portals.includes('Medição')) {
      portals = [...portals, 'Medição']
    }
  }

  // Consumo Irregular: Laboratório de Medição (Reagendar, Consultar Medidor, Consultar RATM).
  if (isConsumoIrregular(user) && !portals.includes('Laboratório de Medição')) {
    portals = [...portals, 'Laboratório de Medição']
  }

  if (skipsVacationAgenda(user.workSubtype)) {
    portals = portals.filter((portal) => portal !== 'Agenda')
  } else if (!portals.includes('Agenda')) {
    portals = [...portals, 'Agenda']
  }
  return portals
}

/** Home do usuário: gestor colapsa em Gestão Operacional; responsável por célula vê só o conteúdo da célula. */
export function getHomeAreasForUser(user: {
  role: UserRole
  accessAreas?: string[] | null
  workArea?: string | null
  jobTitle?: string | null
  workSubtype?: string | null
  approvalStatus?: string
}): readonly PortalArea[] {
  const portals = getAccessiblePortals(user)
  const isCellOwner =
    (user.jobTitle?.trim() ?? '') === 'Engenheiro' &&
    isEngineerAreaSubtype(user.workSubtype)

  if (isCellOwner) {
    return portalsInCatalogOrder(
      portals.filter((portal) => portal !== 'Gestão Operacional'),
    )
  }

  return portalsToHomeCards(portals)
}

export function getCadastroProfile(profileId: string): CadastroProfile | undefined {
  const resolvedId = CADASTRO_PROFILE_ID_ALIASES[profileId] ?? profileId
  return CADASTRO_PROFILES.find((profile) => profile.id === resolvedId)
}

/** Perfis agrupados por área para o seletor do administrador. */
export function groupCadastroProfilesByArea(): Array<{
  area: string
  profiles: CadastroProfile[]
}> {
  const preferredOrder = ['CSD', 'Medição', 'Telemedição']
  const groups = new Map<string, CadastroProfile[]>()

  for (const profile of CADASTRO_PROFILES) {
    const area = profile.match.workArea.trim() || 'Outros'
    const list = groups.get(area) ?? []
    list.push(profile)
    groups.set(area, list)
  }

  for (const list of groups.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }

  const ordered: Array<{ area: string; profiles: CadastroProfile[] }> = []
  for (const area of preferredOrder) {
    const profiles = groups.get(area)
    if (profiles?.length) ordered.push({ area, profiles })
    groups.delete(area)
  }
  for (const [area, profiles] of groups) {
    ordered.push({ area, profiles })
  }
  return ordered
}

export function userMatchesCadastroProfile(
  user: {
    approvalStatus?: string
    role?: string
    workArea?: string | null
    jobTitle?: string | null
    workSubtype?: string | null
    accessAreas?: string[] | null
  },
  profile: CadastroProfile,
): boolean {
  if (user.role === 'admin') return false
  if (user.approvalStatus && user.approvalStatus !== 'approved') return false

  const workArea = user.workArea?.trim() ?? ''
  const jobTitle = user.jobTitle?.trim() ?? ''
  const workSubtype = user.workSubtype?.trim() ?? ''
  const accessAreas = user.accessAreas ?? []

  if (workArea !== profile.match.workArea) return false
  if (jobTitle !== profile.match.jobTitle) return false

  if (profile.match.workSubtype) {
    const expected = profile.match.workSubtype
    if (isEngineerAreaSubtype(expected)) {
      if (!isEngineerAreaSubtype(workSubtype)) return false
    } else if (isEngineerSubcellSubtype(expected)) {
      if (!isEngineerSubcellSubtype(workSubtype)) return false
    } else if (workSubtype !== expected) {
      return false
    }
  } else if (isFieldTeamCsdScope(workSubtype)) {
    // BackOffice genérico não inclui quem já tem escopo Lavratura / Ponto Focal.
    return false
  }

  if (profile.match.accessArea) {
    if (!accessAreas.includes(profile.match.accessArea)) return false
  }

  return true
}

export function listUsersForCadastroProfile<T extends {
  approvalStatus?: string
  role?: string
  workArea?: string | null
  jobTitle?: string | null
  workSubtype?: string | null
  accessAreas?: string[] | null
  name: string
}>(users: T[], profileId: string): T[] {
  const profile = getCadastroProfile(profileId)
  if (!profile) return []
  return users
    .filter((user) => userMatchesCadastroProfile(user, profile))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/** Áreas da home na pré-visualização de um perfil de negócio (admin). */
export function getHomeAreasForProfilePreview(profileId: string): readonly PortalArea[] {
  // Visão completa do administrador: todos os cards, sem colapsar em Gestão Operacional.
  if (!profileId || profileId === ADMIN_PREVIEW_PROFILE_ID) {
    return [...PORTAL_AREAS]
  }

  const profile = getCadastroProfile(profileId)
  if (!profile) return [...PORTAL_AREAS]

  const areas = PORTAL_AREAS.filter(
    (area) =>
      profile.areas.includes(area) ||
      (area === 'Agenda' && !skipsVacationAgenda(profile.match.workSubtype)),
  )

  // Responsável por célula: só o conteúdo da célula na home (sem Gestão Operacional).
  if (
    profile.match.jobTitle === 'Engenheiro' &&
    isEngineerAreaSubtype(profile.match.workSubtype)
  ) {
    const workArea = profile.match.workArea.trim()
    const cellPortals = BUSINESS_AREA_TO_HOME_PORTALS[workArea] ?? []
    const expanded = PORTAL_AREAS.filter(
      (area) =>
        area !== 'Gestão Operacional' &&
        (areas.includes(area) ||
          (cellPortals as readonly string[]).includes(area) ||
          (area === 'Agenda' && !skipsVacationAgenda(profile.match.workSubtype))),
    )
    return portalsInCatalogOrder(expanded)
  }

  // Pré-visualização de perfil segue o mesmo agrupamento da home do usuário.
  return portalsToHomeCards(areas)
}
