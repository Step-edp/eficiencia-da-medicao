export const CSD_CITY_OPTIONS = [
  'Aracaju',
  'Belém',
  'Belo Horizonte',
  'Boa Vista',
  'Brasília',
  'Campo Grande',
  'Cuiabá',
  'Curitiba',
  'Florianópolis',
  'Fortaleza',
  'Goiânia',
  'João Pessoa',
  'Macapá',
  'Maceió',
  'Manaus',
  'Natal',
  'Palmas',
  'Porto Alegre',
  'Porto Velho',
  'Recife',
  'Rio Branco',
  'Rio de Janeiro',
  'Salvador',
  'São Luís',
  'São Paulo',
  'Teresina',
  'Vitória',
] as const

export const CSD_CITY_SET = new Set<string>(CSD_CITY_OPTIONS)

export function normalizeCsdCities(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const cities = [...new Set(value.map(String).map((city) => city.trim()).filter(Boolean))]
  return cities.filter((city) => CSD_CITY_SET.has(city)).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
