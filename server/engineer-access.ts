/** Catálogo compartilhado de processos do engenheiro (validação API). */

export const PROCESSES_BY_AREA: Record<string, readonly string[]> = {
  Medição: [
    'Faturamento de clientes livres',
    'Faturamento de clientes cativos',
    'Faturamento de consumo próprio',
    'Memória de massa',
    'Medidas inconsistentes',
    'Migração',
    'Arcesp',
    'Pirâmide',
    'Capex',
    'Geração de senha',
    'Geração de número de série',
    'Sap Hana',
  ],
  Telemedição: [
    'Monitoramento remoto',
    'Coleta de dados em tempo real',
    'Gestão de alertas',
  ],
  CSD: [
    'Lavratura de TOI',
    'Lavratura de TOI - Ponto Focal',
    'Leituras de faturamento',
  ],
  'Consumo Irregular': [
    'Inspeção de irregularidade',
    'Análise de perda',
    'Acompanhamento de TOI',
  ],
  'Grandes Clientes': [
    'Medição especial',
    'Acompanhamento de grandes clientes',
    'Atendimento técnico',
  ],
  Qualidade: [
    'Ensaios de qualidade',
    'Auditoria de qualidade',
    'Acompanhamento de não conformidades',
  ],
  'Laboratório de Medição': [
    'Entrada de medidores',
    'Ensaiar',
    'Aprovação de RATM',
    'Calendário de ensaios',
    'Auditoria',
    'Inventário',
  ],
  'Laboratório de Homologação': [
    'Ensaio',
    'Pedidos de Homologação',
    'Código de materiais',
  ],
  'Equipe de campo': ['Agendar', 'Consultar'],
  Gestão: ['Indicadores', 'Dashboards', 'Metas operacionais'],
}

export const AREA_TO_HOME_PORTALS: Record<string, readonly string[]> = {
  Medição: ['Medição'],
  Telemedição: ['Telemedição'],
  CSD: ['Equipe de campo'],
  'Consumo Irregular': ['Equipe de campo'],
  'Grandes Clientes': ['Medição'],
  Qualidade: ['Laboratório de Medição'],
  'Laboratório de Medição': ['Laboratório de Medição'],
  'Laboratório de Homologação': ['Laboratório de Homologação'],
  'Equipe de campo': ['Equipe de campo'],
  Gestão: ['Gestão'],
}

export function parseAccessProcess(value: string): { area: string; process: string } | null {
  const separator = value.indexOf('::')
  if (separator <= 0) return null
  const area = value.slice(0, separator).trim()
  const process = value.slice(separator + 2).trim()
  if (!area || !process) return null
  return { area, process }
}

export function encodeAccessProcess(area: string, process: string): string {
  return `${area}::${process}`
}

export function isValidCrossAreaProcess(ownWorkArea: string, encoded: string): boolean {
  const parsed = parseAccessProcess(encoded)
  if (!parsed || parsed.area === ownWorkArea) return false
  return (PROCESSES_BY_AREA[parsed.area] ?? []).includes(parsed.process)
}

export function portalAreasFromProcesses(
  ownWorkArea: string,
  accessProcesses: string[],
): string[] {
  const portals = new Set<string>(AREA_TO_HOME_PORTALS[ownWorkArea] ?? [])

  for (const encoded of accessProcesses) {
    const parsed = parseAccessProcess(encoded)
    if (!parsed) continue
    for (const portal of AREA_TO_HOME_PORTALS[parsed.area] ?? []) {
      portals.add(portal)
    }
  }

  return [...portals]
}
