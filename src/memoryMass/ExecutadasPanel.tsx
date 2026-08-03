import { useMemo, useState } from 'react'
import { LoginFeedback } from '../LoginFeedback'
import {
  blockPeriodLabel,
  ordenarDadosHemera,
  type HemeraBlock,
  type OrdenarHemeraResult,
} from './ordenarHemera'

function HemeraBlockTable({
  title,
  period,
  block,
  tone,
}: {
  title: string
  period: string
  block: HemeraBlock | null
  tone: 'consumo' | 'demanda' | 'fp'
}) {
  const colCount = useMemo(() => {
    if (!block?.rows.length) return 1
    return Math.max(...block.rows.map((row) => row.length), 1)
  }, [block])

  return (
    <section className={`executadas-block executadas-block-${tone}`}>
      <header className="executadas-block-header">
        <h3>
          {period ? `${period} ` : ''}
          {title}
        </h3>
        <span className="executadas-block-meta">
          {block ? `${block.rows.length} linha(s)` : 'Sem dados'}
        </span>
      </header>
      {!block || block.rows.length === 0 ? (
        <p className="executadas-block-empty">Nenhum dado ordenado neste bloco.</p>
      ) : (
        <div className="entrada-table-wrap">
          <table className="data-table executadas-data-table">
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${tone}-${rowIndex}`}>
                  {Array.from({ length: colCount }, (_, colIndex) => (
                    <td key={`${tone}-${rowIndex}-${colIndex}`}>{row[colIndex] || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

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

  const handleOrdenar = () => {
    const next = ordenarDadosHemera({
      consumo: consumoPaste,
      demanda: demandaPaste,
      fp: fpPaste,
    })
    setResult(next)

    const extracted = [next.consumo, next.demanda, next.fp].filter(Boolean).length
    if (extracted === 0) {
      setFeedback({
        type: 'error',
        message:
          next.errors[0] ??
          'Não foi possível ordenar os dados. Verifique o conteúdo colado.',
      })
      return
    }

    setConsumoPaste('')
    setDemandaPaste('')
    setFpPaste('')
    setFeedback({
      type: 'success',
      message:
        next.errors.length > 0
          ? `Ordenado com avisos: ${extracted} bloco(s) preenchido(s). ${next.errors.join(' ')}`
          : 'Dados ordenados: Consumo, Demanda e Fator de Potência atualizados.',
    })
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
            placeholder="Cole aqui os dados de Demanda (Ctrl+V)…"
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
            placeholder="Cole aqui os dados de Fator de Potência (Ctrl+V)…"
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
        <button type="button" className="secondary-button" onClick={handleLimpar}>
          Limpar
        </button>
      </div>

      {result ? (
        <div className="executadas-results" aria-label="Dados ordenados">
          <HemeraBlockTable
            title="CONSUMO"
            period={blockPeriodLabel(result.consumo, '')}
            block={result.consumo}
            tone="consumo"
          />
          <HemeraBlockTable
            title="DEMANDA"
            period={blockPeriodLabel(result.demanda, '')}
            block={result.demanda}
            tone="demanda"
          />
          <HemeraBlockTable
            title="FP"
            period={blockPeriodLabel(result.fp, '')}
            block={result.fp}
            tone="fp"
          />
        </div>
      ) : null}
    </div>
  )
}
