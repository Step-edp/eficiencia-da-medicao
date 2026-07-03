import type { ReactNode } from 'react'
import { LAB_TRAIL_STEPS } from './labTrailSteps'

type LabMeasurementTrailProps = {
  activeStep: string | null
  onSelect: (section: string) => void
  renderIcon: (title: string) => ReactNode
  stepCounts?: Record<string, number>
}

export function LabMeasurementTrail({
  activeStep,
  onSelect,
  renderIcon,
  stepCounts,
}: LabMeasurementTrailProps) {
  const activeIndex = activeStep
    ? LAB_TRAIL_STEPS.findIndex((step) => step.key === activeStep)
    : -1

  return (
    <nav className="lab-trail" aria-label="Trilha operacional do laboratório">
      <ul className="lab-trail-steps">
        {LAB_TRAIL_STEPS.map((step, index) => {
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
              {index < LAB_TRAIL_STEPS.length - 1 ? (
                <span className="lab-trail-connector" aria-hidden="true" />
              ) : null}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
