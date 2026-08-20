/** Escopos CSD isentos da Agenda de férias obrigatória. */
export function skipsVacationAgenda(workSubtype?: string | null) {
  const normalized = (workSubtype?.trim() ?? '')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-')
  return (
    normalized === 'Lavratura de TOI - Equipe de Campo' ||
    normalized === 'Lavratura de TOI' || // legado
    normalized === 'Lavratura de TOI - Ponto Focal' ||
    normalized === 'Lavratura de TOI - Backoffice'
  )
}
