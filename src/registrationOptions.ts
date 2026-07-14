/** Abrangência do cadastro (própria ou terceira). */
export const EDP_SCOPE_OPTIONS = ['EDP SP', 'EDP ES', 'Transversal'] as const

export const TECHNICIAN_SUBTYPES = [
  'Medição',
  'Laboratório de Medição',
  'Lavratura de TOI',
  'Leituras de faturamento',
] as const

export const ENGINEER_SUBTYPES = [
  'Dono de área',
  'Ponto focal',
  'Não aplicável',
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

export function subtypesForCargo(jobTitle: string): readonly string[] {
  if (jobTitle === 'Técnico') return TECHNICIAN_SUBTYPES
  if (jobTitle === 'Engenheiro') return ENGINEER_SUBTYPES
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
    if (workSubtype === 'Dono de área' && workArea) {
      return `Engenheiro Dono da Área – ${workArea}`
    }
    if (workSubtype === 'Ponto focal' && workArea) {
      return `Ponto Focal – ${workArea}`
    }
    if (workSubtype === 'Não aplicável' && workArea) {
      return `Engenheiro Responsável – ${workArea}`
    }
    if (workArea) {
      return `Engenheiro – ${workArea}`
    }
  }

  return [jobTitle, workSubtype, workArea].filter(Boolean).join(' – ')
}
