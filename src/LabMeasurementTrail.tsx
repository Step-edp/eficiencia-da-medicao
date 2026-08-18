import type { ReactNode } from 'react'
import { LAB_TRAIL_STEPS, type LabTrailStep } from './labTrailSteps'

type LabMeasurementTrailProps = {
  activeStep: string | null
  onSelect: (section: string) => void
  renderIcon: (title: string) => ReactNode
  stepCounts?: Record<string, number>
  steps?: LabTrailStep[]
  ariaLabel?: string
  /** Se informado, controla quais etapas já foram concluídas. */
  completedStepKeys?: string[]
  /** Se informado, bloqueia clique em etapas ainda não liberadas. */
  isStepEnabled?: (stepKey: string, index: number) => boolean
}

type LabTrailNavProps = LabMeasurementTrailProps & {
  onOpenCalendar?: () => void
  calendarActive?: boolean
  renderCalendarIcon?: () => ReactNode
}

export function LabTrailNav({
  onOpenCalendar,
  calendarActive = false,
  renderCalendarIcon,
  ...trailProps
}: LabTrailNavProps) {
  return (
    <div className={`lab-trail-nav${calendarActive ? ' is-calendar-only' : ''}`}>
      {onOpenCalendar ? (
        <div className="lab-trail-calendar-slot">
          <button
            type="button"
            className={`lab-trail-calendar-icon${calendarActive ? ' is-active' : ''}`}
            onClick={onOpenCalendar}
            aria-label="Calendário de ensaios"
            title="Calendário de ensaios"
          >
            {renderCalendarIcon?.()}
          </button>
        </div>
      ) : null}
      {!calendarActive ? <LabMeasurementTrail {...trailProps} /> : null}
    </div>
  )
}

export function LabMeasurementTrail({
  activeStep,
  onSelect,
  renderIcon,
  stepCounts,
  steps = LAB_TRAIL_STEPS,
  ariaLabel = 'Trilha operacional do laboratório',
  completedStepKeys,
  isStepEnabled,
}: LabMeasurementTrailProps) {
  const activeIndex = activeStep
    ? steps.findIndex((step) => step.key === activeStep)
    : -1
  const completedSet = completedStepKeys ? new Set(completedStepKeys) : null

  return (
    <nav className="lab-trail" aria-label={ariaLabel}>
      <ul className="lab-trail-steps">
        {steps.map((step, index) => {
          const isActive = step.key === activeStep
          const isCompleted = completedSet
            ? completedSet.has(step.key) && !isActive
            : activeIndex >= 0 && index < activeIndex
          const enabled = isStepEnabled ? isStepEnabled(step.key, index) : true
          const count = stepCounts?.[step.key] ?? 0

          return (
            <li key={step.key} className="lab-trail-step-item">
              <button
                className={`lab-trail-step ${isActive ? 'is-active' : ''} ${isCompleted ? 'is-completed' : ''} ${enabled ? '' : 'is-locked'}`}
                type="button"
                aria-current={isActive ? 'step' : undefined}
                aria-disabled={!enabled}
                disabled={!enabled}
                title={
                  enabled
                    ? undefined
                    : 'Conclua a etapa anterior para liberar esta.'
                }
                onClick={() => {
                  if (!enabled) return
                  onSelect(step.key)
                }}
              >
                <span className="lab-trail-step-content">
                  {renderIcon(step.key)}
                  <span className="lab-trail-step-label">{step.label}</span>
                  {count > 0 ? (
                    <span className="lab-trail-step-badge" aria-label={`${count} pendente(s)`}>
                      {count}
                    </span>
                  ) : null}
                </span>
              </button>
              {index < steps.length - 1 ? (
                <span className="lab-trail-connector" aria-hidden="true" />
              ) : null}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
