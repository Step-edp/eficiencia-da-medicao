import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
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
  notas?: Array<{ nota: string; instalacao?: string }>
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
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [extraindo, setExtraindo] = useState(false)
  const extraindoRef = useRef(false)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const load = useCallback(async (searchValue = '') => {
    setLoading(true)
    try {
      const response = await api.listMemoriaMassaNotas({
        status: 'pendente',
        search: searchValue.trim() || undefined,
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
    void load('')
  }, [load])

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
        })),
      )
      await chamarAgente('/extrair/ack', 'POST')
      const skipMsg = response.skippedDuplicates.length
        ? ` ${response.skippedDuplicates.length} já estavam pendentes.`
        : ''
      setFeedback({
        type: 'success',
        message: `${response.inserted} nota(s) importada(s) do SAP.${skipMsg}`,
      })
      await load(search)
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

  const handleSearch = (event: FormEvent) => {
    event.preventDefault()
    void load(search)
  }

  const markExecutada = async (nota: MemoriaMassaNotaRecord) => {
    setUpdatingId(nota.id)
    setFeedback(null)
    try {
      await api.updateMemoriaMassaNotaStatus(nota.id, 'executada')
      setNotas((current) => current.filter((item) => item.id !== nota.id))
      setFeedback({
        type: 'success',
        message: `Nota ${nota.nota} marcada como executada.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível atualizar a nota.',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  const removeNota = async (nota: MemoriaMassaNotaRecord) => {
    setUpdatingId(nota.id)
    setFeedback(null)
    try {
      await api.deleteMemoriaMassaNota(nota.id)
      setNotas((current) => current.filter((item) => item.id !== nota.id))
      setFeedback({
        type: 'success',
        message: `Nota ${nota.nota} removida.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível remover a nota.',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="memoria-notas-panel">
      <p className="memoria-notas-intro">
        Lista das notas pendentes de execução na Memória de massa. Importar notas roda a
        extração no SAP deste computador e traz a lista para a fila.
      </p>

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      <div className="memoria-notas-toolbar">
        <form className="memoria-notas-search" onSubmit={handleSearch}>
          <label>
            Buscar
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nota ou instalação"
            />
          </label>
          <button type="submit" className="secondary-button" disabled={loading}>
            Filtrar
          </button>
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
        <div className="entrada-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nota</th>
                <th>Instalação</th>
                <th>Incluída em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {notas.length ? (
                notas.map((nota) => (
                  <tr key={nota.id}>
                    <td>{nota.nota}</td>
                    <td>{nota.instalacao || '—'}</td>
                    <td>{formatDateTime(nota.createdAt)}</td>
                    <td>
                      <div className="memoria-notas-row-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={updatingId === nota.id}
                          onClick={() => void markExecutada(nota)}
                        >
                          Marcar executada
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={updatingId === nota.id}
                          onClick={() => void removeNota(nota)}
                        >
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    Nenhuma nota pendente de execução. Use &quot;Importar notas&quot; para
                    carregar a fila.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading ? (
        <p className="memoria-notas-count" role="status">
          {notas.length} nota(s) para executar
        </p>
      ) : null}
    </div>
  )
}
