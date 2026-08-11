import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, type AnalisadorTensaoRecord, type EnsaioMedicaoRecord } from './api'

type AnalisadorLaudoModalProps = {
  analisador: AnalisadorTensaoRecord | null
  onClose: () => void
}

function formatFase(value: string) {
  const number = Number(value)
  if (!Number.isFinite(number)) return value
  return number.toFixed(2).replace('.', ',')
}

export function AnalisadorLaudoModal({ analisador, onClose }: AnalisadorLaudoModalProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [medicoes, setMedicoes] = useState<EnsaioMedicaoRecord[]>([])

  useEffect(() => {
    if (!analisador) return
    setLoading(true)
    setError(null)
    setMedicoes([])

    api
      .getAnalisadorEnsaioMedicoes(analisador.id)
      .then(({ medicoes: rows }) => setMedicoes(rows))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o laudo.')
      })
      .finally(() => setLoading(false))
  }, [analisador])

  useEffect(() => {
    if (!analisador) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [analisador, onClose])

  if (!analisador) return null

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="ensaios-block-modal analisador-laudo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analisador-laudo-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-button schedule-slot-modal-close"
          onClick={onClose}
          aria-label="Fechar"
          title="Fechar"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <h3 id="analisador-laudo-modal-title">
          Laudo · {analisador.numeroSerie} ({analisador.modelo})
        </h3>
        <p className="ensaios-block-modal-date">
          {analisador.identificacaoLaudo || 'Sem identificação de laudo'}
        </p>

        {loading ? (
          <p className="entrada-panel-empty">Carregando medições...</p>
        ) : error ? (
          <div className="login-feedback error" role="alert">
            {error}
          </div>
        ) : medicoes.length ? (
          <div className="entrada-table-wrap">
            <table className="data-table ensaio-medicao-table">
              <thead>
                <tr>
                  <th>Tensão</th>
                  <th>Teste</th>
                  <th>Padrão A</th>
                  <th>Padrão B</th>
                  <th>Padrão C</th>
                  <th>Equip. A</th>
                  <th>Equip. B</th>
                  <th>Equip. C</th>
                </tr>
              </thead>
              <tbody>
                {medicoes.map((row) => (
                  <tr key={`${row.voltage}-${row.testeNumero}`}>
                    <td>{row.voltage}</td>
                    <td>{row.testeNumero}</td>
                    <td>{formatFase(row.padraoFaseA)}</td>
                    <td>{formatFase(row.padraoFaseB)}</td>
                    <td>{formatFase(row.padraoFaseC)}</td>
                    <td>{formatFase(row.equipamentoFaseA)}</td>
                    <td>{formatFase(row.equipamentoFaseB)}</td>
                    <td>{formatFase(row.equipamentoFaseC)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="entrada-panel-empty">Nenhum ensaio registrado para esse analisador ainda.</p>
        )}

        <div className="ensaios-block-modal-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
