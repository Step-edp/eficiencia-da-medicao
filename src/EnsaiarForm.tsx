import { useState } from 'react'
import { RatmWorkflow } from './ratm/RatmWorkflow'

const maxRatmCount = 10
const ratmOptions = Array.from({ length: maxRatmCount }, (_, index) => index + 1)

export function EnsaiarForm() {
  const [ratmCount, setRatmCount] = useState('')
  const [startedCount, setStartedCount] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const selectedCount = Number(ratmCount)

  const handleStart = () => {
    if (!ratmCount) {
      setFeedback({
        type: 'error',
        message: 'Selecione quantos RATMs deseja realizar de uma vez.',
      })
      return
    }

    setFeedback(null)
    setStartedCount(selectedCount)
  }

  if (startedCount) {
    return (
      <RatmWorkflow
        count={startedCount}
        onBack={() => {
          setStartedCount(null)
          setFeedback(null)
        }}
      />
    )
  }

  return (
    <>
      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      <div className="form-grid ensaiar-form">
        <label className="full-width">
          Quantidade de RATMs
          <select
            value={ratmCount}
            onChange={(event) => {
              setRatmCount(event.target.value)
              setFeedback(null)
            }}
          >
            <option value="">Selecione a quantidade (máximo {maxRatmCount})</option>
            {ratmOptions.map((count) => (
              <option key={count} value={String(count)}>
                {count} {count === 1 ? 'RATM' : 'RATMs'}
              </option>
            ))}
          </select>
        </label>

        <button className="primary-button full-width" type="button" onClick={handleStart}>
          Iniciar formulários
        </button>
      </div>
    </>
  )
}
