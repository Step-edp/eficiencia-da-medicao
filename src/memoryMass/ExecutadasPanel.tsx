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
  const [pasteText, setPasteText] = useState('')
  const [result, setResult] = useState<OrdenarHemeraResult | null>(null)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const handleOrdenar = () => {
    const next = ordenarDadosHemera(pasteText)
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

    // Espelha a macro: após ordenar, limpa a área “BD_HEMERA”.
    setPasteText('')
    setFeedback({
      type: 'success',
      message:
        next.errors.length > 0
          ? `Ordenado com avisos: ${extracted} bloco(s) preenchido(s). ${next.errors.join(' ')}`
          : `Dados ordenados: Consumo, Demanda e Fator de Potência atualizados.`,
    })
  }

  const handleLimpar = () => {
    setPasteText('')
    setResult(null)
    setFeedback(null)
  }

  return (
    <div className="executadas-panel">
      <p className="executadas-intro">
        Cole aqui o conteúdo exportado do Hemera (equivalente à aba BD_HEMERA). Em seguida
        clique em <strong>Ordenar</strong> para extrair Consumo, Demanda e Fator de Potência —
        como o botão ORDENA da planilha.
      </p>

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      <label className="executadas-paste-label">
        Dados Hemera (colar)
        <textarea
          className="executadas-paste"
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          onPaste={() => {
            setResult(null)
            setFeedback(null)
          }}
          rows={10}
          placeholder="Selecione as células no Excel/Hemera, copie (Ctrl+C) e cole aqui (Ctrl+V)…"
          spellCheck={false}
        />
      </label>

      <div className="executadas-actions">
        <button
          type="button"
          className="primary-button"
          onClick={handleOrdenar}
          disabled={!pasteText.trim()}
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
