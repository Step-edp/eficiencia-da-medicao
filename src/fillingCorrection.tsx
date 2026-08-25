export type FillingCorrectionField = 'installation' | 'toi' | 'note' | 'csd'
export type FillingCorrectionMark = 'wrong' | 'adjusted'

export const FILLING_CORRECTION_LABELS: Record<
  FillingCorrectionField,
  Record<FillingCorrectionMark, string>
> = {
  installation: {
    wrong: 'Instalação digitada errada',
    adjusted: 'Instalação ajustada',
  },
  toi: {
    wrong: 'TOI digitado errado',
    adjusted: 'TOI ajustado',
  },
  note: {
    wrong: 'Nota digitada errada',
    adjusted: 'Nota ajustada',
  },
  csd: {
    wrong: 'CSD digitado errado',
    adjusted: 'CSD ajustado',
  },
}

export function FillingCorrectionBadge({
  field,
  mark,
}: {
  field: FillingCorrectionField
  mark?: FillingCorrectionMark | null
}) {
  if (!mark) return null
  return (
    <span
      className={
        mark === 'adjusted' ? 'schedule-adjusted-badge' : 'schedule-wrong-install-badge'
      }
    >
      {FILLING_CORRECTION_LABELS[field][mark]}
    </span>
  )
}

export function FillingCorrectionNote({
  field,
  mark,
  previous,
}: {
  field: FillingCorrectionField
  mark?: FillingCorrectionMark | null
  previous?: string
}) {
  if (!mark) return null
  return (
    <p className="schedule-wrong-install-note">
      <FillingCorrectionBadge field={field} mark={mark} />
      {previous ? ` Anterior: ${previous}` : null}
    </p>
  )
}
