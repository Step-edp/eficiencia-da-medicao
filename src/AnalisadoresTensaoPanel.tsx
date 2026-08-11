import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  api,
  ApiError,
  type AnalisadorModeloCatalogEntry,
  type AnalisadorTensaoRecord,
} from './api'
import { formatAuditDate } from './auditLabels'
import { LoginFeedback } from './LoginFeedback'

function formatCalibrationDate(value: string) {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function isCalibrationExpired(dataUltimaCalibracao: string) {
  const [year, month, day] = dataUltimaCalibracao.split('-').map(Number)
  const dueDate = new Date(year, month - 1 + 24, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today >= dueDate
}

const SITUACAO_OPTIONS = ['Todos', 'Válida', 'Aferição vencida', 'Sem calibração'] as const
type SituacaoFilter = (typeof SITUACAO_OPTIONS)[number]

function getSituacao(item: AnalisadorTensaoRecord): Exclude<SituacaoFilter, 'Todos'> {
  if (!item.dataUltimaCalibracao) return 'Sem calibração'
  return isCalibrationExpired(item.dataUltimaCalibracao) ? 'Aferição vencida' : 'Válida'
}

export function AnalisadoresTensaoPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [analisadores, setAnalisadores] = useState<AnalisadorTensaoRecord[]>([])
  const [modelos, setModelos] = useState<AnalisadorModeloCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [numeroSerie, setNumeroSerie] = useState('')
  const [identificacaoLaudo, setIdentificacaoLaudo] = useState('')
  const [modelo, setModelo] = useState('')
  const [dataUltimaCalibracao, setDataUltimaCalibracao] = useState('')
  const [resultadoUltimaCalibracao, setResultadoUltimaCalibracao] = useState<
    'Aprovado' | 'Reprovado' | ''
  >('')
  const [primeiraCalibracao, setPrimeiraCalibracao] = useState(false)
  const [creating, setCreating] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )
  const [searchNumeroSerie, setSearchNumeroSerie] = useState('')
  const [situacaoFilter, setSituacaoFilter] = useState<SituacaoFilter>('Todos')

  const [showEnsaiarForm, setShowEnsaiarForm] = useState(false)
  const [ensaiarSerieInput, setEnsaiarSerieInput] = useState('')
  const [ensaiarQueue, setEnsaiarQueue] = useState<AnalisadorTensaoRecord[]>([])
  const [ensaiarData, setEnsaiarData] = useState('')
  const [ensaiarResultado, setEnsaiarResultado] = useState<'Aprovado' | 'Reprovado' | ''>('')
  const [ensaiando, setEnsaiando] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ analisadores: rows }, { modelos: catalog }] = await Promise.all([
        api.listAnalisadoresTensao(),
        api.listAnalisadorModelos(),
      ])
      setAnalisadores(rows)
      setModelos(catalog)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os analisadores de tensão.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const resetForm = () => {
    setNumeroSerie('')
    setIdentificacaoLaudo('')
    setModelo('')
    setDataUltimaCalibracao('')
    setResultadoUltimaCalibracao('')
    setPrimeiraCalibracao(false)
  }

  const resetEnsaiarForm = () => {
    setEnsaiarSerieInput('')
    setEnsaiarQueue([])
    setEnsaiarData('')
    setEnsaiarResultado('')
  }

  const addEnsaiarSerie = () => {
    const query = ensaiarSerieInput.trim()
    if (!query) return

    const match = analisadores.find(
      (item) => item.numeroSerie.toLowerCase() === query.toLowerCase(),
    )
    if (!match) {
      setFeedback({
        type: 'error',
        message: `Nenhum analisador cadastrado com o número de série "${query}".`,
      })
      return
    }
    if (ensaiarQueue.some((item) => item.id === match.id)) {
      setFeedback({ type: 'error', message: 'Esse analisador já foi adicionado.' })
      return
    }

    setEnsaiarQueue((current) => [...current, match])
    setEnsaiarSerieInput('')
    setFeedback(null)
  }

  const removeEnsaiarSerie = (id: string) => {
    setEnsaiarQueue((current) => current.filter((item) => item.id !== id))
  }

  const selectedModelo = modelos.find((entry) => entry.modelo === modelo) ?? null

  const filteredAnalisadores = useMemo(() => {
    const query = searchNumeroSerie.trim().toLowerCase()
    return analisadores
      .filter((item) => {
        if (query && !item.numeroSerie.toLowerCase().includes(query)) return false
        if (situacaoFilter !== 'Todos' && getSituacao(item) !== situacaoFilter) return false
        return true
      })
      .sort((a, b) => {
        if (!a.dataUltimaCalibracao && !b.dataUltimaCalibracao) return 0
        if (!a.dataUltimaCalibracao) return 1
        if (!b.dataUltimaCalibracao) return -1
        return a.dataUltimaCalibracao.localeCompare(b.dataUltimaCalibracao)
      })
  }, [analisadores, searchNumeroSerie, situacaoFilter])

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()

    if (!numeroSerie.trim() || !identificacaoLaudo.trim() || !modelo.trim()) {
      setFeedback({
        type: 'error',
        message: 'Informe número de série, identificação do laudo e modelo.',
      })
      return
    }

    if (!primeiraCalibracao && !dataUltimaCalibracao) {
      setFeedback({
        type: 'error',
        message: 'Informe a data da última calibração ou marque primeira calibração.',
      })
      return
    }

    if (!primeiraCalibracao && !resultadoUltimaCalibracao) {
      setFeedback({
        type: 'error',
        message: 'Informe o resultado da última calibração.',
      })
      return
    }

    setCreating(true)
    setFeedback(null)
    try {
      const { analisador } = await api.createAnalisadorTensao({
        numeroSerie: numeroSerie.trim(),
        identificacaoLaudo: identificacaoLaudo.trim(),
        modelo: modelo.trim(),
        primeiraCalibracao,
        dataUltimaCalibracao: primeiraCalibracao ? undefined : dataUltimaCalibracao,
        resultadoUltimaCalibracao: primeiraCalibracao
          ? undefined
          : resultadoUltimaCalibracao || undefined,
      })
      setAnalisadores((current) => [analisador, ...current])
      resetForm()
      setShowForm(false)
      setFeedback({
        type: 'success',
        message: `Analisador ${analisador.equipmentNumber} cadastrado com sucesso.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError ? error.message : 'Não foi possível cadastrar o analisador.',
      })
    } finally {
      setCreating(false)
    }
  }

  const handleEnsaiar = async (event: FormEvent) => {
    event.preventDefault()

    if (!ensaiarQueue.length || !ensaiarData || !ensaiarResultado) {
      setFeedback({
        type: 'error',
        message:
          'Adicione ao menos um número de série e informe a data e o resultado da calibração.',
      })
      return
    }

    setEnsaiando(true)
    setFeedback(null)

    const updated: AnalisadorTensaoRecord[] = []
    const failed: string[] = []

    for (const item of ensaiarQueue) {
      try {
        const { analisador } = await api.ensaiarAnalisadorTensao(item.id, {
          dataUltimaCalibracao: ensaiarData,
          resultadoUltimaCalibracao: ensaiarResultado,
        })
        updated.push(analisador)
      } catch {
        failed.push(item.numeroSerie)
      }
    }

    if (updated.length) {
      setAnalisadores((current) =>
        current.map((row) => updated.find((item) => item.id === row.id) ?? row),
      )
    }

    setEnsaiando(false)

    if (!failed.length) {
      resetEnsaiarForm()
      setShowEnsaiarForm(false)
      setFeedback({
        type: 'success',
        message:
          updated.length === 1
            ? `Nova calibração registrada para o analisador ${updated[0].numeroSerie}.`
            : `Nova calibração registrada para ${updated.length} analisadores.`,
      })
    } else {
      setEnsaiarQueue((current) => current.filter((item) => failed.includes(item.numeroSerie)))
      setFeedback({
        type: 'error',
        message: `Falha ao registrar ${failed.length} analisador(es): ${failed.join(', ')}.`,
      })
    }
  }

  return (
    <div className="analisadores-tensao-panel">
      {readOnly ? null : (
        <div className="area-actions right-aligned-actions">
          <button
            type="button"
            className={`secondary-button${showEnsaiarForm ? ' analisador-form-close-button' : ''}`}
            aria-label={showEnsaiarForm ? 'Fechar formulário' : undefined}
            onClick={() => {
              setShowEnsaiarForm((current) => !current)
              setShowForm(false)
              setFeedback(null)
              resetEnsaiarForm()
            }}
          >
            {showEnsaiarForm ? '×' : 'Ensaiar analisador'}
          </button>
          <button
            type="button"
            className={`primary-button${showForm ? ' analisador-form-close-button' : ''}`}
            aria-label={showForm ? 'Fechar formulário' : undefined}
            onClick={() => {
              setShowForm((current) => !current)
              setShowEnsaiarForm(false)
              setFeedback(null)
              resetForm()
            }}
          >
            {showForm ? '×' : 'Cadastrar analisador'}
          </button>
        </div>
      )}

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={feedback.type === 'success' ? () => setFeedback(null) : undefined}
        />
      ) : null}

      {showForm && !readOnly ? (
        <form className="material-form-grid" onSubmit={(event) => void handleCreate(event)}>
          <label>
            Número de série
            <input
              type="text"
              value={numeroSerie}
              onChange={(event) => setNumeroSerie(event.target.value)}
              placeholder="Número de série do equipamento"
              required
              disabled={creating}
            />
          </label>
          <label>
            Identificação do laudo
            <input
              type="text"
              value={identificacaoLaudo}
              onChange={(event) => setIdentificacaoLaudo(event.target.value)}
              placeholder="Identificação do laudo"
              required
              disabled={creating}
            />
          </label>
          <label>
            Modelo
            <select
              value={modelo}
              onChange={(event) => setModelo(event.target.value)}
              required
              disabled={creating}
            >
              <option value="">Selecione o modelo</option>
              {modelos.map((entry) => (
                <option key={entry.modelo} value={entry.modelo}>
                  {entry.modelo}
                </option>
              ))}
            </select>
          </label>

          {primeiraCalibracao ? null : (
            <label>
              Data da última calibração
              <input
                type="date"
                value={dataUltimaCalibracao}
                onChange={(event) => setDataUltimaCalibracao(event.target.value)}
                required={!primeiraCalibracao}
                disabled={creating}
              />
            </label>
          )}

          {primeiraCalibracao ? null : (
            <fieldset className="radio-fieldset full-width">
              <legend>Resultado da última calibração</legend>
              <div
                className="ratm-choice-group"
                role="radiogroup"
                aria-label="Resultado da última calibração"
              >
                {(['Aprovado', 'Reprovado'] as const).map((option) => {
                  const selected = resultadoUltimaCalibracao === option
                  const tone = option === 'Aprovado' ? 'positive' : 'negative'
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`ratm-choice-btn tone-${tone}${selected ? ' is-selected' : ''}`}
                      disabled={creating}
                      onClick={() => setResultadoUltimaCalibracao(option)}
                    >
                      <span>{option}</span>
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}
          <label className="full-width checkbox-field">
            <input
              type="checkbox"
              checked={primeiraCalibracao}
              disabled={creating}
              onChange={(event) => {
                setPrimeiraCalibracao(event.target.checked)
                if (event.target.checked) setDataUltimaCalibracao('')
              }}
            />
            <span>Primeira calibração</span>
          </label>

          {selectedModelo ? (
            <dl className="user-detail-grid analisador-modelo-info full-width">
              <div>
                <dt>Fabricante</dt>
                <dd>{selectedModelo.fabricante}</dd>
              </div>
              <div>
                <dt>Classe</dt>
                <dd>{selectedModelo.classe}</dd>
              </div>
              <div>
                <dt>VN</dt>
                <dd>{selectedModelo.vn}</dd>
              </div>
              <div>
                <dt>Vmáx</dt>
                <dd>{selectedModelo.vmax}</dd>
              </div>
              <div className="user-detail-full">
                <dt>Instrumento</dt>
                <dd>{selectedModelo.instrumento}</dd>
              </div>
            </dl>
          ) : null}

          <div className="agenda-form-actions full-width">
            <button
              type="button"
              className="secondary-button"
              disabled={creating}
              onClick={() => {
                resetForm()
                setShowForm(false)
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={
                creating ||
                !numeroSerie.trim() ||
                !identificacaoLaudo.trim() ||
                !modelo.trim() ||
                (!primeiraCalibracao && !dataUltimaCalibracao) ||
                (!primeiraCalibracao && !resultadoUltimaCalibracao)
              }
            >
              {creating ? 'Salvando…' : 'Salvar analisador'}
            </button>
          </div>
        </form>
      ) : null}

      {showEnsaiarForm && !readOnly ? (
        <form className="material-form-grid" onSubmit={(event) => void handleEnsaiar(event)}>
          <div className="full-width">
            <label>
              Números de série para ensaiar
              <div className="ensaiar-serie-input-row">
                <input
                  type="text"
                  list="analisadores-numero-serie-options"
                  value={ensaiarSerieInput}
                  onChange={(event) => setEnsaiarSerieInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addEnsaiarSerie()
                    }
                  }}
                  placeholder="Digite o número de série e pressione Enter"
                  disabled={ensaiando}
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={addEnsaiarSerie}
                  disabled={ensaiando}
                >
                  Adicionar
                </button>
              </div>
            </label>
            <datalist id="analisadores-numero-serie-options">
              {analisadores.map((item) => (
                <option key={item.id} value={item.numeroSerie} />
              ))}
            </datalist>

            {ensaiarQueue.length ? (
              <div className="ensaiar-serie-list">
                {ensaiarQueue.map((item) => (
                  <span key={item.id} className="ensaiar-serie-tag">
                    {item.numeroSerie}
                    <button
                      type="button"
                      aria-label={`Remover ${item.numeroSerie}`}
                      onClick={() => removeEnsaiarSerie(item.id)}
                      disabled={ensaiando}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <label>
            Data da calibração
            <input
              type="date"
              value={ensaiarData}
              onChange={(event) => setEnsaiarData(event.target.value)}
              required
              disabled={ensaiando}
            />
          </label>

          <fieldset className="radio-fieldset full-width">
            <legend>Resultado da calibração</legend>
            <div className="ratm-choice-group" role="radiogroup" aria-label="Resultado da calibração">
              {(['Aprovado', 'Reprovado'] as const).map((option) => {
                const selected = ensaiarResultado === option
                const tone = option === 'Aprovado' ? 'positive' : 'negative'
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`ratm-choice-btn tone-${tone}${selected ? ' is-selected' : ''}`}
                    disabled={ensaiando}
                    onClick={() => setEnsaiarResultado(option)}
                  >
                    <span>{option}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="agenda-form-actions full-width">
            <button
              type="button"
              className="secondary-button"
              disabled={ensaiando}
              onClick={() => {
                resetEnsaiarForm()
                setShowEnsaiarForm(false)
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={ensaiando || !ensaiarQueue.length || !ensaiarData || !ensaiarResultado}
            >
              {ensaiando ? 'Salvando…' : 'Registrar ensaio'}
            </button>
          </div>
        </form>
      ) : null}

      {showEnsaiarForm ? null : loading ? (
        <p className="entrada-panel-empty">Carregando analisadores...</p>
      ) : analisadores.length ? (
        <>
          <div className="consultar-toolbar">
            <label className="consultar-search">
              <span className="sr-only">Pesquisar por número de série</span>
              <span className="consultar-search-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M20 20l-3.5-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                type="search"
                value={searchNumeroSerie}
                onChange={(event) => setSearchNumeroSerie(event.target.value)}
                placeholder="Pesquisar por número de série"
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <label>
              Situação
              <select
                value={situacaoFilter}
                onChange={(event) => setSituacaoFilter(event.target.value as SituacaoFilter)}
              >
                {SITUACAO_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <p className="consultar-count" aria-live="polite">
              {filteredAnalisadores.length === analisadores.length
                ? `${analisadores.length} analisador(es) cadastrado(s)`
                : `${filteredAnalisadores.length} de ${analisadores.length} analisador(es)`}
            </p>
          </div>

          {filteredAnalisadores.length ? (
            <div className="entrada-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Número de série</th>
                    <th>Identificação do laudo</th>
                    <th>Modelo</th>
                    <th>Fabricante</th>
                    <th>Classe</th>
                    <th>VN</th>
                    <th>Vmáx</th>
                    <th>Instrumento</th>
                    <th>Última calibração</th>
                    <th>Resultado</th>
                    <th>Situação</th>
                    <th>Cadastrado por</th>
                    <th>Em</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAnalisadores.map((item) => (
                    <tr key={item.id}>
                      <td>{item.numeroSerie}</td>
                      <td>{item.identificacaoLaudo}</td>
                      <td>{item.modelo}</td>
                      <td>{item.fabricante}</td>
                      <td>{item.classe}</td>
                      <td>{item.vn}</td>
                      <td>{item.vmax}</td>
                      <td>{item.instrumento}</td>
                      <td>
                        {item.primeiraCalibracao
                          ? 'Primeira calibração'
                          : item.dataUltimaCalibracao
                            ? formatCalibrationDate(item.dataUltimaCalibracao)
                            : '—'}
                      </td>
                      <td>{item.resultadoUltimaCalibracao || '—'}</td>
                      <td>
                        {getSituacao(item) === 'Sem calibração' ? (
                          '—'
                        ) : getSituacao(item) === 'Aferição vencida' ? (
                          <span className="schedule-late-badge">Aferição vencida</span>
                        ) : (
                          <span className="schedule-ok-badge">Válida</span>
                        )}
                      </td>
                      <td>{item.createdByName || item.createdByRegistration || '—'}</td>
                      <td>{formatAuditDate(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="entrada-panel-empty">Nenhum analisador encontrado com esses filtros.</p>
          )}
        </>
      ) : (
        <p className="entrada-panel-empty">Nenhum analisador cadastrado.</p>
      )}
    </div>
  )
}
