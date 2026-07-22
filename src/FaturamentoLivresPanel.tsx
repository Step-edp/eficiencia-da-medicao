import { FormEvent, useState } from 'react'
import { LoginFeedback } from './LoginFeedback'

type FaturamentoLivresPanelProps = {
  readOnly?: boolean
}

export function FaturamentoLivresPanel({ readOnly = false }: FaturamentoLivresPanelProps) {
  const [consolidacaoCarga, setConsolidacaoCarga] = useState('')
  const [registeredValue, setRegisteredValue] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (readOnly) return

    const value = consolidacaoCarga.trim()
    if (!value) {
      setFeedback({
        type: 'error',
        message: 'Informe a consolidação da carga.',
      })
      return
    }

    setRegisteredValue(value)
    setFeedback({
      type: 'success',
      message: `Consolidação da carga registrada: ${value}.`,
    })
  }

  return (
    <div className="faturamento-livres-panel">
      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      <form className="faturamento-consolidacao-form" onSubmit={handleSubmit}>
        <label htmlFor="consolidacao-carga">Consolidação da Carga</label>
        <div className="faturamento-consolidacao-row">
          <input
            id="consolidacao-carga"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="Informe a consolidação da carga"
            value={consolidacaoCarga}
            disabled={readOnly}
            onChange={(event) => setConsolidacaoCarga(event.target.value)}
          />
          <button
            type="submit"
            className="primary-button faturamento-consolidacao-submit"
            disabled={readOnly || !consolidacaoCarga.trim()}
          >
            Registrar
          </button>
        </div>
      </form>

      {registeredValue ? (
        <div className="faturamento-consolidacao-result" aria-live="polite">
          <span>Consolidação registrada</span>
          <strong>{registeredValue}</strong>
        </div>
      ) : null}
    </div>
  )
}
