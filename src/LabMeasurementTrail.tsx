import type { ReactNode } from 'react'
import { LAB_TRAIL_STEPS, type LabTrailStep } from './labTrailSteps'

type LabMeasurementTrailProps = {
  activeStep: string | null
  onSelect: (section: string) => void
  renderIcon: (title: string) => ReactNode
  stepCounts?: Record<string, number>
  steps?: LabTrailStep[]
  ariaLabel?: string
}

export function LabMeasurementTrail({
  activeStep,
  onSelect,
  renderIcon,
  stepCounts,
  steps = LAB_TRAIL_STEPS,
  ariaLabel = 'Trilha operacional do laboratório',
}: LabMeasurementTrailProps) {
  const activeIndex = activeStep
    ? steps.findIndex((step) => step.key === activeStep)
    : -1

  return (
    <nav className="lab-trail" aria-label={ariaLabel}>
      <ul className="lab-trail-steps">
        {steps.map((step, index) => {
          const isActive = step.key === activeStep
          const isCompleted = activeIndex >= 0 && index < activeIndex
          const count = stepCounts?.[step.key] ?? 0

          return (
            <li key={step.key} className="lab-trail-step-item">
              <button
                className={`lab-trail-step ${isActive ? 'is-active' : ''} ${isCompleted ? 'is-completed' : ''}`}
                type="button"
                aria-current={isActive ? 'step' : undefined}
                onClick={() => onSelect(step.key)}
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
