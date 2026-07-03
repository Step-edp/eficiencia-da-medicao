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

export type CsdCity = (typeof CSD_CITY_OPTIONS)[number]

export const CSD_CITY_SET = new Set<string>(CSD_CITY_OPTIONS)
