export const CSD_CITY_OPTIONS = [
  'Aparecida',
  'Biritiba Mirim',
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

export const CSD_CITY_SET = new Set<string>(CSD_CITY_OPTIONS)

export function normalizeCsdCities(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const cities = [...new Set(value.map(String).map((city) => city.trim()).filter(Boolean))]
  return cities.filter((city) => CSD_CITY_SET.has(city)).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
