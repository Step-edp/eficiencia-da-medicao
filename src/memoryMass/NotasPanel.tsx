import { FormEvent, useCallback, useEffect, useState } from 'react'
import {
  api,
  ApiError,
  type MemoriaMassaNotaRecord,
} from '../api'
import { LoginFeedback } from '../LoginFeedback'

type ParsedNota = {
  nota: string
  instalacao: string
  cliente: string
  observacao: string
}

function parseNotasPaste(text: string): ParsedNota[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const rows: ParsedNota[] = []
  for (const line of lines) {
    const cells = line.includes('\t') ? line.split('\t') : line.split(';')
    const cleaned = cells.map((cell) => cell.replace(/\u00a0/g, ' ').trim())

    // Ignora cabeçalho comum.
    const first = (cleaned[0] ?? '').toLowerCase()
    if (first === 'nota' || first === 'nº' || first === 'numero' || first === 'número') {
      continue
    }

    const nota = (cleaned[0] ?? '').replace(/\D/g, '')
    if (!nota) continue

    rows.push({
      nota,
      instalacao: (cleaned[1] ?? '').replace(/\D/g, ''),
      cliente: cleaned[2] ?? '',
      observacao: cleaned[3] ?? '',
    })
  }

  return rows
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('pt-BR')
}

export function NotasPanel() {
  const [notas, setNotas] = useState<MemoriaMassaNotaRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [showImport, setShowImport] = useState(false)
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

  const handleSearch = (event: FormEvent) => {
    event.preventDefault()
    void load(search)
  }

  const handleImport = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseNotasPaste(pasteText)
    if (!parsed.length) {
      setFeedback({
        type: 'error',
        message:
          'Cole ao menos uma nota. Formato: Nota (obrigatório), Instalação, Cliente, Observação — separados por tab ou ponto e vírgula.',
      })
      return
    }

    setImporting(true)
    setFeedback(null)
    try {
      const response = await api.createMemoriaMassaNotasBulk(parsed)
      setPasteText('')
      setShowImport(false)
      const skipMsg = response.skippedDuplicates.length
        ? ` ${response.skippedDuplicates.length} já estavam pendentes.`
        : ''
      setFeedback({
        type: 'success',
        message: `${response.inserted} nota(s) adicionada(s) para execução.${skipMsg}`,
      })
      await load(search)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível importar as notas.',
      })
    } finally {
      setImporting(false)
    }
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
        Lista das notas pendentes de execução na Memória de massa. Importe a lista do SAP
        (colar) para alimentar a fila.
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
              placeholder="Nota, instalação ou cliente"
            />
          </label>
          <button type="submit" className="secondary-button" disabled={loading}>
            Filtrar
          </button>
        </form>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setShowImport((current) => !current)
            setFeedback(null)
          }}
        >
          {showImport ? 'Fechar importação' : 'Importar notas'}
        </button>
      </div>

      {showImport ? (
        <form className="memoria-notas-import" onSubmit={(event) => void handleImport(event)}>
          <label>
            Colar notas (uma por linha)
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              rows={8}
              placeholder={'Nota\tInstalação\tCliente\tObservação\n123456789\t987654321\tCliente Exemplo'}
              spellCheck={false}
              disabled={importing}
            />
          </label>
          <p className="field-hint">
            Colunas: Nota (obrigatória), Instalação, Cliente, Observação. Aceita tab ou
            ponto e vírgula.
          </p>
          <div className="agenda-form-actions">
            <button type="submit" className="primary-button" disabled={importing || !pasteText.trim()}>
              {importing ? 'Importando…' : 'Adicionar à fila'}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">Carregando notas pendentes...</p>
      ) : (
        <div className="entrada-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nota</th>
                <th>Instalação</th>
                <th>Cliente</th>
                <th>Observação</th>
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
                    <td>{nota.cliente || '—'}</td>
                    <td>{nota.observacao || '—'}</td>
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
                  <td colSpan={6}>
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
