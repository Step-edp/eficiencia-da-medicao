import { useMemo, useState } from 'react'
import { LoginFeedback } from '../LoginFeedback'
import { baixarPlanilhaEnvio } from './planilhaEnvio'
import {
  COLUNAS,
  executar,
  lerContaSap,
  numeroBr,
  planilhaParaTsv,
  type ResultadoModelador,
} from './modelador'

const PREVIEW_ROWS = 40

const RESUMO_LINHAS = [
  { grupo: 'Consumo', coluna: 'kWh' },
  { grupo: 'Demanda', coluna: 'kW' },
  { grupo: 'UFER', coluna: 'UFER' },
  { grupo: 'DRE', coluna: 'DMCR' },
] as const

type CamposHemera = {
  consumo: string
  demanda: string
  fator: string
  medidor: string
}

const VAZIO: CamposHemera = { consumo: '', demanda: '', fator: '', medidor: '' }

function formatar(valor: number | null | undefined) {
  if (valor == null) return '—'
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

export function ExecutadasPanel() {
  const [linha1, setLinha1] = useState<CamposHemera>(VAZIO)
  const [linha2, setLinha2] = useState<CamposHemera>(VAZIO)
  const [segundaLinha, setSegundaLinha] = useState(false)
  const [instalacao, setInstalacao] = useState('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [contaSap, setContaSap] = useState('')
  const [injetada, setInjetada] = useState('')
  const [resultados, setResultados] = useState<ResultadoModelador[]>([])
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const temColagem = Boolean(
    linha1.consumo.trim() || linha1.demanda.trim() || linha1.fator.trim(),
  )

  const preview = useMemo(
    () => (resultados[0]?.linhas ?? []).slice(0, PREVIEW_ROWS),
    [resultados],
  )

  const atualizar = (qual: 1 | 2, campo: keyof CamposHemera, valor: string) => {
    const setter = qual === 1 ? setLinha1 : setLinha2
    setter((atual) => ({ ...atual, [campo]: valor }))
    setResultados([])
    setFeedback(null)
  }

  const handleOrdenar = () => {
    const conta = lerContaSap(contaSap)
    const injetadaHemera = numeroBr(injetada)
    const blocos = [linha1, ...(segundaLinha ? [linha2] : [])]
    const saida = blocos.map((bloco) =>
      executar({
        consumo: bloco.consumo,
        demanda: bloco.demanda,
        fator: bloco.fator,
        medicoes: conta.medicoes,
        injetadaHemera,
      }),
    )

    const principal = saida[0]
    if (!principal || !principal.linhas.length) {
      setResultados([])
      setFeedback({
        type: 'error',
        message:
          principal?.erros[0] ??
          'Não foi possível montar a planilha. Cole o texto do Hemera com a linha do título (Consumo - , Demanda - , Fator de Potência - ).',
      })
      return
    }

    if (!linha1.medidor && principal.medidorTitulo) {
      setLinha1((atual) => ({ ...atual, medidor: principal.medidorTitulo }))
    }
    if (!inicio && principal.inicioTitulo) setInicio(principal.inicioTitulo)
    if (!fim && principal.fimTitulo) setFim(principal.fimTitulo)

    setResultados(saida)
    const avisos = saida.flatMap((item) => item.erros)
    if (contaSap.trim() && !conta.medicoes.length) {
      avisos.push(
        'A conta do SAP não foi reconhecida. Cole o texto da conta ou as colunas grandeza e medido.',
      )
    }
    const intervalos = saida.reduce((total, item) => total + item.linhas.length, 0)
    const impedidos = saida.reduce((total, item) => total + item.impedimentos.length, 0)
    setFeedback({
      type: impedidos ? 'error' : 'success',
      message: impedidos
        ? `Planilha com ${intervalos} intervalo(s). ${impedidos} grandeza(s) com diferença acima de 1 — o arquivo sai como Divergente.`
        : avisos.length
          ? `Planilha com ${intervalos} intervalo(s). ${avisos.join(' ')}`
          : `Planilha montada com ${intervalos} intervalo(s), no mesmo recorte do modelador.`,
    })
  }

  const medidorDa = (indice: number, resultado: ResultadoModelador) => {
    const digitado = (indice === 0 ? linha1.medidor : linha2.medidor).trim()
    return digitado || resultado.medidorTitulo || `Linha 0${indice + 1}`
  }

  const handleCopiar = async () => {
    const linhas = resultados[0]?.linhas ?? []
    if (!linhas.length) return
    try {
      await navigator.clipboard.writeText(planilhaParaTsv(linhas))
      setFeedback({
        type: 'success',
        message: 'Planilha copiada. Cole a partir da linha de dados da aba do medidor.',
      })
    } catch {
      setFeedback({
        type: 'error',
        message: 'Não foi possível copiar automaticamente. Tente novamente.',
      })
    }
  }

  const handleBaixar = () => {
    if (!resultados.length) return
    const divergente = resultados.some((item) => !item.podeAvancar && item.comparacao.length > 0)
    const nome = baixarPlanilhaEnvio({
      blocos: resultados.map((resultado, indice) => ({
        medidor: medidorDa(indice, resultado),
        linhas: resultado.linhas,
        comparacao: resultado.comparacao,
      })),
      instalacao: instalacao.trim() || undefined,
      inicio: inicio.trim() || resultados[0]?.inicioTitulo,
      fim: fim.trim() || resultados[0]?.fimTitulo,
      divergente,
    })
    setFeedback({
      type: 'success',
      message: `Arquivo ${nome} baixado, no modelo da planilha de envio.`,
    })
  }

  const handleLimpar = () => {
    setLinha1(VAZIO)
    setLinha2(VAZIO)
    setInstalacao('')
    setInicio('')
    setFim('')
    setContaSap('')
    setInjetada('')
    setResultados([])
    setFeedback(null)
  }

  const principal = resultados[0]

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
        Cole o texto do Hemera como no modelador: consumo a partir da coluna A, demanda a
        partir da I e fator de potência a partir da R, incluindo a linha do título (
        <strong>Consumo - </strong>, <strong>Demanda - </strong>, <strong>Fator de Potência - </strong>
        ). Se colar a conta do SAP, a diferença fica impedida quando a conta passa o resumo em
        mais de 1.
      </p>

      <div className="executadas-meta">
        <label>
          Instalação
          <input
            value={instalacao}
            onChange={(event) => setInstalacao(event.target.value)}
            inputMode="numeric"
            placeholder="Número da instalação"
          />
        </label>
        <label>
          Medidor
          <input
            value={linha1.medidor}
            onChange={(event) => atualizar(1, 'medidor', event.target.value)}
            inputMode="numeric"
            placeholder="Preenchido pelo título do Hemera"
          />
        </label>
        <label>
          Início
          <input
            value={inicio}
            onChange={(event) => setInicio(event.target.value)}
            placeholder="dd/mm/aaaa"
          />
        </label>
        <label>
          Fim
          <input
            value={fim}
            onChange={(event) => setFim(event.target.value)}
            placeholder="dd/mm/aaaa"
          />
        </label>
      </div>

      <div className="executadas-paste-grid" aria-label="Campos para colar dados">
        <CampoPaste
          titulo="Consumo"
          classe="executadas-paste-consumo"
          valor={linha1.consumo}
          onChange={(valor) => atualizar(1, 'consumo', valor)}
        />
        <CampoPaste
          titulo="Demanda"
          classe="executadas-paste-demanda"
          valor={linha1.demanda}
          onChange={(valor) => atualizar(1, 'demanda', valor)}
        />
        <CampoPaste
          titulo="Fator de Potência"
          classe="executadas-paste-fp"
          valor={linha1.fator}
          onChange={(valor) => atualizar(1, 'fator', valor)}
        />
      </div>

      <label className="executadas-segunda">
        <input
          type="checkbox"
          checked={segundaLinha}
          onChange={(event) => {
            setSegundaLinha(event.target.checked)
            setResultados([])
            setFeedback(null)
          }}
        />
        Segundo medidor (Linha 02)
      </label>

      {segundaLinha ? (
        <>
          <label className="executadas-medidor-2">
            Medidor da linha 02
            <input
              value={linha2.medidor}
              onChange={(event) => atualizar(2, 'medidor', event.target.value)}
              inputMode="numeric"
            />
          </label>
          <div className="executadas-paste-grid" aria-label="Segundo medidor">
            <CampoPaste
              titulo="Consumo"
              classe="executadas-paste-consumo"
              valor={linha2.consumo}
              onChange={(valor) => atualizar(2, 'consumo', valor)}
            />
            <CampoPaste
              titulo="Demanda"
              classe="executadas-paste-demanda"
              valor={linha2.demanda}
              onChange={(valor) => atualizar(2, 'demanda', valor)}
            />
            <CampoPaste
              titulo="Fator de Potência"
              classe="executadas-paste-fp"
              valor={linha2.fator}
              onChange={(valor) => atualizar(2, 'fator', valor)}
            />
          </div>
        </>
      ) : null}

      <label className="executadas-sap">
        Conta do SAP (opcional)
        <textarea
          value={contaSap}
          onChange={(event) => {
            setContaSap(event.target.value)
            setResultados([])
            setFeedback(null)
          }}
          rows={5}
          placeholder={'Cole a conta ou as grandezas e o medido, uma por linha.\nEnergia Ativa Ponta\t43168,86'}
          spellCheck={false}
        />
      </label>
      <label className="executadas-medidor-2">
        Energia injetada no Hemera (opcional)
        <input
          value={injetada}
          onChange={(event) => setInjetada(event.target.value)}
          placeholder="Só para conta com Ativo injetado"
        />
      </label>

      <div className="executadas-actions">
        <button type="button" className="primary-button" onClick={handleOrdenar} disabled={!temColagem}>
          Ordenar
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={handleBaixar}
          disabled={!principal?.linhas.length}
        >
          Baixar planilha
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void handleCopiar()}
          disabled={!principal?.linhas.length}
        >
          Copiar planilha
        </button>
        <button type="button" className="secondary-button" onClick={handleLimpar}>
          Limpar
        </button>
      </div>

      {principal?.linhas.length ? (
        <>
          <section className="executadas-planilha" aria-label="Resumo">
            <header className="executadas-block-header">
              <h3>Resumo</h3>
              <span className="executadas-block-meta">{principal.disponibilidade.consumo}</span>
            </header>
            <div className="entrada-table-wrap">
              <table className="data-table executadas-data-table">
                <thead>
                  <tr>
                    <th>Grandeza</th>
                    <th>Ponta</th>
                    <th>Reservado</th>
                    <th>Fora Ponta</th>
                  </tr>
                </thead>
                <tbody>
                  {RESUMO_LINHAS.map((linha) => {
                    const bloco = principal.resumo[linha.grupo]
                    return (
                      <tr key={linha.grupo}>
                        <td>{linha.grupo}</td>
                        <td>{formatar(bloco.Ponta)}</td>
                        <td>{formatar(bloco.Reservado)}</td>
                        <td>{formatar(bloco['Fora Ponta'])}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {resultados.some((item) => item.comparacao.length) ? (
            <section className="executadas-planilha" aria-label="Comparação com o SAP">
              <header className="executadas-block-header">
                <h3>Comparação com o SAP</h3>
                <span className="executadas-block-meta">
                  {resultados.every((item) => item.podeAvancar)
                    ? 'Nenhuma diferença acima de 1'
                    : `${resultados.reduce((total, item) => total + item.impedimentos.length, 0)} impedimento(s)`}
                </span>
              </header>
              <div className="entrada-table-wrap">
                <table className="data-table executadas-data-table">
                  <thead>
                    <tr>
                      {resultados.length > 1 ? <th>Medidor</th> : null}
                      <th>Grandeza</th>
                      <th>Posto</th>
                      <th>Hemera</th>
                      <th>SAP</th>
                      <th>Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultados.flatMap((resultado, indice) =>
                      resultado.comparacao.map((item) => (
                        <tr
                          key={`${indice}-${item.sap}-${item.posto}`}
                          className={item.impede ? 'executadas-comparacao-impede' : undefined}
                        >
                          {resultados.length > 1 ? <td>{medidorDa(indice, resultado)}</td> : null}
                          <td>{item.grupo}</td>
                          <td>{item.posto || '—'}</td>
                          <td>{formatar(item.hemera)}</td>
                          <td>{formatar(item.sapMedido)}</td>
                          <td>{formatar(item.diferenca)}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="executadas-planilha" aria-label="Planilha montada">
            <header className="executadas-block-header">
              <h3>
                Planilha {medidorDa(0, principal)}
                {principal.inicioTitulo && principal.fimTitulo
                  ? ` · ${principal.inicioTitulo} a ${principal.fimTitulo}`
                  : ''}
              </h3>
              <span className="executadas-block-meta">
                {principal.linhas.length} linha(s)
                {principal.linhas.length > PREVIEW_ROWS ? ` · prévia ${PREVIEW_ROWS}` : ''}
              </span>
            </header>
            <div className="entrada-table-wrap executadas-planilha-wrap">
              <table className="data-table executadas-data-table">
                <thead>
                  <tr>
                    {COLUNAS.map((nome) => (
                      <th key={nome}>{nome}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, index) => (
                    <tr key={`planilha-${index}`}>
                      {COLUNAS.map((nome) => (
                        <td key={nome}>{row[nome] || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}

function CampoPaste({
  titulo,
  classe,
  valor,
  onChange,
}: {
  titulo: string
  classe: string
  valor: string
  onChange: (valor: string) => void
}) {
  return (
    <label className={`executadas-paste-label ${classe}`}>
      {titulo}
      <textarea
        className="executadas-paste"
        value={valor}
        onChange={(event) => onChange(event.target.value)}
        rows={8}
        placeholder={`Cole aqui os dados de ${titulo}`}
        spellCheck={false}
      />
    </label>
  )
}
