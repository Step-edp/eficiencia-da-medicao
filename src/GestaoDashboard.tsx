import { FormEvent, useState } from 'react'
import type { AppUser } from './api'
import {
  getGestaoDashboardStats,
  leadershipPendingReason,
  type OrgAreaLeadership,
  type OrgCell,
} from './orgStructure'

type LeadershipPayload = {
  responsibleUserId: string | null
  substituteUserId: string | null
}

type AreaUpdatePayload = LeadershipPayload & {
  label: string
}

function UserOptions({
  users,
  excludeId,
}: {
  users: AppUser[]
  excludeId?: string
}) {
  return (
    <>
      {users
        .filter((user) => user.id !== excludeId)
        .map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({user.registration})
          </option>
        ))}
    </>
  )
}

type GestaoDashboardProps = {
  area: OrgAreaLeadership
  cells: OrgCell[]
  candidateUsers: AppUser[]
  canManage: boolean
  busy?: boolean
  error?: string | null
  /** Aba ativa na home Gestão Operacional: dashboard ou gestão de células. */
  view?: 'dash' | 'celulas'
  onCreateCell: (
    payload: LeadershipPayload & { label: string; description: string },
  ) => Promise<void>
}

type CreateOrgAreaFormProps = {
  candidateUsers: AppUser[]
  busy?: boolean
  error?: string | null
  onCreate: (
    payload: LeadershipPayload & { label: string; description: string },
  ) => Promise<void>
}

/** Formulário exclusivo do administrador para criar nova gestão operacional. */
export function CreateOrgAreaForm({
  candidateUsers,
  busy = false,
  error = null,
  onCreate,
}: CreateOrgAreaFormProps) {
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [responsibleUserId, setResponsibleUserId] = useState('')
  const [substituteUserId, setSubstituteUserId] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const resetForm = () => {
    setLabel('')
    setDescription('')
    setResponsibleUserId('')
    setSubstituteUserId('')
    setLocalError(null)
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    setLocalError(null)
    const trimmed = label.trim()
    if (!trimmed) {
      setLocalError('Informe o nome da gestão operacional.')
      return
    }
    if (responsibleUserId && substituteUserId && responsibleUserId === substituteUserId) {
      setLocalError('O substituto deve ser diferente do responsável.')
      return
    }
    try {
      await onCreate({
        label: trimmed,
        description: description.trim(),
        responsibleUserId: responsibleUserId || null,
        substituteUserId: responsibleUserId ? substituteUserId || null : null,
      })
      resetForm()
      setShowForm(false)
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Não foi possível criar a gestão operacional.',
      )
    }
  }

  return (
    <div className="users-dashboard-card gestao-create-cell">
      {!showForm ? (
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => {
            setLocalError(null)
            setShowForm(true)
          }}
        >
          Nova gestão operacional
        </button>
      ) : (
        <>
          <h3>Nova gestão operacional</h3>
          <p className="users-dashboard-ranking-hint">
            Informe um nome único para a gestão. Ela precisa de 1 responsável e 1
            substituto; sem qualquer um dos dois, a área fica pendente. Células ficam
            vinculadas a esta área.
          </p>
          <form className="gestao-create-cell-form" onSubmit={handleCreate}>
            <label>
              Nome
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Ex.: Gestão Operacional Norte"
                maxLength={80}
                disabled={busy}
                required
              />
            </label>
            <label>
              Descrição (opcional)
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Resumo da área"
                disabled={busy}
              />
            </label>
            <label>
              Responsável (opcional)
              <select
                value={responsibleUserId}
                onChange={(event) => {
                  const next = event.target.value
                  setResponsibleUserId(next)
                  if (!next || next === substituteUserId) {
                    setSubstituteUserId('')
                  }
                }}
                disabled={busy}
              >
                <option value="">Sem responsável — pendente</option>
                <UserOptions users={candidateUsers} />
              </select>
            </label>
            <label>
              Substituto (opcional)
              <select
                value={substituteUserId}
                onChange={(event) => setSubstituteUserId(event.target.value)}
                disabled={busy || !responsibleUserId}
              >
                <option value="">Sem substituto — pendente</option>
                <UserOptions users={candidateUsers} excludeId={responsibleUserId || undefined} />
              </select>
            </label>
            {(localError || error) && (
              <p className="gestao-create-cell-error" role="alert">
                {localError || error}
              </p>
            )}
            <div className="gestao-create-cell-actions">
              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? 'Criando…' : 'Criar gestão operacional'}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  resetForm()
                  setShowForm(false)
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}

export function GestaoDashboard({
  area,
  cells,
  candidateUsers,
  canManage,
  busy = false,
  error = null,
  view = 'dash',
  onCreateCell,
}: GestaoDashboardProps) {
  const stats = getGestaoDashboardStats(cells)
  const maxProcesses = Math.max(
    ...stats.processesBySubcell.map((item) => item.processCount),
    1,
  )

  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [responsibleUserId, setResponsibleUserId] = useState('')
  const [substituteUserId, setSubstituteUserId] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const resetCreateForm = () => {
    setLabel('')
    setDescription('')
    setResponsibleUserId('')
    setSubstituteUserId('')
    setLocalError(null)
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    setLocalError(null)
    const trimmed = label.trim()
    if (!trimmed) {
      setLocalError('Informe o nome da célula.')
      return
    }
    if (responsibleUserId && substituteUserId && responsibleUserId === substituteUserId) {
      setLocalError('O substituto deve ser diferente do responsável.')
      return
    }
    try {
      await onCreateCell({
        label: trimmed,
        description: description.trim(),
        responsibleUserId: responsibleUserId || null,
        substituteUserId: responsibleUserId ? substituteUserId || null : null,
      })
      resetCreateForm()
      setShowCreateForm(false)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Não foi possível criar a célula.')
    }
  }

  if (view === 'celulas') {
    if (!canManage) return null
    return (
      <div className="gestao-dashboard" aria-label="Gestão de células">
        <div className="users-dashboard-card gestao-create-cell">
          {!showCreateForm ? (
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => {
                setLocalError(null)
                setShowCreateForm(true)
              }}
            >
              Nova célula
            </button>
          ) : (
            <>
              <h3>Nova célula</h3>
              <p className="users-dashboard-ranking-hint">
                Cada célula precisa de 1 responsável e 1 substituto. Sem qualquer um
                dos dois, a célula fica pendente e as subcélulas ficam bloqueadas.
              </p>
              <form className="gestao-create-cell-form" onSubmit={handleCreate}>
                <label>
                  Nome da célula
                  <input
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Ex.: Qualidade da Medição"
                    maxLength={80}
                    disabled={busy}
                    required
                  />
                </label>
                <label>
                  Descrição (opcional)
                  <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Resumo da célula"
                    disabled={busy}
                  />
                </label>
                <label>
                  Responsável (opcional)
                  <select
                    value={responsibleUserId}
                    onChange={(event) => {
                      const next = event.target.value
                      setResponsibleUserId(next)
                      if (!next || next === substituteUserId) {
                        setSubstituteUserId('')
                      }
                    }}
                    disabled={busy}
                  >
                    <option value="">Sem responsável — pendente</option>
                    <UserOptions users={candidateUsers} />
                  </select>
                </label>
                <label>
                  Substituto (opcional)
                  <select
                    value={substituteUserId}
                    onChange={(event) => setSubstituteUserId(event.target.value)}
                    disabled={busy || !responsibleUserId}
                  >
                    <option value="">Sem substituto — pendente</option>
                    <UserOptions users={candidateUsers} excludeId={responsibleUserId || undefined} />
                  </select>
                </label>
                {(localError || error) && (
                  <p className="gestao-create-cell-error" role="alert">
                    {localError || error}
                  </p>
                )}
                <div className="gestao-create-cell-actions">
                  <button type="submit" className="primary-button" disabled={busy}>
                    {busy ? 'Criando…' : 'Criar célula'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      resetCreateForm()
                      setShowCreateForm(false)
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="gestao-dashboard" aria-label="Dashboard gerencial">
      <div className="users-dashboard-kpis gestao-dashboard-kpis">
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Células</p>
          <p className="users-dashboard-kpi-value">{stats.cellCount}</p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Pendentes</p>
          <p className="users-dashboard-kpi-value">{stats.pendingCellCount}</p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Subcélulas</p>
          <p className="users-dashboard-kpi-value">{stats.subcellCount}</p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Processos</p>
          <p className="users-dashboard-kpi-value">{stats.processCount}</p>
        </article>
      </div>

      <div className="users-dashboard-card gestao-dashboard-breakdown">
        <h3>Processos por subcélula</h3>
        <p className="users-dashboard-ranking-hint">
          Distribuição dos processos da área {area.label} em cada subcélula.
        </p>
        {stats.processesBySubcell.length ? (
          <ul className="users-dashboard-bars" aria-label="Processos por subcélula">
            {stats.processesBySubcell.map((item) => {
              const percent = Math.round((item.processCount / maxProcesses) * 100)
              return (
                <li key={`${item.cellId}:${item.subcellId}`}>
                  <div className="users-dashboard-bar-meta">
                    <span>
                      <strong>{item.subcellLabel}</strong>
                      <span className="gestao-dashboard-cell-tag"> · {item.cellLabel}</span>
                    </span>
                    <strong>
                      {item.processCount}{' '}
                      <span>
                        {item.processCount === 1 ? 'processo' : 'processos'}
                      </span>
                    </strong>
                  </div>
                  <div className="users-dashboard-bar-track" aria-hidden="true">
                    <div
                      className="users-dashboard-bar-fill"
                      style={{
                        width: `${Math.max(percent, item.processCount > 0 ? 4 : 0)}%`,
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="generated-password-empty">Nenhum processo cadastrado.</p>
        )}
      </div>
    </div>
  )
}

type AreaLeadershipEditorProps = {
  title: string
  hint: string
  area: OrgAreaLeadership
  candidateUsers: AppUser[]
  canManage: boolean
  busy?: boolean
  onSave: (payload: AreaUpdatePayload) => Promise<void>
}

export function AreaLeadershipEditor({
  title,
  hint,
  area,
  candidateUsers,
  canManage,
  busy = false,
  onSave,
}: AreaLeadershipEditorProps) {
  const [label, setLabel] = useState(area.label)
  const [responsibleUserId, setResponsibleUserId] = useState(area.responsibleUserId ?? '')
  const [substituteUserId, setSubstituteUserId] = useState(area.substituteUserId ?? '')
  const [error, setError] = useState<string | null>(null)
  const status = area.status === 'ativa' ? 'ativa' : 'pendente'

  const handleSave = async () => {
    setError(null)
    const trimmed = label.trim()
    if (!trimmed) {
      setError('Informe o nome da gestão operacional.')
      return
    }
    if (responsibleUserId && substituteUserId && responsibleUserId === substituteUserId) {
      setError('O substituto deve ser diferente do responsável.')
      return
    }
    try {
      await onSave({
        label: trimmed,
        responsibleUserId: responsibleUserId || null,
        substituteUserId: responsibleUserId ? substituteUserId || null : null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.')
    }
  }

  return (
    <div className="users-dashboard-card gestao-cell-responsible">
      <h3>{title}</h3>
      <p className="users-dashboard-ranking-hint">{hint}</p>
      <div className="gestao-cell-status-row">
        <span
          className={`gestao-cell-status-badge ${status === 'ativa' ? 'is-ativa' : 'is-pendente'}`}
        >
          {status === 'ativa' ? 'Ativa' : 'Pendente'}
        </span>
        <span className="gestao-cell-responsible-name">
          <strong>{area.label}</strong>
          {area.responsibleName ? (
            <>
              {' '}
              · Responsável: <strong>{area.responsibleName}</strong>
            </>
          ) : (
            <> · Sem responsável</>
          )}
          {area.substituteName ? (
            <>
              {' '}
              · Substituto: <strong>{area.substituteName}</strong>
            </>
          ) : (
            <> · Sem substituto</>
          )}
        </span>
      </div>
      {status === 'pendente' ? (
        <div className="agenda-alert agenda-alert-pending" role="status">
          <strong>Liderança incompleta.</strong>{' '}
          {leadershipPendingReason(area.responsibleUserId, area.substituteUserId)}.
          Defina responsável e substituto para liberar a área.
        </div>
      ) : null}
      {canManage ? (
        <div className="gestao-cell-responsible-form">
          <label>
            Nome da gestão operacional
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Ex.: Gestão Operacional Norte"
              maxLength={80}
              disabled={busy}
              required
            />
          </label>
          <label>
            Responsável
            <select
              value={responsibleUserId}
              onChange={(event) => {
                const next = event.target.value
                setResponsibleUserId(next)
                if (!next || next === substituteUserId) setSubstituteUserId('')
              }}
              disabled={busy}
            >
              <option value="">Sem responsável — pendente</option>
              <UserOptions users={candidateUsers} />
            </select>
          </label>
          <label>
            Substituto (ausência)
            <select
              value={substituteUserId}
              onChange={(event) => setSubstituteUserId(event.target.value)}
              disabled={busy || !responsibleUserId}
            >
                    <option value="">Sem substituto — pendente</option>
              <UserOptions users={candidateUsers} excludeId={responsibleUserId || undefined} />
            </select>
          </label>
          {error ? (
            <p className="gestao-create-cell-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void handleSave()}
          >
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

type CellResponsibleEditorProps = {
  cell: OrgCell
  candidateUsers: AppUser[]
  canManage: boolean
  busy?: boolean
  onAssign: (payload: LeadershipPayload) => Promise<void>
  onDelete?: () => Promise<void>
}

export function CellResponsibleEditor({
  cell,
  candidateUsers,
  canManage,
  busy = false,
  onAssign,
  onDelete,
}: CellResponsibleEditorProps) {
  const [responsibleUserId, setResponsibleUserId] = useState(cell.responsibleUserId ?? '')
  const [substituteUserId, setSubstituteUserId] = useState(cell.substituteUserId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const status = cell.status === 'ativa' ? 'ativa' : 'pendente'
  const pendingReason = leadershipPendingReason(
    cell.responsibleUserId,
    cell.substituteUserId,
  )

  const handleSave = async () => {
    setError(null)
    if (responsibleUserId && substituteUserId && responsibleUserId === substituteUserId) {
      setError('O substituto deve ser diferente do responsável.')
      return
    }
    try {
      await onAssign({
        responsibleUserId: responsibleUserId || null,
        substituteUserId: responsibleUserId ? substituteUserId || null : null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.')
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setError(null)
    setDeleting(true)
    try {
      await onDelete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir a célula.')
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="gestao-cell-responsible">
      <div className="gestao-cell-status-row">
        <span
          className={`gestao-cell-status-badge ${status === 'ativa' ? 'is-ativa' : 'is-pendente'}`}
        >
          {status === 'ativa' ? 'Ativa' : 'Pendente'}
        </span>
        <span className="gestao-cell-responsible-name">
          {cell.responsibleName ? (
            <>
              Responsável: <strong>{cell.responsibleName}</strong>
            </>
          ) : (
            'Sem responsável'
          )}
          {cell.substituteName ? (
            <>
              {' '}
              · Substituto: <strong>{cell.substituteName}</strong>
            </>
          ) : (
            <> · Sem substituto</>
          )}
        </span>
      </div>
      {pendingReason ? (
        <div className="agenda-alert agenda-alert-pending" role="status">
          <strong>Célula pendente.</strong> {pendingReason}. Subcélulas e processos ficam
          bloqueados até completar a liderança.
        </div>
      ) : null}
      {canManage ? (
        <div className="gestao-cell-responsible-form">
          <label>
            Responsável
            <select
              value={responsibleUserId}
              onChange={(event) => {
                const next = event.target.value
                setResponsibleUserId(next)
                if (!next || next === substituteUserId) setSubstituteUserId('')
              }}
              disabled={busy || deleting}
            >
              <option value="">Sem responsável — pendente</option>
              <UserOptions users={candidateUsers} />
            </select>
          </label>
          <label>
            Substituto (ausência)
            <select
              value={substituteUserId}
              onChange={(event) => setSubstituteUserId(event.target.value)}
              disabled={busy || deleting || !responsibleUserId}
            >
              <option value="">Sem substituto — pendente</option>
              <UserOptions users={candidateUsers} excludeId={responsibleUserId || undefined} />
            </select>
          </label>
          {error ? (
            <p className="gestao-create-cell-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="gestao-create-cell-actions">
            <button
              type="button"
              className="primary-button"
              disabled={busy || deleting}
              onClick={() => void handleSave()}
            >
              {busy ? 'Salvando…' : 'Salvar liderança'}
            </button>
            {onDelete ? (
              confirmDelete ? (
                <>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={busy || deleting}
                    onClick={() => void handleDelete()}
                  >
                    {deleting ? 'Excluindo…' : 'Confirmar exclusão'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || deleting}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="danger-button"
                  disabled={busy || deleting}
                  onClick={() => {
                    setError(null)
                    setConfirmDelete(true)
                  }}
                >
                  Excluir célula
                </button>
              )
            ) : null}
          </div>
          {confirmDelete ? (
            <p className="users-dashboard-ranking-hint">
              A exclusão remove a célula permanentemente. Esta ação não pode ser desfeita.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
