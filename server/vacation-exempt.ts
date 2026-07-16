/** Escopos CSD isentos da Agenda de férias obrigatória. */
export function skipsVacationAgenda(workSubtype?: string | null) {
  const normalized = workSubtype?.trim() ?? ''
  return (
    normalized === 'Lavratura de TOI - Equipe de Campo' ||
    normalized === 'Lavratura de TOI' || // legado
    normalized === 'Lavratura de TOI - Backoffice'
  )
}
