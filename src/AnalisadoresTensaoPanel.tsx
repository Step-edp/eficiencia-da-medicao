import { FormEvent, useCallback, useEffect, useState } from 'react'
import {
  api,
  ApiError,
  type AnalisadorModeloCatalogEntry,
  type AnalisadorTensaoRecord,
} from './api'
import { formatAuditDate } from './auditLabels'
import { LoginFeedback } from './LoginFeedback'

export function AnalisadoresTensaoPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [analisadores, setAnalisadores] = useState<AnalisadorTensaoRecord[]>([])
  const [modelos, setModelos] = useState<AnalisadorModeloCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [numeroSerie, setNumeroSerie] = useState('')
  const [modelo, setModelo] = useState('')
  const [creating, setCreating] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

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
    setModelo('')
  }

  const selectedModelo = modelos.find((entry) => entry.modelo === modelo) ?? null

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()

    if (!numeroSerie.trim() || !modelo.trim()) {
      setFeedback({ type: 'error', message: 'Informe número de série e modelo.' })
      return
    }

    setCreating(true)
    setFeedback(null)
    try {
      const { analisador } = await api.createAnalisadorTensao({
        numeroSerie: numeroSerie.trim(),
        modelo: modelo.trim(),
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

  return (
    <div className="analisadores-tensao-panel">
      {readOnly ? null : (
        <div className="area-actions right-aligned-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setShowForm((current) => !current)
              setFeedback(null)
              resetForm()
            }}
          >
            {showForm ? 'Fechar formulário' : 'Cadastrar analisador'}
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

          {selectedModelo ? (
            <>
              <label>
                Fabricante
                <input type="text" value={selectedModelo.fabricante} disabled readOnly />
              </label>
              <label>
                Classe
                <input type="text" value={selectedModelo.classe} disabled readOnly />
              </label>
              <label>
                VN
                <input type="text" value={selectedModelo.vn} disabled readOnly />
              </label>
              <label>
                Vmáx
                <input type="text" value={selectedModelo.vmax} disabled readOnly />
              </label>
              <label className="full-width">
                Instrumento
                <input type="text" value={selectedModelo.instrumento} disabled readOnly />
              </label>
            </>
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
              disabled={creating || !numeroSerie.trim() || !modelo.trim()}
            >
              {creating ? 'Salvando…' : 'Salvar analisador'}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">Carregando analisadores...</p>
      ) : analisadores.length ? (
        <div className="entrada-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Número de série</th>
                <th>Modelo</th>
                <th>Fabricante</th>
                <th>Classe</th>
                <th>VN</th>
                <th>Vmáx</th>
                <th>Instrumento</th>
                <th>Cadastrado por</th>
                <th>Em</th>
              </tr>
            </thead>
            <tbody>
              {analisadores.map((item) => (
                <tr key={item.id}>
                  <td>{item.equipmentNumber}</td>
                  <td>{item.numeroSerie}</td>
                  <td>{item.modelo}</td>
                  <td>{item.fabricante}</td>
                  <td>{item.classe}</td>
                  <td>{item.vn}</td>
                  <td>{item.vmax}</td>
                  <td>{item.instrumento}</td>
                  <td>{item.createdByName || item.createdByRegistration || '—'}</td>
                  <td>{formatAuditDate(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="entrada-panel-empty">Nenhum analisador cadastrado.</p>
      )}
    </div>
  )
}
