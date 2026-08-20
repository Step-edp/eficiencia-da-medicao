import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError, type CsdRecord, type FieldTeamUserOption } from './api'
import { CSD_CITY_OPTIONS } from './csdCities'
import { LoginFeedback } from './LoginFeedback'

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20zM14.5 5l4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CsdsPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [csds, setCsds] = useState<CsdRecord[]>([])
  const [inspectors, setInspectors] = useState<FieldTeamUserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [selectedCities, setSelectedCities] = useState<string[]>([])
  const [responsibleUserId, setResponsibleUserId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingCsd, setEditingCsd] = useState<CsdRecord | null>(null)
  const [editCities, setEditCities] = useState<string[]>([])
  const [editResponsibleUserId, setEditResponsibleUserId] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
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
    const map = new Map<string, { csdId: string; csdName: string }>()
    for (const csd of csds) {
      for (const city of csd.cities) {
        map.set(city, { csdId: csd.id, csdName: csd.name })
      }
    }
    return map
  }, [csds])

  const pendingCount = useMemo(
    () => csds.filter((csd) => csd.status === 'pendente' || !csd.responsibleUserId).length,
    [csds],
  )

  const resetForm = () => {
    setName('')
    setAddress('')
    setSelectedCities([])
    setResponsibleUserId('')
  }

  const openEdit = (csd: CsdRecord) => {
    setEditingCsd(csd)
    setEditCities([...csd.cities])
    setEditResponsibleUserId(csd.responsibleUserId ?? '')
    setFeedback(null)
    setShowForm(false)
  }

  const closeEdit = () => {
    if (savingEdit) return
    setEditingCsd(null)
    setEditCities([])
    setEditResponsibleUserId('')
  }

  const responsibleOptionsFor = (csd: CsdRecord): FieldTeamUserOption[] => {
    if (
      csd.responsibleUserId &&
      !inspectors.some((user) => user.id === csd.responsibleUserId)
    ) {
      return [
        {
          id: csd.responsibleUserId,
          name: csd.responsibleName?.trim() || 'Responsável atual',
          registration: csd.responsibleRegistration ?? '',
        },
        ...inspectors,
      ]
    }
    return inspectors
  }

  const toggleCreateCity = (city: string) => {
    if (assignedCities.has(city)) return

    setSelectedCities((current) =>
      current.includes(city)
        ? current.filter((item) => item !== city)
        : [...current, city].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    )
  }

  const toggleEditCity = (city: string) => {
    if (!editingCsd) return

    const owner = assignedCities.get(city)
    if (owner && owner.csdId !== editingCsd.id) return

    setEditCities((current) =>
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
        responsibleUserId: responsibleUserId || null,
      })
      setCsds((prev) => [...prev, csd].sort((a, b) => a.name.localeCompare(b.name)))
      setFeedback({
        type: 'success',
        message: csd.responsibleUserId
          ? `CSD "${csd.name}" cadastrado com sucesso.`
          : `CSD "${csd.name}" cadastrado como pendente (sem responsável).`,
      })
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

  const handleSaveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingCsd) return

    if (editCities.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Selecione ao menos uma cidade.',
      })
      return
    }

    setSavingEdit(true)
    setFeedback(null)

    try {
      const { csd: updated } = await api.updateCsd(editingCsd.id, {
        cities: editCities,
        responsibleUserId: editResponsibleUserId || null,
      })
      setCsds((prev) =>
        prev
          .map((item) => (item.id === updated.id ? updated : item))
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
      setFeedback({
        type: 'success',
        message: `CSD "${updated.name}" atualizado.`,
      })
      setEditingCsd(null)
      setEditCities([])
      setEditResponsibleUserId('')
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível atualizar o CSD.',
      })
    } finally {
      setSavingEdit(false)
    }
  }

  const handleAssignResponsible = async (csd: CsdRecord, nextUserId: string) => {
    const nextId = nextUserId.trim() || null
    if (nextId === (csd.responsibleUserId ?? null)) return

    setUpdatingId(csd.id)
    setFeedback(null)

    try {
      const { csd: updated } = await api.updateCsd(csd.id, {
        responsibleUserId: nextId,
      })
      setCsds((prev) =>
        prev
          .map((item) => (item.id === updated.id ? updated : item))
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
      setFeedback({
        type: 'success',
        message: nextId
          ? `Responsável do CSD "${updated.name}" atualizado.`
          : `Responsável do CSD "${updated.name}" removido. O CSD ficou pendente.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível atualizar o responsável.',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  const handleDelete = async (csd: CsdRecord) => {
    setDeletingId(csd.id)
    setFeedback(null)

    try {
      await api.deleteCsd(csd.id)
      setCsds((prev) => prev.filter((item) => item.id !== csd.id))
      if (editingCsd?.id === csd.id) {
        setEditingCsd(null)
        setEditCities([])
        setEditResponsibleUserId('')
      }
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

  const renderCitiesGrid = (
    checkedCities: string[],
    onToggle: (city: string) => void,
    options?: { allowOwnedByCsdId?: string },
  ) => (
    <div className="csds-cities-grid">
      {CSD_CITY_OPTIONS.map((city) => {
        const assignedTo = assignedCities.get(city)
        const ownedByEditor =
          Boolean(options?.allowOwnedByCsdId) &&
          assignedTo?.csdId === options?.allowOwnedByCsdId
        const isDisabled = Boolean(assignedTo) && !ownedByEditor

        return (
          <label
            key={city}
            className={`csds-city-option${isDisabled ? ' is-disabled' : ''}`}
            title={
              isDisabled
                ? `Já vinculada ao ${assignedTo?.csdName}. Não pode ser atribuída.`
                : undefined
            }
          >
            <input
              type="checkbox"
              checked={checkedCities.includes(city)}
              disabled={isDisabled}
              onChange={() => onToggle(city)}
            />
            <span>
              {city}
              {isDisabled ? (
                <span className="csds-city-owner"> · {assignedTo?.csdName}</span>
              ) : null}
            </span>
          </label>
        )
      })}
    </div>
  )

  return (
    <div className="csds-panel">
      <div className="csds-panel-header">
        <p className="csds-panel-intro">
          Cadastre e consulte os Centros de Serviço de Distribuição (CSDs) do laboratório.
          {pendingCount > 0 ? (
            <>
              {' '}
              <span className="csds-pending-summary">
                {pendingCount} pendente{pendingCount > 1 ? 's' : ''} sem responsável.
              </span>
            </>
          ) : null}
        </p>
        {readOnly ? null : (
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setShowForm((open) => !open)
              setEditingCsd(null)
              setEditCities([])
              setEditResponsibleUserId('')
              setFeedback(null)
            }}
          >
            {showForm ? 'Fechar formulário' : 'Adicionar CSD'}
          </button>
        )}
      </div>

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      {!readOnly && showForm ? (
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
              Cidades já vinculadas a outro CSD não podem ser atribuídas e aparecem
              desabilitadas.
            </p>
            {renderCitiesGrid(selectedCities, toggleCreateCity)}
          </fieldset>

          <label className="full-width">
            Responsável
            <select
              value={responsibleUserId}
              onChange={(event) => setResponsibleUserId(event.target.value)}
            >
              <option value="">Sem responsável — pendente</option>
              {inspectors.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.registration})
                </option>
              ))}
            </select>
          </label>

          <p className="csds-form-hint full-width">
            Opcional. Sem responsável, o CSD fica pendente e pode ser definido depois.
          </p>

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

      {!readOnly && editingCsd ? (
        <div
          className="ensaios-block-modal-overlay"
          role="presentation"
          onClick={closeEdit}
        >
          <div
            className="ensaios-block-modal csds-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="csds-edit-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="icon-button schedule-slot-modal-close"
              onClick={closeEdit}
              aria-label="Fechar"
              title="Fechar"
              disabled={savingEdit}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <h3 id="csds-edit-title">Editar CSD</h3>
            <p className="csds-form-hint">
              {editingCsd.name}. Altere o responsável e as cidades. Cidades já
              vinculadas a outro CSD não podem ser atribuídas.
            </p>

            <form
              className="form-grid csds-edit-form"
              onSubmit={(event) => void handleSaveEdit(event)}
            >
              <label className="full-width">
                Responsável
                <select
                  value={editResponsibleUserId}
                  onChange={(event) => setEditResponsibleUserId(event.target.value)}
                  disabled={savingEdit}
                >
                  <option value="">Sem responsável — pendente</option>
                  {responsibleOptionsFor(editingCsd).map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                      {user.registration ? ` (${user.registration})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="csds-cities-fieldset">
                <legend>Cidades</legend>
                {renderCitiesGrid(editCities, toggleEditCity, {
                  allowOwnedByCsdId: editingCsd.id,
                })}
              </fieldset>

              <div className="csds-edit-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeEdit}
                  disabled={savingEdit}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
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
              csds.map((csd) => {
                const isPending = csd.status === 'pendente' || !csd.responsibleUserId

                return (
                  <tr key={csd.id} className={isPending ? 'csds-row-pending' : undefined}>
                    <td>
                      {csd.name}
                      {isPending ? (
                        <span className="gestao-cell-status-badge is-pendente csds-status-badge">
                          Pendente
                        </span>
                      ) : null}
                    </td>
                    <td>{csd.address}</td>
                    <td>{csd.cities.length > 0 ? csd.cities.join(', ') : '—'}</td>
                    <td>
                      {readOnly ? (
                        csd.responsibleName ? (
                          <>
                            {csd.responsibleName}
                            <span className="csds-responsible-registration">
                              {' '}
                              ({csd.responsibleRegistration})
                            </span>
                          </>
                        ) : (
                          '—'
                        )
                      ) : (
                        <select
                          className="csds-assign-select"
                          value={csd.responsibleUserId ?? ''}
                          disabled={
                            updatingId === csd.id ||
                            (inspectors.length === 0 && !csd.responsibleUserId)
                          }
                          onChange={(event) =>
                            void handleAssignResponsible(csd, event.target.value)
                          }
                          aria-label={`Trocar responsável do ${csd.name}`}
                        >
                          <option value="">
                            {updatingId === csd.id
                              ? 'Salvando...'
                              : isPending
                                ? 'Definir responsável...'
                                : 'Sem responsável — pendente'}
                          </option>
                          {responsibleOptionsFor(csd).map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.name}
                              {user.registration ? ` (${user.registration})` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {readOnly ? (
                        '—'
                      ) : (
                      <div className="csds-table-actions">
                        <button
                          type="button"
                          className="csds-icon-button"
                          aria-label={`Editar ${csd.name}`}
                          title="Editar CSD"
                          onClick={() => openEdit(csd)}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className="csds-icon-button is-danger"
                          disabled={deletingId === csd.id}
                          aria-label={
                            deletingId === csd.id
                              ? `Excluindo ${csd.name}`
                              : `Excluir ${csd.name}`
                          }
                          title={deletingId === csd.id ? 'Excluindo…' : 'Excluir'}
                          onClick={() => void handleDelete(csd)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
