import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  api,
  ApiError,
  type MemoriaMassaNotaRecord,
} from '../api'
import { LoginFeedback } from '../LoginFeedback'

const AGENTE_NOTAS = 'http://127.0.0.1:8765'

type ExtracaoLocal = {
  estado: 'ocioso' | 'rodando' | 'pronto' | 'erro' | string
  mensagem?: string
  notas?: Array<{ nota: string; instalacao?: string; detalhes?: Record<string, string> }>
}

const CAMPOS_DETALHE = [
  { rotulo: 'Data da nota', testes: ['data da nota', 'data'] },
  { rotulo: 'Cidade', testes: ['cidade'] },
  { rotulo: 'Centro (CtPl)', testes: ['ctpl', 'centro'] },
  { rotulo: 'Conclusão desejada', testes: ['conclusao desej', 'concl'] },
  { rotulo: 'BT ou MT', testes: ['bt ou mt', 'bt/mt'] },
  { rotulo: 'Nível de tensão', testes: ['nivel de tensao'] },
  { rotulo: 'Referência', testes: ['referencia', 'refer'] },
  { rotulo: 'MMGD', testes: ['mmgd', 'mm/gi', 'mm/g', 'mmgi'] },
  { rotulo: 'Duas linhas', testes: ['duas linha'] },
]

function semAcento(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function linhasDetalhe(detalhes: Record<string, string> | undefined) {
  const entradas = Object.entries(detalhes ?? {}).filter(([chave]) => {
    const nome = semAcento(chave)
    return nome !== 'nota' && nome !== 'instalacao'
  })
  const usadas = new Set<string>()
  const linhas = CAMPOS_DETALHE.map((campo) => {
    const achada = entradas.find(([chave]) => {
      const nome = semAcento(chave)
      return campo.testes.some((teste) => nome === teste || nome.startsWith(teste))
    })
    if (achada) usadas.add(achada[0])
    return { rotulo: campo.rotulo, valor: achada?.[1]?.trim() || '—' }
  })
  for (const [chave, valor] of entradas) {
    if (usadas.has(chave)) continue
    linhas.push({ rotulo: chave, valor: valor.trim() || '—' })
  }
  return linhas
}

function esperar(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function chamarAgente(caminho: string, method: 'GET' | 'POST') {
  const resposta = await fetch(`${AGENTE_NOTAS}${caminho}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Memoria-Massa': '1',
    },
    body: method === 'POST' ? '{}' : undefined,
  })
  const dados = (await resposta.json()) as ExtracaoLocal
  if (!resposta.ok) {
    throw new Error(dados.mensagem || 'O programa deste computador recusou o pedido.')
  }
  return dados
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('pt-BR')
}

export function NotasPanel() {
  const [notas, setNotas] = useState<MemoriaMassaNotaRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [extraindo, setExtraindo] = useState(false)
  const [notaAberta, setNotaAberta] = useState<MemoriaMassaNotaRecord | null>(null)
  const extraindoRef = useRef(false)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.listMemoriaMassaNotas({
        status: 'pendente',
      })
      setNotas(response.notas)
    } catch (error) {
      setNotas([])
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar as notas pendentes.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const notasVisiveis = useMemo(() => {
    const termo = semAcento(search)
    if (!termo) return notas
    return notas.filter(
      (nota) =>
        semAcento(nota.nota).includes(termo) || semAcento(nota.instalacao).includes(termo),
    )
  }, [notas, search])

  useEffect(() => {
    if (!notaAberta) return
    const fechar = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotaAberta(null)
    }
    window.addEventListener('keydown', fechar)
    return () => window.removeEventListener('keydown', fechar)
  }, [notaAberta])

  const handleExtrair = async () => {
    if (extraindoRef.current) return
    extraindoRef.current = true
    setExtraindo(true)
    setFeedback({
      type: 'success',
      message: 'Pedindo a extração ao SAP deste computador...',
    })
    try {
      let dados = await chamarAgente('/extrair', 'POST')
      const limite = Date.now() + 3 * 60 * 60 * 1000
      while (dados.estado === 'rodando' && Date.now() < limite) {
        setFeedback({
          type: 'success',
          message: dados.mensagem || 'Extraindo notas no SAP...',
        })
        await esperar(2000)
        dados = await chamarAgente('/extrair', 'GET')
      }
      if (dados.estado === 'rodando') {
        throw new Error('A extração passou do tempo limite.')
      }
      if (dados.estado === 'erro') {
        throw new Error(dados.mensagem || 'A extração no SAP falhou.')
      }
      if (dados.estado !== 'pronto') {
        throw new Error(dados.mensagem || 'A extração não devolveu a lista.')
      }

      const notasExtraidas = dados.notas ?? []
      if (!notasExtraidas.length) {
        await chamarAgente('/extrair/ack', 'POST')
        setFeedback({
          type: 'success',
          message: 'Não existem notas pendentes no SAP.',
        })
        return
      }

      const response = await api.createMemoriaMassaNotasBulk(
        notasExtraidas.map((item) => ({
          nota: item.nota,
          instalacao: item.instalacao ?? '',
          detalhes: item.detalhes ?? {},
        })),
      )
      await chamarAgente('/extrair/ack', 'POST')
      const atualizadas = response.updated?.length ?? 0
      const atualMsg = atualizadas
        ? ` ${atualizadas} já estavam na fila e receberam os dados do SAP.`
        : ''
      setFeedback({
        type: 'success',
        message: `${response.inserted} nota(s) importada(s) do SAP.${atualMsg}`,
      })
      await load()
    } catch (error) {
      const semPrograma = error instanceof TypeError
      setFeedback({
        type: 'error',
        message: semPrograma
          ? 'Não encontrei o programa neste computador. Deixe o agente_notas.py aberto. Se o navegador pedir acesso à rede local, permita.'
          : error instanceof Error
            ? error.message
            : 'Não foi possível importar as notas.',
      })
    } finally {
      extraindoRef.current = false
      setExtraindo(false)
    }
  }

  return (
    <div className="memoria-notas-panel">
      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      <div className="memoria-notas-toolbar">
        <form className="memoria-notas-search" onSubmit={(event) => event.preventDefault()}>
          <label>
            Buscar
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nota ou instalação"
            />
          </label>
        </form>
        <button
          type="button"
          className="primary-button"
          disabled={extraindo}
          onClick={() => void handleExtrair()}
        >
          {extraindo ? 'Extraindo no SAP…' : 'Importar notas'}
        </button>
      </div>

      {loading ? (
        <p className="entrada-panel-empty">Carregando notas pendentes...</p>
      ) : (
        <>
          <p className="memoria-notas-count" role="status">
            {notasVisiveis.length} nota(s) para executar
          </p>
          <div className="entrada-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nota</th>
                <th>Instalação</th>
                <th>Incluída em</th>
              </tr>
            </thead>
            <tbody>
              {notasVisiveis.length ? (
                notasVisiveis.map((nota) => (
                  <tr key={nota.id}>
                    <td>
                      <button
                        type="button"
                        className="nota-detalhe-link"
                        onClick={() => setNotaAberta(nota)}
                      >
                        {nota.nota}
                      </button>
                    </td>
                    <td>{nota.instalacao || '—'}</td>
                    <td>{formatDateTime(nota.createdAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>
                    {notas.length
                      ? 'Nenhuma nota encontrada para essa busca.'
                      : 'Nenhuma nota pendente de execução. Use "Importar notas" para carregar a fila.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </>
      )}

      {notaAberta ? (
        <div className="nota-detalhe-fundo" onClick={() => setNotaAberta(null)}>
          <section
            className="nota-detalhe"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nota-detalhe-titulo"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h3 id="nota-detalhe-titulo">Nota {notaAberta.nota}</h3>
              <button
                type="button"
                className="nota-detalhe-fechar"
                aria-label="Fechar"
                onClick={() => setNotaAberta(null)}
              >
                X
              </button>
            </header>
            <p>Instalação {notaAberta.instalacao || '—'}</p>
            {Object.keys(notaAberta.detalhes ?? {}).length ? (
              <dl>
                {linhasDetalhe(notaAberta.detalhes).map((linha) => (
                  <div key={linha.rotulo}>
                    <dt>{linha.rotulo}</dt>
                    <dd>{linha.valor}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>
                Esta importação não trouxe data, cidade, centro, conclusão, referência, MMGD nem
                duas linhas. Elas aparecem depois do próximo Importar notas.
              </p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  )
}
