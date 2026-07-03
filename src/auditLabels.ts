export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'Cadastro',
  update: 'Edição',
  delete: 'Exclusão',
  approve: 'Aprovação',
  register: 'Solicitação de cadastro',
  block: 'Bloqueio',
  unblock: 'Desbloqueio',
}

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  user: 'Usuário',
  homologation_request: 'Pedido de homologação',
  material: 'Material',
  manufacturer: 'Fabricante',
  password_record: 'Senha de medidor',
  ratm_laudo: 'Laudo RATM',
  ensaios_manual_block: 'Calendário de ensaios',
  csd: 'CSD',
  satisfaction_survey: 'Pesquisa de satisfação',
  meter_schedule: 'Agendamento de medidor',
}

export function formatAuditAction(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? action
}

export function formatAuditEntity(entityType: string) {
  return AUDIT_ENTITY_LABELS[entityType] ?? entityType
}

export function formatAuditDate(isoDate: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(isoDate))
}
