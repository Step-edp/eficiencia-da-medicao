import {
  ClipboardEvent,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  api,
  ApiError,
  type AnalisadorModeloCatalogEntry,
  type AnalisadorTensaoRecord,
  type EnsaioSessaoRecord,
} from './api'
import { formatAuditDate } from './auditLabels'
import { LoginFeedback } from './LoginFeedback'
import { AnalisadorLaudoModal } from './AnalisadorLaudoModal'
import { EnsaioSessaoModal } from './EnsaioSessaoModal'

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

type Voltage = '127V' | '220V'

const TESTE_STEPS: { voltage: Voltage; testeNumero: number }[] = [
  ...Array.from({ length: 5 }, (_, i) => ({ voltage: '127V' as const, testeNumero: i + 1 })),
  ...Array.from({ length: 5 }, (_, i) => ({ voltage: '220V' as const, testeNumero: i + 1 })),
]

type FaseInput = { a: string; b: string; c: string }
type StepMedicao = { padrao: FaseInput; leituras: Record<string, FaseInput> }

function emptyFase(): FaseInput {
  return { a: '', b: '', c: '' }
}

function buildInitialMedicoes(queue: AnalisadorTensaoRecord[]): StepMedicao[] {
  return TESTE_STEPS.map(() => ({
    padrao: emptyFase(),
    leituras: Object.fromEntries(queue.map((item) => [item.id, emptyFase()])),
  }))
}

function sanitizeFaseDigits(value: string): string {
  return value.replace(/\D/g, '').slice(-5)
}

const FASE_NAVIGATION_KEYS = new Set([
  'Tab',
  'Shift',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'Escape',
  'Enter',
])

function handleFaseKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  currentDigits: string,
  onChange: (digits: string) => void,
) {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (FASE_NAVIGATION_KEYS.has(event.key)) return

  if (/^[0-9]$/.test(event.key)) {
    event.preventDefault()
    onChange(sanitizeFaseDigits(currentDigits + event.key))
    return
  }

  if (event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault()
    onChange(currentDigits.slice(0, -1))
    return
  }

  event.preventDefault()
}

function handleFasePaste(
  event: ClipboardEvent<HTMLInputElement>,
  currentDigits: string,
  onChange: (digits: string) => void,
) {
  event.preventDefault()
  const pasted = event.clipboardData.getData('text')
  onChange(sanitizeFaseDigits(currentDigits + pasted))
}

function faseDigitsToDisplay(digits: string): string {
  if (!digits) return ''
  const normalized = digits.padStart(3, '0')
  const integerPart = normalized.slice(0, -2).padStart(3, '0')
  const decimalPart = normalized.slice(-2)
  return `${integerPart},${decimalPart}`
}

function faseDigitsToNumber(digits: string): number {
  const normalized = digits.padStart(3, '0')
  const integerPart = normalized.slice(0, -2) || '0'
  const decimalPart = normalized.slice(-2)
  return Number(`${integerPart}.${decimalPart}`)
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
  const [laudoAnalisador, setLaudoAnalisador] = useState<AnalisadorTensaoRecord | null>(null)

  const [showEnsaiosRealizados, setShowEnsaiosRealizados] = useState(false)
  const [ensaiosSessoes, setEnsaiosSessoes] = useState<EnsaioSessaoRecord[]>([])
  const [loadingEnsaiosSessoes, setLoadingEnsaiosSessoes] = useState(false)
  const [selectedEnsaioId, setSelectedEnsaioId] = useState<string | null>(null)

  const [showEnsaiarForm, setShowEnsaiarForm] = useState(false)
  const [ensaiarSerieInput, setEnsaiarSerieInput] = useState('')
  const [ensaiarQueue, setEnsaiarQueue] = useState<AnalisadorTensaoRecord[]>([])
  const [ensaioPhase, setEnsaioPhase] = useState<'selecao' | 'medicoes'>('selecao')
  const [ensaioStepIndex, setEnsaioStepIndex] = useState(0)
  const [medicoes, setMedicoes] = useState<StepMedicao[]>([])
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
    setEnsaioPhase('selecao')
    setEnsaioStepIndex(0)
    setMedicoes([])
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

  const startEnsaioWizard = () => {
    if (!ensaiarQueue.length) {
      setFeedback({ type: 'error', message: 'Adicione ao menos um número de série para ensaiar.' })
      return
    }
    setMedicoes(buildInitialMedicoes(ensaiarQueue))
    setEnsaioStepIndex(0)
    setEnsaioPhase('medicoes')
    setFeedback(null)
  }

  const updatePadraoFase = (field: keyof FaseInput, value: string) => {
    const digits = sanitizeFaseDigits(value)
    setMedicoes((current) =>
      current.map((step, idx) =>
        idx === ensaioStepIndex ? { ...step, padrao: { ...step.padrao, [field]: digits } } : step,
      ),
    )
  }

  const updateLeituraFase = (analisadorId: string, field: keyof FaseInput, value: string) => {
    const digits = sanitizeFaseDigits(value)
    setMedicoes((current) =>
      current.map((step, idx) =>
        idx === ensaioStepIndex
          ? {
              ...step,
              leituras: {
                ...step.leituras,
                [analisadorId]: { ...step.leituras[analisadorId], [field]: digits },
              },
            }
          : step,
      ),
    )
  }

  const isCurrentStepComplete = () => {
    const step = medicoes[ensaioStepIndex]
    if (!step) return false
    if (!step.padrao.a.trim() || !step.padrao.b.trim() || !step.padrao.c.trim()) return false
    return ensaiarQueue.every((item) => {
      const leitura = step.leituras[item.id]
      return leitura && leitura.a.trim() && leitura.b.trim() && leitura.c.trim()
    })
  }

  const handleVoltarStep = () => {
    if (ensaioStepIndex === 0) {
      setEnsaioPhase('selecao')
      return
    }
    setEnsaioStepIndex((current) => current - 1)
  }

  const handleFinishEnsaio = async () => {
    setEnsaiando(true)
    setFeedback(null)
    try {
      const rows = medicoes.flatMap((step, idx) => {
        const { voltage, testeNumero } = TESTE_STEPS[idx]
        return ensaiarQueue.map((item) => {
          const leitura = step.leituras[item.id]
          return {
            analisadorId: item.id,
            voltage,
            testeNumero,
            padraoFaseA: faseDigitsToNumber(step.padrao.a),
            padraoFaseB: faseDigitsToNumber(step.padrao.b),
            padraoFaseC: faseDigitsToNumber(step.padrao.c),
            equipamentoFaseA: faseDigitsToNumber(leitura.a),
            equipamentoFaseB: faseDigitsToNumber(leitura.b),
            equipamentoFaseC: faseDigitsToNumber(leitura.c),
          }
        })
      })

      const { analisadores: updated } = await api.registrarEnsaioAnalisadores({ rows })
      setAnalisadores((current) =>
        current.map((row) => updated.find((item) => item.id === row.id) ?? row),
      )

      const serieList = ensaiarQueue.map((item) => item.numeroSerie).join(', ')
      resetEnsaiarForm()
      setShowEnsaiarForm(false)
      setFeedback({
        type: 'success',
        message:
          updated.length === 1
            ? `Ensaio registrado para o analisador ${serieList}.`
            : `Ensaio registrado para ${updated.length} analisadores: ${serieList}.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof ApiError ? error.message : 'Não foi possível registrar o ensaio.',
      })
    } finally {
      setEnsaiando(false)
    }
  }

  const handleAvancarStep = async () => {
    if (!isCurrentStepComplete()) {
      setFeedback({
        type: 'error',
        message: 'Preencha o Padrão de Energia e as fases de todos os equipamentos deste teste.',
      })
      return
    }
    setFeedback(null)
    if (ensaioStepIndex < TESTE_STEPS.length - 1) {
      setEnsaioStepIndex((current) => current + 1)
      return
    }
    await handleFinishEnsaio()
  }

  const toggleEnsaiosRealizados = () => {
    setShowEnsaiarForm(false)
    setShowForm(false)
    setFeedback(null)
    setShowEnsaiosRealizados((current) => {
      const next = !current
      if (next) {
        setLoadingEnsaiosSessoes(true)
        api
          .listEnsaiosRealizados()
          .then(({ ensaios }) => setEnsaiosSessoes(ensaios))
          .catch((error) => {
            setFeedback({
              type: 'error',
              message:
                error instanceof ApiError
                  ? error.message
                  : 'Não foi possível carregar os ensaios realizados.',
            })
          })
          .finally(() => setLoadingEnsaiosSessoes(false))
      }
      return next
    })
  }

  return (
    <div className="analisadores-tensao-panel">
      {readOnly ? null : (
        <div className="area-actions right-aligned-actions">
          {!showForm && !showEnsaiosRealizados ? (
            <button
              type="button"
              className={`secondary-button${showEnsaiarForm ? ' analisador-form-close-button' : ''}`}
              aria-label={showEnsaiarForm ? 'Fechar formulário' : undefined}
              onClick={() => {
                setShowEnsaiarForm((current) => !current)
                setShowForm(false)
                setShowEnsaiosRealizados(false)
                setFeedback(null)
                resetEnsaiarForm()
              }}
            >
              {showEnsaiarForm ? '×' : 'Ensaiar analisador'}
            </button>
          ) : null}
          {!showForm && !showEnsaiarForm ? (
            <button
              type="button"
              className={`secondary-button${showEnsaiosRealizados ? ' analisador-form-close-button' : ''}`}
              aria-label={showEnsaiosRealizados ? 'Fechar' : undefined}
              onClick={toggleEnsaiosRealizados}
            >
              {showEnsaiosRealizados ? '×' : 'Ensaios realizados'}
            </button>
          ) : null}
          {!showEnsaiarForm && !showEnsaiosRealizados ? (
            <button
              type="button"
              className={`primary-button${showForm ? ' analisador-form-close-button' : ''}`}
              aria-label={showForm ? 'Fechar formulário' : undefined}
              onClick={() => {
                setShowForm((current) => !current)
                setShowEnsaiarForm(false)
                setShowEnsaiosRealizados(false)
                setFeedback(null)
                resetForm()
              }}
            >
              {showForm ? '×' : 'Cadastrar analisador'}
            </button>
          ) : null}
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

      {showEnsaiarForm && !readOnly && ensaioPhase === 'selecao' ? (
        <div className="material-form-grid">
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
                />
                <button type="button" className="secondary-button" onClick={addEnsaiarSerie}>
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
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="agenda-form-actions full-width">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                resetEnsaiarForm()
                setShowEnsaiarForm(false)
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={startEnsaioWizard}
              disabled={!ensaiarQueue.length}
            >
              Iniciar ensaio
            </button>
          </div>
        </div>
      ) : null}

      {showEnsaiarForm && !readOnly && ensaioPhase === 'medicoes' ? (
        <div className="material-form-grid">
          <p className="full-width ensaio-step-title">
            {TESTE_STEPS[ensaioStepIndex].voltage} · Teste{' '}
            {TESTE_STEPS[ensaioStepIndex].testeNumero} de 5
          </p>

          <fieldset className="radio-fieldset full-width">
            <legend>Padrão de Energia</legend>
            <div className="fase-input-row">
              {(['a', 'b', 'c'] as const).map((field) => {
                const currentDigits = medicoes[ensaioStepIndex]?.padrao[field] ?? ''
                return (
                  <label key={field}>
                    {`Fase ${field.toUpperCase()}`}
                    <input
                      type="text"
                      inputMode="decimal"
                      className="fase-input"
                      placeholder="000,00"
                      value={faseDigitsToDisplay(currentDigits)}
                      onChange={() => {}}
                      onKeyDown={(event) =>
                        handleFaseKeyDown(event, currentDigits, (digits) =>
                          updatePadraoFase(field, digits),
                        )
                      }
                      onPaste={(event) =>
                        handleFasePaste(event, currentDigits, (digits) =>
                          updatePadraoFase(field, digits),
                        )
                      }
                      disabled={ensaiando}
                    />
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className="full-width entrada-table-wrap">
            <table className="data-table ensaio-medicao-table">
              <thead>
                <tr>
                  <th>Número de série</th>
                  <th>Fase A</th>
                  <th>Fase B</th>
                  <th>Fase C</th>
                </tr>
              </thead>
              <tbody>
                {ensaiarQueue.map((item) => {
                  const leitura = medicoes[ensaioStepIndex]?.leituras[item.id] ?? emptyFase()
                  return (
                    <tr key={item.id}>
                      <td>{item.numeroSerie}</td>
                      {(['a', 'b', 'c'] as const).map((field) => {
                        const currentDigits = leitura[field]
                        return (
                          <td key={field}>
                            <input
                              type="text"
                              inputMode="decimal"
                              className="fase-input"
                              placeholder="000,00"
                              value={faseDigitsToDisplay(currentDigits)}
                              onChange={() => {}}
                              onKeyDown={(event) =>
                                handleFaseKeyDown(event, currentDigits, (digits) =>
                                  updateLeituraFase(item.id, field, digits),
                                )
                              }
                              onPaste={(event) =>
                                handleFasePaste(event, currentDigits, (digits) =>
                                  updateLeituraFase(item.id, field, digits),
                                )
                              }
                              disabled={ensaiando}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="agenda-form-actions full-width">
            <button
              type="button"
              className="secondary-button"
              disabled={ensaiando}
              onClick={handleVoltarStep}
            >
              Voltar
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={ensaiando}
              onClick={() => void handleAvancarStep()}
            >
              {ensaiando
                ? 'Salvando…'
                : ensaioStepIndex === TESTE_STEPS.length - 1
                  ? 'Concluir ensaio'
                  : 'Próximo'}
            </button>
          </div>
        </div>
      ) : null}

      {showEnsaiosRealizados ? (
        loadingEnsaiosSessoes ? (
          <p className="entrada-panel-empty">Carregando ensaios realizados...</p>
        ) : ensaiosSessoes.length ? (
          <div className="entrada-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Em</th>
                  <th>Números de série</th>
                  <th>Registrado por</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {ensaiosSessoes.map((sessao) => (
                  <tr key={sessao.ensaioId}>
                    <td>{formatAuditDate(sessao.createdAt)}</td>
                    <td>{sessao.numerosSerie.join(', ')}</td>
                    <td>{sessao.createdByName || sessao.createdByRegistration || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setSelectedEnsaioId(sessao.ensaioId)}
                      >
                        Ver medições
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="entrada-panel-empty">Nenhum ensaio registrado ainda.</p>
        )
      ) : showEnsaiarForm ? null : loading ? (
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
                    <th aria-label="Ações" />
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
                      <td>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => setLaudoAnalisador(item)}
                          aria-label="Visualizar laudo"
                          title="Visualizar laudo"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M14 3v5h5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M9 13h6M9 17h6"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </td>
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

      <AnalisadorLaudoModal analisador={laudoAnalisador} onClose={() => setLaudoAnalisador(null)} />
      <EnsaioSessaoModal ensaioId={selectedEnsaioId} onClose={() => setSelectedEnsaioId(null)} />
    </div>
  )
}
