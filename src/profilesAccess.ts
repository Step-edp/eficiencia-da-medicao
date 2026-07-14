import type { UserRole } from './api'

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

/** Home do usuário: Gestão Operacional é a área primária quando há acesso a qualquer subcélula. */
const GESTAO_NESTED_PORTALS: PortalArea[] = [
  'Medição',
  'Laboratório de Medição',
  'Laboratório de Homologação',
  'Telemedição',
  'Equipe de campo',
  'Usuários',
  'Cadastros',
]

export function portalsToHomeCards(portals: readonly PortalArea[]): readonly PortalArea[] {
  const hasAgenda = portals.includes('Agenda')
  const withoutAgenda = portals.filter((portal) => portal !== 'Agenda')
  const hasGestaoAccess =
    withoutAgenda.includes('Gestão Operacional') ||
    withoutAgenda.some((portal) => GESTAO_NESTED_PORTALS.includes(portal))

  const cards: PortalArea[] = hasGestaoAccess
    ? ['Gestão Operacional']
    : [...withoutAgenda]

  if (hasAgenda && !cards.includes('Agenda')) {
    cards.push('Agenda')
  }

  return cards
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
    /** Engenheiro Sub-área: exige esta área na home. */
    accessArea?: PortalArea
  }
}

export const CADASTRO_PROFILES: CadastroProfile[] = [
  {
    id: 'backoffice-inspecao',
    name: 'CSD – BackOffice – Inspeção',
    description:
      'Permite realizar o agendamento de medidores em nome das equipes de campo para equipamentos provenientes de lavratura de TOI, com suspeita de fraude ou defeito, que necessitem de ensaio no Laboratório de Medição da EDP SP.',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Analista',
    },
  },
  {
    id: 'tecnico-inspecao',
    name: 'CSD – Técnico – Inspeção',
    description:
      'Permite realizar o agendamento de medidores provenientes de lavratura de TOI, com suspeita de fraude ou defeito, destinados à realização de ensaios no Laboratório de Medição da EDP SP.',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Técnico',
      workSubtype: 'Lavratura de TOI',
    },
  },
  {
    id: 'ponto-focal-inspecao',
    name: 'CSD – Ponto Focal – Inspeção',
    description:
      'Permite realizar o agendamento de medidores em nome das equipes de campo para equipamentos provenientes de lavratura de TOI, com suspeita de fraude ou defeito, destinados ao Laboratório de Medição da EDP SP. Além disso, é responsável pelo controle, acompanhamento e entrega desses medidores ao laboratório.',
    areas: ['Equipe de campo', 'Laboratório de Medição'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Técnico',
      workSubtype: 'Lavratura de TOI - Ponto Focal',
    },
  },
  {
    id: 'tecnico-laboratorio-medicao',
    name: 'Medição – Técnico – Laboratório de Medição',
    description:
      'Permite executar todas as atividades operacionais relacionadas ao Laboratório de Medição, incluindo o processamento, análise e registro dos ensaios realizados.',
    areas: ['Laboratório de Medição'],
    match: {
      workArea: 'Medição',
      jobTitle: 'Técnico',
      workSubtype: 'Laboratório de Medição',
    },
  },
  {
    id: 'engenheiro-responsavel-laboratorio-medicao',
    name: 'Medição – Engenheiro Responsável – Laboratório de Medição',
    description:
      'Permite gerenciar e controlar as atividades do Laboratório de Medição, acompanhando sua execução, sem realizar diretamente as atividades operacionais.',
    areas: ['Laboratório de Medição'],
    match: {
      workArea: 'Medição',
      jobTitle: 'Engenheiro',
      workSubtype: 'Sub-área',
      accessArea: 'Laboratório de Medição',
    },
  },
  {
    id: 'engenheiro-responsavel-medicao',
    name: 'Medição – Engenheiro Responsável',
    description:
      'Possui acesso à visualização e acompanhamento de todas as atividades relacionadas à subárea de Medição.',
    areas: ['Medição'],
    match: {
      workArea: 'Medição',
      jobTitle: 'Engenheiro',
      workSubtype: 'Sub-área',
      accessArea: 'Medição',
    },
  },
  {
    id: 'engenheiro-responsavel-telemedicao',
    name: 'Telemedição – Engenheiro Responsável',
    description:
      'Possui acesso à visualização e acompanhamento de todas as atividades relacionadas à subárea de Telemedição.',
    areas: ['Telemedição'],
    match: {
      workArea: 'Telemedição',
      jobTitle: 'Engenheiro',
      workSubtype: 'Sub-área',
      accessArea: 'Telemedição',
    },
  },
  {
    id: 'engenheiro-dono-area-medicao',
    name: 'Medição – Engenheiro Dono da Área',
    description:
      'Possui controle sobre todas as atividades da área de Medição, incluindo gestão, acompanhamento e tomada de decisão.',
    areas: ['Gestão Operacional', 'Medição', 'Laboratório de Medição', 'Equipe de campo'],
    match: {
      workArea: 'Medição',
      jobTitle: 'Engenheiro',
      workSubtype: 'Área',
    },
  },
  {
    id: 'engenheiro-dono-area-telemedicao',
    name: 'Telemedição – Engenheiro Dono da Área',
    description:
      'Possui controle sobre todas as atividades da área de Telemedição, incluindo gestão, acompanhamento e tomada de decisão.',
    areas: ['Gestão Operacional', 'Telemedição'],
    match: {
      workArea: 'Telemedição',
      jobTitle: 'Engenheiro',
      workSubtype: 'Área',
    },
  },
  {
    id: 'gestor-medicao',
    name: 'Medição – Gestor',
    description:
      'Possui acesso aos indicadores e dashboards consolidados de todas as áreas de Medição sob sua concessão, permitindo o acompanhamento gerencial dos resultados.',
    areas: ['Gestão Operacional', 'Medição'],
    match: {
      workArea: 'Medição',
      jobTitle: 'Gestor',
    },
  },
  {
    id: 'analista-medicao',
    name: 'Medição – Analista',
    description:
      'Possui acesso apenas às atividades atribuídas ao seu usuário, podendo executá-las e acompanhar seu andamento.',
    areas: ['Medição'],
    match: {
      workArea: 'Medição',
      jobTitle: 'Analista',
    },
  },
]

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

/** Portais que o usuário pode abrir (sem colapsar em Gestão Operacional). */
export function getAccessiblePortals(user: {
  role: UserRole
  accessAreas?: string[] | null
}): readonly PortalArea[] {
  const assigned = (user.accessAreas ?? []).filter((area): area is PortalArea =>
    (PORTAL_AREAS as readonly string[]).includes(area),
  )

  let portals: PortalArea[]
  if (assigned.length > 0) {
    portals = PORTAL_AREAS.filter((area) => assigned.includes(area))
  } else {
    const areas = SYSTEM_ROLE_ACCESS[user.role]?.areas ?? []
    portals = PORTAL_AREAS.filter((area) => areas.includes(area))
  }

  if (!portals.includes('Agenda')) {
    portals = [...portals, 'Agenda']
  }
  return portals
}

/** Home do usuário: card primário Gestão Operacional quando há acesso à hierarquia. */
export function getHomeAreasForUser(user: {
  role: UserRole
  accessAreas?: string[] | null
}): readonly PortalArea[] {
  return portalsToHomeCards(getAccessiblePortals(user))
}

export function getCadastroProfile(profileId: string): CadastroProfile | undefined {
  return CADASTRO_PROFILES.find((profile) => profile.id === profileId)
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
    if (workSubtype !== profile.match.workSubtype) return false
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
  if (!profileId || profileId === ADMIN_PREVIEW_PROFILE_ID) {
    return portalsToHomeCards(PORTAL_AREAS)
  }

  const profile = getCadastroProfile(profileId)
  if (!profile) return portalsToHomeCards(PORTAL_AREAS)

  const areas = PORTAL_AREAS.filter(
    (area) => profile.areas.includes(area) || area === 'Agenda',
  )
  return portalsToHomeCards(areas)
}
