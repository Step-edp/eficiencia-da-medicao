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

export type ProfileDefinition = {
  role: UserRole
  label: string
  description: string
  areas: ProfileAccessArea[]
}

/** Fonte única: perfis do portal e áreas com acesso. */
export const PROFILE_DEFINITIONS: ProfileDefinition[] = [
  {
    role: 'admin',
    label: 'Administrador',
    description: 'Acesso completo ao portal, aprovações e cadastros.',
    areas: [...PORTAL_AREAS],
  },
  {
    role: 'compras',
    label: 'Compras',
    description: 'Acesso exclusivo ao formulário de Pedidos de Homologação.',
    areas: [COMPRAS_DEDICATED_ACCESS],
  },
  {
    role: 'field',
    label: 'Equipe de campo',
    description: 'Acesso ao agendamento e consulta de medidores em campo.',
    areas: ['Equipe de campo'],
  },
]

export function roleLabel(role: UserRole): string {
  return PROFILE_DEFINITIONS.find((profile) => profile.role === role)?.label ?? role
}

export function getProfileDefinition(role: UserRole): ProfileDefinition {
  return (
    PROFILE_DEFINITIONS.find((profile) => profile.role === role) ??
    PROFILE_DEFINITIONS[0]
  )
}

export function getHomeAreasForRole(role: UserRole): readonly PortalArea[] {
  const profile = getProfileDefinition(role)
  return PORTAL_AREAS.filter((area) => profile.areas.includes(area))
}
