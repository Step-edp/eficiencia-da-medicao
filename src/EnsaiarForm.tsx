import { useMemo, useState } from 'react'

const maxRatmCount = 10
const ratmOptions = Array.from({ length: maxRatmCount }, (_, index) => index + 1)

export function EnsaiarForm() {
  const [ratmCount, setRatmCount] = useState('')
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const selectedCount = Number(ratmCount)
  const ratmSlots = useMemo(() => {
    if (!Number.isInteger(selectedCount) || selectedCount < 1 || selectedCount > maxRatmCount) {
      return []
    }

    return Array.from({ length: selectedCount }, (_, index) => index + 1)
  }, [selectedCount])

  const handleConfirm = () => {
    if (!ratmCount) {
      setFeedback({
        type: 'error',
        message: 'Selecione quantos RATMs deseja realizar de uma vez.',
      })
      return
    }

    setFeedback({
      type: 'success',
      message: `${selectedCount} RATM(s) selecionado(s) para ensaio simultâneo.`,
    })
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

        {ratmSlots.length ? (
          <div className="ratm-slots full-width" aria-label="RATMs selecionados">
            {ratmSlots.map((slot) => (
              <article key={slot} className="ratm-slot-card">
                <strong>RATM {slot}</strong>
                <span>Pronto para iniciar o ensaio {slot} de {ratmSlots.length}.</span>
              </article>
            ))}
          </div>
        ) : null}

        <button className="primary-button full-width" type="button" onClick={handleConfirm}>
          Confirmar quantidade
        </button>
      </div>
    </>
  )
}
