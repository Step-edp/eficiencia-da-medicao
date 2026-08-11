import { FormEvent, useCallback, useEffect, useState } from 'react'
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

export function AnalisadoresTensaoPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [analisadores, setAnalisadores] = useState<AnalisadorTensaoRecord[]>([])
  const [modelos, setModelos] = useState<AnalisadorModeloCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [numeroSerie, setNumeroSerie] = useState('')
  const [identificacaoLaudo, setIdentificacaoLaudo] = useState('')
  const [modelo, setModelo] = useState('')
  const [dataUltimaCalibracao, setDataUltimaCalibracao] = useState('')
  const [primeiraCalibracao, setPrimeiraCalibracao] = useState(false)
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
    setIdentificacaoLaudo('')
    setModelo('')
    setDataUltimaCalibracao('')
    setPrimeiraCalibracao(false)
  }

  const selectedModelo = modelos.find((entry) => entry.modelo === modelo) ?? null

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

    setCreating(true)
    setFeedback(null)
    try {
      const { analisador } = await api.createAnalisadorTensao({
        numeroSerie: numeroSerie.trim(),
        identificacaoLaudo: identificacaoLaudo.trim(),
        modelo: modelo.trim(),
        primeiraCalibracao,
        dataUltimaCalibracao: primeiraCalibracao ? undefined : dataUltimaCalibracao,
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
                (!primeiraCalibracao && !dataUltimaCalibracao)
              }
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
                <th>Identificação do laudo</th>
                <th>Modelo</th>
                <th>Fabricante</th>
                <th>Classe</th>
                <th>VN</th>
                <th>Vmáx</th>
                <th>Instrumento</th>
                <th>Última calibração</th>
                <th>Cadastrado por</th>
                <th>Em</th>
              </tr>
            </thead>
            <tbody>
              {analisadores.map((item) => (
                <tr key={item.id}>
                  <td>{item.equipmentNumber}</td>
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
