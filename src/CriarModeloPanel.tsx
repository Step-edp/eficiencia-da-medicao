import { FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ApiError, type MeterModelRecord } from './api'
import { LoginFeedback } from './LoginFeedback'

const METER_TYPE_OPTIONS = ['Eletrônico', 'Eletromecânico']
const VOLTAGE_OPTIONS = ['240V', '120V', '240V • 120V', '230V']
const CURRENT_OPTIONS = [
  '1,5(6)A',
  '5(100)A',
  '10(100)A',
  '15(100)A',
  '30(100)A',
  '120A',
  '200A',
]
const WIRES_ELEMENTS_OPTIONS = ['2F', '3F', '2 elementos', '3 elementos']
const CLASS_OPTIONS = ['A', 'B', 'C', '0,2', '0,5', '1', '2']
const CONSTANT_OPTIONS = [
  '500',
  '1000',
  '1200',
  '2000',
  '2500',
  '3200',
  '4000',
  '5000',
  '6400',
  '8000',
  '10000',
]
const MANUFACTURER_OPTIONS = [
  'NANSEN',
  'ELETRA',
  'ELO',
  'LANDIS GYR',
  'SCHLUMBERGER',
  'CBM',
  'GE',
  'ELSTER',
  'ABB',
  'ITRON',
  'DOWERTECH',
  'SIEMENS',
  'INEPAR',
  'WESTINGHOUSE',
  'ECIL',
  'FAE',
  'ACTARIS',
  'APREL',
]

export function CriarModeloPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [models, setModels] = useState<MeterModelRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const [name, setName] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [meterType, setMeterType] = useState(METER_TYPE_OPTIONS[0])
  const [voltage, setVoltage] = useState('')
  const [current, setCurrent] = useState('')
  const [wiresElements, setWiresElements] = useState('')
  const [accuracyClass, setAccuracyClass] = useState('')
  const [constant, setConstant] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { models: rows } = await api.listMeterModels()
      setModels(rows)
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
    setVoltage('')
    setCurrent('')
    setWiresElements('')
    setAccuracyClass('')
    setConstant('')
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
        voltage: voltage.trim(),
        current: current.trim(),
        wiresElements: wiresElements.trim(),
        accuracyClass: accuracyClass.trim(),
        constant: constant.trim(),
      })
      setModels((currentRows) => [model, ...currentRows])
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
      <p className="entrada-panel-intro">
        Cadastre e consulte os modelos de medidores do laboratório, incluindo
        tensão, corrente, fios/elementos e classe.
      </p>

      {readOnly ? null : (
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
      )}

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={
            feedback.type === 'success' ? () => setFeedback(null) : undefined
          }
        />
      ) : null}

      {!readOnly && showForm ? (
        <form
          className="material-form-grid criar-modelo-form"
          onSubmit={(event) => void handleCreate(event)}
        >
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
            <select
              value={manufacturer}
              onChange={(event) => setManufacturer(event.target.value)}
              required
              disabled={creating}
            >
              <option value="">Selecione o fabricante</option>
              {MANUFACTURER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
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

          <fieldset className="radio-fieldset criar-modelo-voltage full-width">
            <legend>Tensão</legend>
            <div className="ratm-choice-group" role="radiogroup" aria-label="Tensão">
              {VOLTAGE_OPTIONS.map((option) => {
                const selected = voltage === option
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`ratm-choice-btn tone-neutral${selected ? ' is-selected' : ''}`}
                    disabled={creating}
                    onClick={() => setVoltage(option)}
                  >
                    <span>{option}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label>
            Corrente
            <select
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              disabled={creating}
            >
              <option value="">Localizar itens</option>
              {CURRENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Fios/Elem
            <select
              value={wiresElements}
              onChange={(event) => setWiresElements(event.target.value)}
              disabled={creating}
            >
              <option value="">Localizar itens</option>
              {WIRES_ELEMENTS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Classe
            <select
              value={accuracyClass}
              onChange={(event) => setAccuracyClass(event.target.value)}
              disabled={creating}
            >
              <option value="">Localizar itens</option>
              {CLASS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Constante
            <select
              value={constant}
              onChange={(event) => setConstant(event.target.value)}
              disabled={creating}
            >
              <option value="">Localizar itens</option>
              {CONSTANT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
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
                <th>Tensão</th>
                <th>Corrente</th>
                <th>Fios/Elem</th>
                <th>Classe</th>
                <th>Constante</th>
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
                    <td>{model.voltage || '—'}</td>
                    <td>{model.current || '—'}</td>
                    <td>{model.wiresElements || '—'}</td>
                    <td>{model.accuracyClass || '—'}</td>
                    <td>{model.constant || '—'}</td>
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
                  <td colSpan={10}>Nenhum modelo de medidor cadastrado ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
