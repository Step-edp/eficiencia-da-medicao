import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, type EnsaioSessaoMedicaoRecord } from './api'

type AnalisadorAnaliseModalProps = {
  ensaioId: string | null
  numeroSerie: string | null
  onClose: () => void
}

type FaseKey = 'a' | 'b' | 'c'
type Voltage = '127V' | '220V'

type AnaliseGrupo = {
  voltage: Voltage
  fase: FaseKey
  mediaPadrao: number
  mediaEquipamento: number
  errosPercentuais: number[]
  desvioPadrao: number
}

const VOLTAGES: Voltage[] = ['127V', '220V']
const FASES: FaseKey[] = ['a', 'b', 'c']

function getPadraoValue(row: EnsaioSessaoMedicaoRecord, fase: FaseKey): number {
  if (fase === 'a') return Number(row.padraoFaseA)
  if (fase === 'b') return Number(row.padraoFaseB)
  return Number(row.padraoFaseC)
}

function getEquipamentoValue(row: EnsaioSessaoMedicaoRecord, fase: FaseKey): number {
  if (fase === 'a') return Number(row.equipamentoFaseA)
  if (fase === 'b') return Number(row.equipamentoFaseB)
  return Number(row.equipamentoFaseC)
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = average(values)
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function computeAnalise(medicoes: EnsaioSessaoMedicaoRecord[]): AnaliseGrupo[] {
  const grupos: AnaliseGrupo[] = []

  for (const voltage of VOLTAGES) {
    const rows = medicoes
      .filter((row) => row.voltage === voltage)
      .sort((a, b) => a.testeNumero - b.testeNumero)

    for (const fase of FASES) {
      const padraoValues = rows.map((row) => getPadraoValue(row, fase))
      const equipamentoValues = rows.map((row) => getEquipamentoValue(row, fase))

      const errosPercentuais = padraoValues.map((padrao, index) => {
        const equipamento = equipamentoValues[index]
        return padrao === 0 ? 0 : ((equipamento - padrao) / padrao) * 100
      })

      grupos.push({
        voltage,
        fase,
        mediaPadrao: padraoValues.length ? average(padraoValues) : 0,
        mediaEquipamento: equipamentoValues.length ? average(equipamentoValues) : 0,
        errosPercentuais,
        desvioPadrao: sampleStdDev(errosPercentuais),
      })
    }
  }

  return grupos
}

function formatNumber(value: number) {
  return value.toFixed(2).replace('.', ',')
}

export function AnalisadorAnaliseModal({
  ensaioId,
  numeroSerie,
  onClose,
}: AnalisadorAnaliseModalProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analise, setAnalise] = useState<AnaliseGrupo[]>([])

  useEffect(() => {
    if (!ensaioId) return
    setLoading(true)
    setError(null)
    setAnalise([])

    api
      .getEnsaioSessaoMedicoes(ensaioId)
      .then(({ medicoes }) => {
        const filtradas = numeroSerie
          ? medicoes.filter((row) => row.numeroSerie === numeroSerie)
          : medicoes
        setAnalise(computeAnalise(filtradas))
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Não foi possível calcular a análise.')
      })
      .finally(() => setLoading(false))
  }, [ensaioId, numeroSerie])

  useEffect(() => {
    if (!ensaioId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ensaioId, onClose])

  if (!ensaioId) return null

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="ensaios-block-modal analisador-laudo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analisador-analise-modal-title"
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

        <h3 id="analisador-analise-modal-title">
          Análise{numeroSerie ? ` · ${numeroSerie}` : ''}
        </h3>

        {loading ? (
          <p className="entrada-panel-empty">Calculando análise...</p>
        ) : error ? (
          <div className="login-feedback error" role="alert">
            {error}
          </div>
        ) : analise.length ? (
          <div className="entrada-table-wrap">
            <table className="data-table ensaio-medicao-table">
              <thead>
                <tr>
                  <th>Tensão</th>
                  <th>Fase</th>
                  <th>Média Padrão</th>
                  <th>Média Equip.</th>
                  <th>Erro % T1</th>
                  <th>Erro % T2</th>
                  <th>Erro % T3</th>
                  <th>Erro % T4</th>
                  <th>Erro % T5</th>
                  <th>Desvio padrão</th>
                </tr>
              </thead>
              <tbody>
                {analise.map((grupo) => (
                  <tr key={`${grupo.voltage}-${grupo.fase}`}>
                    <td>{grupo.voltage}</td>
                    <td>{grupo.fase.toUpperCase()}</td>
                    <td>{formatNumber(grupo.mediaPadrao)}</td>
                    <td>{formatNumber(grupo.mediaEquipamento)}</td>
                    {grupo.errosPercentuais.map((erro, index) => (
                      <td key={index}>{formatNumber(erro)}%</td>
                    ))}
                    <td>{formatNumber(grupo.desvioPadrao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="entrada-panel-empty">Nenhuma medição encontrada para calcular a análise.</p>
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
