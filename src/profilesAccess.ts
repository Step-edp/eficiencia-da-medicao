import type { UserRole } from './api'
import {
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

  // Gestão Operacional só como card único quando o perfil tem esse acesso explícito
  // (gestor / responsável pela célula). Responsáveis por subcélula veem as áreas atribuídas.
  const cards: PortalArea[] = withoutAgenda.includes('Gestão Operacional')
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
    /** Engenheiro responsável por sub-célula: exige esta área na home. */
    accessArea?: PortalArea
  }
}

export const CADASTRO_PROFILES: CadastroProfile[] = [
  {
    id: 'tecnico-inspecao',
    name: 'CSD – Técnico – Inspeção',
    description:
      'Permite agendar e consultar medidores na Equipe de campo (Agendar e Consultar), provenientes de lavratura de TOI com suspeita de fraude ou defeito, destinados a ensaios no Laboratório de Medição da EDP SP.',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Técnico',
      workSubtype: 'Lavratura de TOI',
    },
  },
  {
    id: 'analista-lavratura-toi',
    name: 'CSD – Analista – Lavratura de TOI',
    description:
      'Permite agendar e consultar medidores na Equipe de campo (Agendar e Consultar) para equipamentos provenientes de lavratura de TOI.',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Analista',
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
    id: 'backoffice-inspecao',
    name: 'CSD – BackOffice – Lavratura de TOI',
    description:
      'Permite agendar e consultar medidores na Equipe de campo em nome de uma equipe, informando os colaboradores que lavraram o TOI.',
    areas: ['Equipe de campo'],
    match: {
      workArea: 'CSD',
      jobTitle: 'Analista',
      workSubtype: 'Lavratura de TOI - Backoffice',
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
      workSubtype: 'Responsável por sub-célula',
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
      workSubtype: 'Responsável por sub-célula',
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
      workSubtype: 'Responsável por sub-célula',
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
      workSubtype: 'Responsável por célula',
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
      workSubtype: 'Responsável por célula',
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

/** Escopos CSD que liberam Equipe de campo (Agendar / Consultar). */
export function isFieldTeamCsdScope(workSubtype?: string | null) {
  const normalized = workSubtype?.trim() ?? ''
  return (
    normalized === 'Lavratura de TOI' ||
    normalized === 'Lavratura de TOI - Ponto Focal' ||
    normalized === 'Lavratura de TOI - Backoffice'
  )
}

/** Backoffice agenda em nome da equipe e exige colaboradores no formulário. */
export function isLavraturaBackofficeScope(workSubtype?: string | null) {
  return (workSubtype?.trim() ?? '') === 'Lavratura de TOI - Backoffice'
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

  // Lavratura de TOI (e Ponto Focal) sempre acessam Equipe de campo → Agendar/Consultar.
  if (
    user.workArea?.trim() === 'CSD' &&
    isFieldTeamCsdScope(user.workSubtype) &&
    !portals.includes('Equipe de campo')
  ) {
    portals = [...portals, 'Equipe de campo']
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
  workArea?: string | null
  jobTitle?: string | null
  workSubtype?: string | null
  approvalStatus?: string
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
    (area) => profile.areas.includes(area) || area === 'Agenda',
  )
  // Pré-visualização de perfil segue o mesmo agrupamento da home do usuário.
  return portalsToHomeCards(areas)
}
