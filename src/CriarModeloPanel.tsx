import { FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ApiError, type MeterModelRecord, type PasswordRecord } from './api'
import { LoginFeedback } from './LoginFeedback'
import { PassivoPanel } from './PassivoPanel'

const METER_TYPE_OPTIONS = ['Eletrônico', 'Eletromecânico']
const VOLTAGE_OPTIONS = ['240V', '120V', '240V • 120V', '230V']
const CURRENT_OPTIONS = [
  'Min. 15A • Máx. 100A',
  'Min. 15A • Máx. 120A',
  'Min. 2,5A • Máx. 10A',
  'Min. 30A • Máx. 200A',
  'Min. 2,5A • Máx. 20A',
  '15A',
]
const WIRES_ELEMENTS_OPTIONS = [
  '2 FIOS 1 ELEMENTO',
  '3 FIOS 1 ELEMENTO',
  '3 FIOS 2 ELEMENTOS',
  '4 FIOS 3 ELEMENTOS',
  '4 FIOS 2 ELEMENTOS',
  '3 FIOS 3 ELEMENTOS',
]
const CLASS_OPTIONS = [
  'CLASSE 1',
  'CLASSE 2',
  'CLASSE A',
  'CLASSE B',
  'CLASSE C',
  'CLASSE D',
]
const CONSTANT_OPTIONS = [
  '1,8',
  '3,6',
  '4,0',
  '4,8',
  '7,2',
  '10,8',
  '14,4',
  '2,4',
  '21,6',
  '0,3',
  '0,6',
  '1',
  '1,25',
  '0,3125',
  '6,25',
  '2',
  '10',
  '6',
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

export function CriarModeloPanel({
  readOnly = false,
  isAdmin = false,
  manufacturers = [],
  materialTypeOptions = [],
  onAddManufacturer,
  onPassivoCreated,
}: {
  readOnly?: boolean
  isAdmin?: boolean
  manufacturers?: string[]
  materialTypeOptions?: string[]
  onAddManufacturer?: () => void
  onPassivoCreated?: (records: PasswordRecord[]) => void
}) {
  const [models, setModels] = useState<MeterModelRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showPassivo, setShowPassivo] = useState(false)
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

      <div className="area-actions right-aligned-actions criar-modelo-actions">
        {isAdmin ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setShowPassivo((current) => !current)
              setShowForm(false)
              setFeedback(null)
            }}
          >
            {showPassivo ? 'Fechar passivo' : 'Adicionar passivo'}
          </button>
        ) : null}
        {readOnly ? null : (
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setShowForm((current) => !current)
              setShowPassivo(false)
              setFeedback(null)
            }}
          >
            {showForm ? 'Fechar formulário' : 'Criar modelo'}
          </button>
        )}
      </div>

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={
            feedback.type === 'success' ? () => setFeedback(null) : undefined
          }
        />
      ) : null}

      {isAdmin && showPassivo ? (
        <PassivoPanel
          manufacturers={manufacturers}
          materialTypeOptions={materialTypeOptions}
          onAddManufacturer={() => onAddManufacturer?.()}
          onCreated={(records) => {
            onPassivoCreated?.(records)
            setFeedback({
              type: 'success',
              message:
                records.length === 1
                  ? 'Senha passiva cadastrada com sucesso.'
                  : `${records.length} senhas passivas cadastradas com sucesso.`,
            })
          }}
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
          <fieldset className="radio-fieldset criar-modelo-voltage full-width">
            <legend>Tipo</legend>
            <div className="ratm-choice-group" role="radiogroup" aria-label="Tipo">
              {METER_TYPE_OPTIONS.map((option) => {
                const selected = meterType === option
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`ratm-choice-btn tone-neutral${selected ? ' is-selected' : ''}`}
                    disabled={creating}
                    onClick={() => setMeterType(option)}
                  >
                    <span>{option}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>

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
            Fios • Elementos
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
                <th>Fios • Elementos</th>
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
