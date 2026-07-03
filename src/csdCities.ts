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

export type CsdCity = (typeof CSD_CITY_OPTIONS)[number]

export const CSD_CITY_SET = new Set<string>(CSD_CITY_OPTIONS)
