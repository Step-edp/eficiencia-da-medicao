import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError, type CsdRecord, type FieldTeamUserOption } from './api'
import { CSD_CITY_OPTIONS } from './csdCities'

export function CsdsPanel() {
  const [csds, setCsds] = useState<CsdRecord[]>([])
  const [inspectors, setInspectors] = useState<FieldTeamUserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [selectedCities, setSelectedCities] = useState<string[]>([])
  const [responsibleUserId, setResponsibleUserId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ csds: rows }, { users }] = await Promise.all([
        api.listCsds(),
        api.listFieldTeamInspectionUsers(),
      ])
      setCsds(rows)
      setInspectors(users)
    } catch {
      setFeedback({
        type: 'error',
        message: 'Não foi possível carregar os CSDs.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const assignedCities = useMemo(() => {
    const map = new Map<string, string>()
    for (const csd of csds) {
      for (const city of csd.cities) {
        map.set(city, csd.name)
      }
    }
    return map
  }, [csds])

  const resetForm = () => {
    setName('')
    setAddress('')
    setSelectedCities([])
    setResponsibleUserId('')
  }

  const toggleCity = (city: string) => {
    if (assignedCities.has(city)) return

    setSelectedCities((current) =>
      current.includes(city)
        ? current.filter((item) => item !== city)
        : [...current, city].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (selectedCities.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Selecione ao menos uma cidade.',
      })
      return
    }

    setSubmitting(true)
    setFeedback(null)

    try {
      const { csd } = await api.createCsd({
        name: name.trim(),
        address: address.trim(),
        cities: selectedCities,
        responsibleUserId,
      })
      setCsds((prev) => [...prev, csd].sort((a, b) => a.name.localeCompare(b.name)))
      setFeedback({ type: 'success', message: `CSD "${csd.name}" cadastrado com sucesso.` })
      resetForm()
      setShowForm(false)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível cadastrar o CSD.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (csd: CsdRecord) => {
    setDeletingId(csd.id)
    setFeedback(null)

    try {
      await api.deleteCsd(csd.id)
      setCsds((prev) => prev.filter((item) => item.id !== csd.id))
      setFeedback({ type: 'success', message: `CSD "${csd.name}" excluído.` })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível excluir o CSD.',
      })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="csds-panel">
      <div className="csds-panel-header">
        <p className="csds-panel-intro">
          Cadastre e consulte os Centros de Serviço de Distribuição (CSDs) do laboratório.
        </p>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setShowForm((open) => !open)
            setFeedback(null)
          }}
        >
          {showForm ? 'Fechar formulário' : 'Adicionar CSD'}
        </button>
      </div>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      {showForm ? (
        <form className="form-grid csds-form-grid" onSubmit={(event) => void handleSubmit(event)}>
          <label className="full-width">
            Nome
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: CSD-006 - Região Metropolitana"
              required
            />
          </label>

          <label className="full-width">
            Endereço
            <input
              type="text"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Rua, número, bairro"
              required
            />
          </label>

          <fieldset className="csds-cities-fieldset full-width">
            <legend>Cidades</legend>
            <p className="csds-form-hint">
              Cidades já vinculadas a outro CSD ficam desabilitadas.
            </p>
            <div className="csds-cities-grid">
              {CSD_CITY_OPTIONS.map((city) => {
                const assignedTo = assignedCities.get(city)
                const isDisabled = Boolean(assignedTo)

                return (
                  <label
                    key={city}
                    className={`csds-city-option${isDisabled ? ' is-disabled' : ''}`}
                    title={
                      isDisabled ? `Já vinculada ao ${assignedTo}` : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={selectedCities.includes(city)}
                      disabled={isDisabled}
                      onChange={() => toggleCity(city)}
                    />
                    <span>{city}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <label className="full-width">
            Responsável
            <select
              value={responsibleUserId}
              onChange={(event) => setResponsibleUserId(event.target.value)}
              required
            >
              <option value="">Selecione um usuário CSD</option>
              {inspectors.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.registration})
                </option>
              ))}
            </select>
          </label>

          {inspectors.length === 0 ? (
            <p className="csds-form-hint full-width">
              Nenhum usuário com área CSD encontrado. Cadastre e aprove usuários da
              área CSD para vincular responsáveis.
            </p>
          ) : null}

          <button className="primary-button full-width" type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar CSD'}
          </button>
        </form>
      ) : null}

      <div className="table-wrap" aria-label="Lista de CSDs">
        <table className="data-table csds-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Endereço</th>
              <th>Cidades</th>
              <th>Responsável</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>Carregando CSDs...</td>
              </tr>
            ) : csds.length === 0 ? (
              <tr>
                <td colSpan={5}>Nenhum CSD cadastrado.</td>
              </tr>
            ) : (
              csds.map((csd) => (
                <tr key={csd.id}>
                  <td>{csd.name}</td>
                  <td>{csd.address}</td>
                  <td>{csd.cities.length > 0 ? csd.cities.join(', ') : '—'}</td>
                  <td>
                    {csd.responsibleName}
                    <span className="csds-responsible-registration">
                      {' '}
                      ({csd.responsibleRegistration})
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="csds-delete-button"
                      disabled={deletingId === csd.id}
                      onClick={() => void handleDelete(csd)}
                    >
                      {deletingId === csd.id ? 'Excluindo...' : 'Excluir'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
