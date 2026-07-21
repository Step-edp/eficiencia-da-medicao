import { FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ApiError, type MeterModelRecord } from './api'

const METER_TYPE_OPTIONS = ['Monofásico', 'Bifásico', 'Trifásico', 'Outro']

export function CriarModeloPanel() {
  const [models, setModels] = useState<MeterModelRecord[]>([])
  const [manufacturers, setManufacturers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const [name, setName] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [meterType, setMeterType] = useState(METER_TYPE_OPTIONS[0])
  const [description, setDescription] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ models: rows }, manufacturersResponse] = await Promise.all([
        api.listMeterModels(),
        api.listManufacturers().catch(() => ({ manufacturers: [] as string[] })),
      ])
      setModels(rows)
      setManufacturers(manufacturersResponse.manufacturers ?? [])
    } catch (error) {
      setModels([])
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os modelos de medidores.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const resetForm = () => {
    setName('')
    setManufacturer('')
    setMeterType(METER_TYPE_OPTIONS[0])
    setDescription('')
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !manufacturer.trim() || !meterType.trim()) {
      setFeedback({
        type: 'error',
        message: 'Informe modelo, fabricante e tipo do medidor.',
      })
      return
    }

    setCreating(true)
    setFeedback(null)
    try {
      const { model } = await api.createMeterModel({
        name: name.trim(),
        manufacturer: manufacturer.trim(),
        meterType: meterType.trim(),
        description: description.trim(),
      })
      setModels((current) => [model, ...current])
      resetForm()
      setShowForm(false)
      setFeedback({
        type: 'success',
        message: `Modelo "${model.name}" cadastrado com sucesso.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível cadastrar o modelo.',
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="criar-modelo-panel">
      <div className="area-actions right-aligned-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setShowForm((current) => !current)
            setFeedback(null)
          }}
        >
          {showForm ? 'Fechar formulário' : 'Criar modelo'}
        </button>
      </div>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      {showForm ? (
        <form className="material-form-grid criar-modelo-form" onSubmit={(event) => void handleCreate(event)}>
          <label>
            Modelo
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome do modelo"
              required
              disabled={creating}
            />
          </label>
          <label>
            Fabricante
            <input
              type="text"
              list="criar-modelo-manufacturers"
              value={manufacturer}
              onChange={(event) => setManufacturer(event.target.value)}
              placeholder="Fabricante"
              required
              disabled={creating}
            />
            <datalist id="criar-modelo-manufacturers">
              {manufacturers.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>
          <label>
            Tipo
            <select
              value={meterType}
              onChange={(event) => setMeterType(event.target.value)}
              disabled={creating}
            >
              {METER_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="full-width">
            Descrição
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Detalhes do modelo (opcional)"
              disabled={creating}
            />
          </label>
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
            <button type="submit" className="primary-button" disabled={creating}>
              {creating ? 'Salvando…' : 'Salvar modelo'}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">Carregando modelos...</p>
      ) : (
        <div className="entrada-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Fabricante</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Criado por</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {models.length ? (
                models.map((model) => (
                  <tr key={model.id}>
                    <td>{model.name}</td>
                    <td>{model.manufacturer}</td>
                    <td>{model.meterType}</td>
                    <td>{model.description || '—'}</td>
                    <td>
                      {model.createdByName || model.createdByRegistration
                        ? `${model.createdByName || '—'}${
                            model.createdByRegistration
                              ? ` (${model.createdByRegistration})`
                              : ''
                          }`
                        : '—'}
                    </td>
                    <td>{new Date(model.createdAt).toLocaleString('pt-BR')}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>Nenhum modelo de medidor cadastrado ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
