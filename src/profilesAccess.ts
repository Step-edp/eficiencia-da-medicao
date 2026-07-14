import type { UserRole } from './api'

/** Áreas do portal exibidas na home (exceto o fluxo dedicado de Compras). */
export const PORTAL_AREAS = [
  'Gestão',
  'Medição',
  'Laboratório de Medição',
  'Laboratório de Homologação',
  'Telemedição',
  'Equipe de campo',
  'Usuários',
  'Cadastros',
] as const

export type PortalArea = (typeof PORTAL_AREAS)[number]

/** Acesso especial fora dos cards da home. */
export const COMPRAS_DEDICATED_ACCESS = 'Pedidos de Homologação' as const

export type ProfileAccessArea = PortalArea | typeof COMPRAS_DEDICATED_ACCESS

/** Perfis de negócio e áreas que cada um visualiza no portal. */
export type CadastroProfile = {
  id: string
  name: string
  description: string
  areas: PortalArea[]
}

export const CADASTRO_PROFILES: CadastroProfile[] = [
  {
    id: 'backoffice-inspecao',
    name: 'BackOffice – Inspeção',
    description:
      'Permite realizar o agendamento de medidores em nome das equipes de campo para equipamentos provenientes de lavratura de TOI, com suspeita de fraude ou defeito, que necessitem de ensaio no Laboratório de Medição da EDP SP.',
    areas: ['Equipe de campo'],
  },
  {
    id: 'tecnico-inspecao',
    name: 'Técnico – Inspeção',
    description:
      'Permite realizar o agendamento de medidores provenientes de lavratura de TOI, com suspeita de fraude ou defeito, destinados à realização de ensaios no Laboratório de Medição da EDP SP.',
    areas: ['Equipe de campo'],
  },
  {
    id: 'ponto-focal-inspecao',
    name: 'Ponto Focal – Inspeção',
    description:
      'Permite realizar o agendamento de medidores em nome das equipes de campo para equipamentos provenientes de lavratura de TOI, com suspeita de fraude ou defeito, destinados ao Laboratório de Medição da EDP SP. Além disso, é responsável pelo controle, acompanhamento e entrega desses medidores ao laboratório.',
    areas: ['Equipe de campo', 'Laboratório de Medição'],
  },
  {
    id: 'tecnico-laboratorio-medicao',
    name: 'Técnico – Laboratório de Medição',
    description:
      'Permite executar todas as atividades operacionais relacionadas ao Laboratório de Medição, incluindo o processamento, análise e registro dos ensaios realizados.',
    areas: ['Laboratório de Medição'],
  },
  {
    id: 'engenheiro-responsavel-laboratorio-medicao',
    name: 'Engenheiro Responsável – Laboratório de Medição',
    description:
      'Permite gerenciar e controlar as atividades do Laboratório de Medição, acompanhando sua execução, sem realizar diretamente as atividades operacionais.',
    areas: ['Laboratório de Medição'],
  },
  {
    id: 'engenheiro-responsavel-medicao',
    name: 'Engenheiro Responsável – Medição',
    description:
      'Possui acesso à visualização e acompanhamento de todas as atividades relacionadas à subárea de Medição.',
    areas: ['Medição'],
  },
  {
    id: 'engenheiro-responsavel-telemedicao',
    name: 'Engenheiro Responsável – Telemedição',
    description:
      'Possui acesso à visualização e acompanhamento de todas as atividades relacionadas à subárea de Telemedição.',
    areas: ['Telemedição'],
  },
  {
    id: 'engenheiro-dono-area-medicao',
    name: 'Engenheiro Dono da Área – Medição',
    description:
      'Possui controle sobre todas as atividades da área de Medição, incluindo gestão, acompanhamento e tomada de decisão.',
    areas: ['Gestão', 'Medição', 'Laboratório de Medição', 'Equipe de campo'],
  },
  {
    id: 'engenheiro-dono-area-telemedicao',
    name: 'Engenheiro Dono da Área – Telemedição',
    description:
      'Possui controle sobre todas as atividades da área de Telemedição, incluindo gestão, acompanhamento e tomada de decisão.',
    areas: ['Gestão', 'Telemedição'],
  },
  {
    id: 'engenheiro-gestor-medicao',
    name: 'Engenheiro Gestor – Medição',
    description:
      'Possui acesso aos indicadores e dashboards consolidados de todas as áreas de Medição sob sua concessão, permitindo o acompanhamento gerencial dos resultados.',
    areas: ['Gestão', 'Medição'],
  },
  {
    id: 'analista-medicao',
    name: 'Analista – Medição',
    description:
      'Possui acesso apenas às atividades atribuídas ao seu usuário, podendo executá-las e acompanhar seu andamento.',
    areas: ['Medição'],
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
  return PORTAL_AREAS.filter((area) => areas.includes(area))
}

export function getCadastroProfile(profileId: string): CadastroProfile | undefined {
  return CADASTRO_PROFILES.find((profile) => profile.id === profileId)
}

/** Áreas da home na pré-visualização de um perfil de negócio (admin). */
export function getHomeAreasForProfilePreview(profileId: string): readonly PortalArea[] {
  if (!profileId || profileId === ADMIN_PREVIEW_PROFILE_ID) {
    return PORTAL_AREAS
  }

  const profile = getCadastroProfile(profileId)
  if (!profile) return PORTAL_AREAS

  return PORTAL_AREAS.filter((area) => profile.areas.includes(area))
}
