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

/** Monta o rótulo do perfil a partir das escolhas do cadastro. */
export function buildRequestedProfile(
  jobTitle: string,
  workSubtype: string,
  workArea: string,
): string {
  if (!jobTitle) return ''

  if (jobTitle === 'Técnico' && workSubtype) {
    return `Técnico – ${workSubtype}`
  }

  if (jobTitle === 'Analista' && workArea) {
    return `Analista – ${workArea}`
  }

  if (jobTitle === 'Engenheiro') {
    if (workSubtype && workArea) {
      return `Engenheiro – ${workSubtype} – ${workArea}`
    }
    if (workSubtype) {
      return `Engenheiro – ${workSubtype}`
    }
    if (workArea) {
      return `Engenheiro – ${workArea}`
    }
  }

  return [jobTitle, workSubtype, workArea].filter(Boolean).join(' – ')
}
