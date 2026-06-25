import type { ReactNode } from 'react'
import { LAB_TRAIL_STEPS } from './labTrailSteps'

type LabMeasurementTrailProps = {
  activeStep: string | null
  onSelect: (section: string) => void
  renderIcon: (title: string) => ReactNode
}

export function LabMeasurementTrail({
  activeStep,
  onSelect,
  renderIcon,
}: LabMeasurementTrailProps) {
  const activeIndex = activeStep
    ? LAB_TRAIL_STEPS.findIndex((step) => step.key === activeStep)
    : -1

  return (
    <nav className="lab-trail" aria-label="Trilha operacional do laboratório">
      <p className="lab-trail-heading">Trilha</p>
      <ol className="lab-trail-steps">
        {LAB_TRAIL_STEPS.map((step, index) => {
          const isActive = step.key === activeStep
          const isCompleted = activeIndex >= 0 && index < activeIndex

          return (
            <li key={step.key} className="lab-trail-step-item">
              <button
                className={`lab-trail-step ${isActive ? 'is-active' : ''} ${isCompleted ? 'is-completed' : ''}`}
                type="button"
                aria-current={isActive ? 'step' : undefined}
                onClick={() => onSelect(step.key)}
              >
                <span className="lab-trail-step-index">{index + 1}</span>
                <span className="lab-trail-step-content">
                  {renderIcon(step.key)}
                  <span>{step.label}</span>
                </span>
              </button>
              {index < LAB_TRAIL_STEPS.length - 1 ? (
                <span className="lab-trail-connector" aria-hidden="true" />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
