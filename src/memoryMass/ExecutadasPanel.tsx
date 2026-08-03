import { useMemo, useState } from 'react'
import { LoginFeedback } from '../LoginFeedback'
import {
  blockPeriodLabel,
  ordenarDadosHemera,
  planilhaToTsv,
  type OrdenarHemeraResult,
} from './ordenarHemera'

const PREVIEW_ROWS = 40

export function ExecutadasPanel() {
  const [consumoPaste, setConsumoPaste] = useState('')
  const [demandaPaste, setDemandaPaste] = useState('')
  const [fpPaste, setFpPaste] = useState('')
  const [result, setResult] = useState<OrdenarHemeraResult | null>(null)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const hasAnyPaste = Boolean(
    consumoPaste.trim() || demandaPaste.trim() || fpPaste.trim(),
  )

  const previewRows = useMemo(
    () => result?.planilha.slice(0, PREVIEW_ROWS) ?? [],
    [result],
  )

  const handleOrdenar = () => {
    const next = ordenarDadosHemera({
      consumo: consumoPaste,
      demanda: demandaPaste,
      fp: fpPaste,
    })
    setResult(next)

    if (!next.planilha.length) {
      setFeedback({
        type: 'error',
        message:
          next.errors[0] ??
          'Não foi possível montar a planilha. Verifique o conteúdo colado (como na macro do Hemera).',
      })
      return
    }

    setFeedback({
      type: 'success',
      message:
        next.errors.length > 0
          ? `Planilha montada com ${next.planilha.length} linha(s), com avisos: ${next.errors.join(' ')}`
          : `Planilha montada com ${next.planilha.length} linha(s) (Consumo + Demanda + FP).`,
    })
  }

  const handleCopiarPlanilha = async () => {
    if (!result?.planilha.length) return
    try {
      await navigator.clipboard.writeText(planilhaToTsv(result.planilha))
      setFeedback({
        type: 'success',
        message: 'Planilha copiada. Cole na aba MÊS_ANO do Excel (a partir de Data).',
      })
    } catch {
      setFeedback({
        type: 'error',
        message: 'Não foi possível copiar automaticamente. Tente novamente.',
      })
    }
  }

  const handleLimpar = () => {
    setConsumoPaste('')
    setDemandaPaste('')
    setFpPaste('')
    setResult(null)
    setFeedback(null)
  }

  return (
    <div className="executadas-panel">
      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      <p className="executadas-hint">
        Cole a partir das colunas A (Consumo), I (Demanda) e R (Fator de Potência) do
        BD_HEMERA, incluindo a linha do título (<strong>Consumo - </strong>,{' '}
        <strong>Demanda - </strong>, <strong>Fator de Potência - </strong>), como na
        macro Ordena Dados.
      </p>

      <div className="executadas-paste-grid" aria-label="Campos para colar dados">
        <label className={`executadas-paste-label executadas-paste-consumo`}>
          Consumo
          <textarea
            className="executadas-paste"
            value={consumoPaste}
            onChange={(event) => setConsumoPaste(event.target.value)}
            onPaste={() => {
              setResult(null)
              setFeedback(null)
            }}
            rows={8}
            placeholder="Cole aqui os dados de Consumo"
            spellCheck={false}
          />
        </label>

        <label className={`executadas-paste-label executadas-paste-demanda`}>
          Demanda
          <textarea
            className="executadas-paste"
            value={demandaPaste}
            onChange={(event) => setDemandaPaste(event.target.value)}
            onPaste={() => {
              setResult(null)
              setFeedback(null)
            }}
            rows={8}
            placeholder="Cole aqui os dados de Demanda"
            spellCheck={false}
          />
        </label>

        <label className={`executadas-paste-label executadas-paste-fp`}>
          Fator de Potência
          <textarea
            className="executadas-paste"
            value={fpPaste}
            onChange={(event) => setFpPaste(event.target.value)}
            onPaste={() => {
              setResult(null)
              setFeedback(null)
            }}
            rows={8}
            placeholder="Cole aqui os dados de Fator de Potência"
            spellCheck={false}
          />
        </label>
      </div>

      <div className="executadas-actions">
        <button
          type="button"
          className="primary-button"
          onClick={handleOrdenar}
          disabled={!hasAnyPaste}
        >
          Ordenar
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void handleCopiarPlanilha()}
          disabled={!result?.planilha.length}
        >
          Copiar planilha
        </button>
        <button type="button" className="secondary-button" onClick={handleLimpar}>
          Limpar
        </button>
      </div>

      {result?.planilha.length ? (
        <section className="executadas-planilha" aria-label="Planilha montada">
          <header className="executadas-block-header">
            <h3>
              Planilha MÊS_ANO
              {result.consumo ? ` · ${blockPeriodLabel(result.consumo, '')}` : ''}
            </h3>
            <span className="executadas-block-meta">
              {result.planilha.length} linha(s)
              {result.planilha.length > PREVIEW_ROWS
                ? ` · prévia ${PREVIEW_ROWS}`
                : ''}
            </span>
          </header>

          <div className="entrada-table-wrap executadas-planilha-wrap">
            <table className="data-table executadas-data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Dia</th>
                  <th>Postos</th>
                  <th>kWh</th>
                  <th>kVArh ind</th>
                  <th>kVArh cap</th>
                  <th>kW</th>
                  <th>kVAr ind</th>
                  <th>kVAr cap</th>
                  <th>Fator</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={`planilha-${index}`}>
                    <td>{row.data || '—'}</td>
                    <td>{row.dia || '—'}</td>
                    <td>{row.posto || '—'}</td>
                    <td>{row.consumo[0] || '—'}</td>
                    <td>{row.consumo[1] || '—'}</td>
                    <td>{row.consumo[2] || '—'}</td>
                    <td>{row.demanda[0] || '—'}</td>
                    <td>{row.demanda[1] || '—'}</td>
                    <td>{row.demanda[2] || '—'}</td>
                    <td>{row.fp || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
