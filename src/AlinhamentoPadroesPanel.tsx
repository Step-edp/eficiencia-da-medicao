import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  api,
  ApiError,
  type AlinhamentoEquipamentoRecord,
  type AlinhamentoMedicaoRecord,
  type AlinhamentoPadroesSnapshot,
  type AlinhamentoReferenciaRecord,
} from './api'
import { LoginFeedback } from './LoginFeedback'

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const POSICOES_PADRAO = 10
const UMA_POSICAO = new Set(['49093', '49107'])

function quantidadePosicoes(codigo: string) {
  return UMA_POSICAO.has(codigo.trim()) ? 1 : POSICOES_PADRAO
}

type Tab = 'medicoes' | 'equipamentos' | 'referencia'
type Modo = 'medir' | 'manutencao'

type PosicaoDraft = {
  nominal: string
  indutiva: string
  pequena: string
}

type EquipamentoDraft = {
  equipamentoId: string
  modo: Modo
  posicoes: PosicaoDraft[]
}

type ReferenciaDraft = Omit<AlinhamentoReferenciaRecord, 'id' | 'updatedAt'>

const emptyReferencia: ReferenciaDraft = {
  fabricante: '',
  modelo: '',
  classe: '',
  tensaoNominal: '',
  correnteNominal: '',
  frequencia: '',
  khKe: '',
  portariaInmetro: '',
  numeroSerie: '',
}

function emptyPosicoes(total: number): PosicaoDraft[] {
  return Array.from({ length: total }, () => ({ nominal: '', indutiva: '', pequena: '' }))
}

function equipamentoLabel(item: Pick<AlinhamentoEquipamentoRecord, 'identificacao' | 'codigo'>) {
  if (item.identificacao.trim() === item.codigo.trim()) return item.codigo
  return `${item.identificacao} - ${item.codigo}`
}

function formatErro(value: string) {
  return value.replace('.', ',')
}

function medicaoKey(equipamentoId: string, ano: number, mes: number) {
  return `${equipamentoId}:${ano}:${mes}`
}

function draftFromMedicao(
  medicao: AlinhamentoMedicaoRecord | undefined,
  equipamentoId: string,
  totalPosicoes: number,
): EquipamentoDraft {
  const posicoes = emptyPosicoes(totalPosicoes)
  if (!medicao) return { equipamentoId, modo: 'medir', posicoes }
  for (const item of medicao.posicoes) {
    const index = item.posicao - 1
    if (index < 0 || index >= posicoes.length) continue
    posicoes[index] = {
      nominal: formatErro(item.nominal),
      indutiva: formatErro(item.indutiva),
      pequena: formatErro(item.pequena),
    }
  }
  return {
    equipamentoId,
    modo: medicao.emManutencao ? 'manutencao' : 'medir',
    posicoes,
  }
}

function MedicaoResumo({ medicao }: { medicao: AlinhamentoMedicaoRecord | undefined }) {
  if (!medicao) return <span className="alinhamento-vazio">—</span>
  if (medicao.emManutencao) return <>Em manutenção</>
  const primeira = medicao.posicoes.find((item) => item.posicao === 1) ?? medicao.posicoes[0]
  if (!primeira) return <span className="alinhamento-vazio">—</span>
  return (
    <span className="alinhamento-leitura">
      <span>N {formatErro(primeira.nominal)}</span>
      <span>I {formatErro(primeira.indutiva)}</span>
      <span>P {formatErro(primeira.pequena)}</span>
    </span>
  )
}

export function AlinhamentoPadroesPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [tab, setTab] = useState<Tab>('medicoes')
  const [ano, setAno] = useState(() => new Date().getFullYear())
  const [snapshot, setSnapshot] = useState<AlinhamentoPadroesSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [mesAberto, setMesAberto] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<EquipamentoDraft[]>([])
  const [equipamentoForm, setEquipamentoForm] = useState({ identificacao: '', codigo: '' })
  const [referencia, setReferencia] = useState<ReferenciaDraft>(emptyReferencia)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .getAlinhamentoPadroes()
      .then((data) => {
        if (cancelled) return
        setSnapshot(data)
        setReferencia(data.referencia ? { ...emptyReferencia, ...data.referencia } : emptyReferencia)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setFeedback({
          type: 'error',
          message: error instanceof ApiError ? error.message : 'Não foi possível carregar o alinhamento.',
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const medicoesPorChave = useMemo(() => {
    const map = new Map<string, AlinhamentoMedicaoRecord>()
    for (const medicao of snapshot?.medicoes ?? []) {
      map.set(medicaoKey(medicao.equipamentoId, medicao.ano, medicao.mes), medicao)
    }
    return map
  }, [snapshot])

  const equipamentos = snapshot?.equipamentos ?? []

  function abrirMes(mes: number) {
    setMesAberto(mes)
    setDrafts(
      equipamentos.map((item) =>
        draftFromMedicao(
          medicoesPorChave.get(medicaoKey(item.id, ano, mes)),
          item.id,
          quantidadePosicoes(item.codigo),
        ),
      ),
    )
    setFeedback(null)
  }

  function updateDraft(equipamentoId: string, next: Partial<EquipamentoDraft>) {
    setDrafts((current) =>
      current.map((item) => (item.equipamentoId === equipamentoId ? { ...item, ...next } : item)),
    )
  }

  function updatePosicao(equipamentoId: string, index: number, field: keyof PosicaoDraft, value: string) {
    setDrafts((current) =>
      current.map((item) => {
        if (item.equipamentoId !== equipamentoId) return item
        const posicoes = item.posicoes.map((posicao, posicaoIndex) =>
          posicaoIndex === index ? { ...posicao, [field]: value } : posicao,
        )
        return { ...item, posicoes }
      }),
    )
  }

  async function salvarMedicoes(event: FormEvent) {
    event.preventDefault()
    if (mesAberto == null) return
    const itens = drafts.map((draft) => {
      const posicoes = draft.posicoes
        .map((posicao, index) => ({ posicao: index + 1, ...posicao }))
        .filter((posicao) => posicao.nominal.trim() || posicao.indutiva.trim() || posicao.pequena.trim())
      return { draft, posicoes }
    })
    const incompleta = itens.find(
      (item) =>
        item.draft.modo === 'medir' &&
        item.posicoes.some(
          (posicao) => !posicao.nominal.trim() || !posicao.indutiva.trim() || !posicao.pequena.trim(),
        ),
    )
    if (incompleta) {
      setFeedback({
        type: 'error',
        message: 'Preencha Nominal, Indutiva e Pequena em cada posição iniciada.',
      })
      return
    }
    const semMedicao = itens.find((item) => item.draft.modo === 'medir' && !item.posicoes.length)
    if (semMedicao) {
      const equipamento = equipamentos.find((item) => item.id === semMedicao.draft.equipamentoId)
      setFeedback({
        type: 'error',
        message: `Informe ao menos uma posição de ${equipamento ? equipamentoLabel(equipamento) : 'cada equipamento'}, ou marque Em manutenção.`,
      })
      return
    }

    setSaving(true)
    setFeedback(null)
    try {
      const data = await api.saveAlinhamentoMedicoes({
        ano,
        mes: mesAberto,
        itens: itens.map((item) => ({
          equipamentoId: item.draft.equipamentoId,
          emManutencao: item.draft.modo === 'manutencao',
          posicoes: item.draft.modo === 'manutencao' ? [] : item.posicoes,
        })),
      })
      setSnapshot(data)
      setMesAberto(null)
      setFeedback({ type: 'success', message: `Medições de ${MESES[mesAberto - 1]} de ${ano} registradas.` })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof ApiError ? error.message : 'Não foi possível registrar as medições.',
      })
    } finally {
      setSaving(false)
    }
  }

  async function salvarEquipamento(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      const { equipamento } = await api.createAlinhamentoEquipamento(equipamentoForm)
      setSnapshot((current) =>
        current
          ? { ...current, equipamentos: [...current.equipamentos, equipamento] }
          : { referencia: null, equipamentos: [equipamento], medicoes: [] },
      )
      setEquipamentoForm({ identificacao: '', codigo: '' })
      setFeedback({ type: 'success', message: 'Equipamento cadastrado.' })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof ApiError ? error.message : 'Não foi possível cadastrar o equipamento.',
      })
    } finally {
      setSaving(false)
    }
  }

  async function removerEquipamento(item: AlinhamentoEquipamentoRecord) {
    if (!window.confirm(`Excluir o equipamento ${equipamentoLabel(item)} e as medições dele?`)) return
    setSaving(true)
    setFeedback(null)
    try {
      await api.deleteAlinhamentoEquipamento(item.id)
      setSnapshot((current) =>
        current
          ? {
              ...current,
              equipamentos: current.equipamentos.filter((equipamento) => equipamento.id !== item.id),
              medicoes: current.medicoes.filter((medicao) => medicao.equipamentoId !== item.id),
            }
          : current,
      )
      setFeedback({ type: 'success', message: 'Equipamento excluído.' })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof ApiError ? error.message : 'Não foi possível excluir o equipamento.',
      })
    } finally {
      setSaving(false)
    }
  }

  async function salvarReferencia(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      const { referencia: saved } = await api.saveAlinhamentoReferencia(referencia)
      setSnapshot((current) =>
        current ? { ...current, referencia: saved } : { referencia: saved, equipamentos: [], medicoes: [] },
      )
      setReferencia({ ...emptyReferencia, ...saved })
      setFeedback({ type: 'success', message: 'Medidor referência salvo.' })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof ApiError ? error.message : 'Não foi possível salvar o medidor referência.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="alinhamento-padroes-panel">
      <div className="alinhamento-tabs">
        <div className="alinhamento-tab-group" role="tablist">
          {(
            [
              ['medicoes', 'Medições'],
              ['equipamentos', 'Equipamentos'],
              ['referencia', 'Medidor referência'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`alinhamento-chip${tab === id ? ' is-selected' : ''}`}
              onClick={() => {
                setTab(id)
                setMesAberto(null)
                setFeedback(null)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {readOnly ? null : (
          <button
            type="button"
            className="alinhamento-chip alinhamento-chip-action"
            disabled={!equipamentos.length}
            onClick={() => {
              setTab('medicoes')
              setFeedback(null)
              abrirMes(new Date().getMonth() + 1)
            }}
          >
            Registrar medições
          </button>
        )}
      </div>

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={feedback.type === 'success' ? () => setFeedback(null) : undefined}
        />
      ) : null}

      {loading ? <p>Carregando alinhamento de padrões...</p> : null}

      {!loading && tab === 'medicoes' ? (
        <>
          <div className="alinhamento-toolbar">
            <label className="alinhamento-ano">
              Ano
              <input
                type="number"
                min={2000}
                max={2100}
                value={ano}
                onChange={(event) => {
                  setAno(Number(event.target.value))
                  setMesAberto(null)
                }}
              />
            </label>
          </div>
          <p className="alinhamento-legenda">
            A grade mostra a posição 1 de cada mês. N é nominal, I é indutiva e P é pequena. Clique no mês
            para registrar as posições ou marcar em manutenção.
          </p>

          {!equipamentos.length ? (
            <p>Cadastre os equipamentos antes de registrar as medições do mês.</p>
          ) : (
            <div className="entrada-table-wrap">
              <table className="data-table alinhamento-ano-table">
                <thead>
                  <tr>
                    <th>Equipamento</th>
                    {MESES.map((nome, index) => (
                      <th key={nome}>
                        {readOnly ? (
                          nome.slice(0, 3)
                        ) : (
                          <button type="button" className="link-button" onClick={() => abrirMes(index + 1)}>
                            {nome.slice(0, 3)}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {equipamentos.map((equipamento) => (
                    <tr key={equipamento.id}>
                      <td>{equipamentoLabel(equipamento)}</td>
                      {MESES.map((nome, index) => {
                        const medicao = medicoesPorChave.get(medicaoKey(equipamento.id, ano, index + 1))
                        return (
                          <td key={nome} className={medicao?.emManutencao ? 'alinhamento-manutencao' : undefined}>
                            <MedicaoResumo medicao={medicao} />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {mesAberto != null && !readOnly ? (
            <form className="material-form-grid alinhamento-medicao-form" onSubmit={salvarMedicoes}>
              <h3 className="full-width">
                Medições de {MESES[mesAberto - 1]} de {ano}
              </h3>
              {drafts.map((draft) => {
                const equipamento = equipamentos.find((item) => item.id === draft.equipamentoId)
                if (!equipamento) return null
                return (
                  <fieldset key={draft.equipamentoId} className="full-width alinhamento-equipamento-fieldset">
                    <legend>{equipamentoLabel(equipamento)}</legend>
                    <div className="alinhamento-tab-group">
                      <button
                        type="button"
                        className={`alinhamento-chip${draft.modo === 'medir' ? ' is-selected' : ''}`}
                        onClick={() => updateDraft(draft.equipamentoId, { modo: 'medir' })}
                      >
                        Medir
                      </button>
                      <button
                        type="button"
                        className={`alinhamento-chip${draft.modo === 'manutencao' ? ' is-selected' : ''}`}
                        onClick={() => updateDraft(draft.equipamentoId, { modo: 'manutencao' })}
                      >
                        Em manutenção
                      </button>
                    </div>
                    {draft.modo === 'medir' ? (
                      <div className="entrada-table-wrap alinhamento-posicoes-wrap">
                        <table className="data-table alinhamento-posicoes-table">
                          <thead>
                            <tr>
                              <th>Posição</th>
                              <th>Nominal</th>
                              <th>Indutiva</th>
                              <th>Pequena</th>
                            </tr>
                          </thead>
                          <tbody>
                            {draft.posicoes.map((posicao, index) => (
                              <tr key={index}>
                                <td>{index + 1}</td>
                                {(['nominal', 'indutiva', 'pequena'] as const).map((field) => (
                                  <td key={field}>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={posicao[field]}
                                      onChange={(event) =>
                                        updatePosicao(draft.equipamentoId, index, field, event.target.value)
                                      }
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p>Este equipamento fica marcado como em manutenção neste mês.</p>
                    )}
                  </fieldset>
                )
              })}
              <div className="agenda-form-actions full-width">
                <button type="button" className="alinhamento-chip" onClick={() => setMesAberto(null)}>
                  Cancelar
                </button>
                <button type="submit" className="alinhamento-chip alinhamento-chip-action" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar medições'}
                </button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}

      {!loading && tab === 'equipamentos' ? (
        <>
          {readOnly ? null : (
            <form className="material-form-grid" onSubmit={salvarEquipamento}>
              <label>
                Identificação
                <input
                  value={equipamentoForm.identificacao}
                  onChange={(event) =>
                    setEquipamentoForm((current) => ({ ...current, identificacao: event.target.value }))
                  }
                  placeholder="SRS 121.3"
                  required
                />
              </label>
              <label>
                Código
                <input
                  value={equipamentoForm.codigo}
                  onChange={(event) =>
                    setEquipamentoForm((current) => ({ ...current, codigo: event.target.value }))
                  }
                  placeholder="45079"
                  required
                />
              </label>
              <div className="agenda-form-actions">
                <button type="submit" className="alinhamento-chip alinhamento-chip-action" disabled={saving}>
                  {saving ? 'Salvando...' : 'Cadastrar equipamento'}
                </button>
              </div>
            </form>
          )}
          <div className="entrada-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Identificação</th>
                  <th>Código</th>
                  {readOnly ? null : <th />}
                </tr>
              </thead>
              <tbody>
                {equipamentos.length ? (
                  equipamentos.map((item) => (
                    <tr key={item.id}>
                      <td>{item.identificacao}</td>
                      <td>{item.codigo}</td>
                      {readOnly ? null : (
                        <td>
                          <button
                            type="button"
                            className="alinhamento-chip alinhamento-chip-danger"
                            disabled={saving}
                            onClick={() => void removerEquipamento(item)}
                          >
                            Excluir
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={readOnly ? 2 : 3}>Nenhum equipamento cadastrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {!loading && tab === 'referencia' ? (
        <form className="material-form-grid" onSubmit={salvarReferencia}>
          {(
            [
              ['fabricante', 'Fabricante'],
              ['modelo', 'Modelo'],
              ['classe', 'Classe'],
              ['tensaoNominal', 'Tensão nominal'],
              ['correnteNominal', 'Corrente nominal'],
              ['frequencia', 'Frequência'],
              ['khKe', 'Kh/Ke'],
              ['portariaInmetro', 'Portaria do INMETRO'],
              ['numeroSerie', 'Número de série'],
            ] as const
          ).map(([field, label]) => (
            <label key={field}>
              {label}
              <input
                value={referencia[field]}
                onChange={(event) =>
                  setReferencia((current) => ({ ...current, [field]: event.target.value }))
                }
                required={field === 'numeroSerie'}
                readOnly={readOnly}
              />
            </label>
          ))}
          {readOnly ? null : (
            <div className="agenda-form-actions">
              <button type="submit" className="alinhamento-chip alinhamento-chip-action" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar medidor referência'}
              </button>
            </div>
          )}
        </form>
      ) : null}
    </div>
  )
}
