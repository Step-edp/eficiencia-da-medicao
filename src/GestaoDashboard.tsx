import { FormEvent, useState } from 'react'
import type { AppUser } from './api'
import {
  getGestaoDashboardStats,
  ORG_STRUCTURE,
  type OrgAreaLeadership,
  type OrgCell,
} from './orgStructure'

type LeadershipPayload = {
  responsibleUserId: string | null
  substituteUserId: string | null
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
  onUpdateArea: (payload: LeadershipPayload) => Promise<void>
  onCreateCell: (
    payload: LeadershipPayload & { label: string; description: string },
  ) => Promise<void>
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

export function GestaoDashboard({
  area,
  cells,
  candidateUsers,
  canManage,
  busy = false,
  error = null,
  view = 'dash',
  onUpdateArea,
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
                Cada célula tem 1 responsável e 1 substituto para ausência. Sem responsável,
                a célula fica pendente.
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
                    <option value="">Sem substituto</option>
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

      <AreaLeadershipEditor
        key={`${area.responsibleUserId ?? 'none'}:${area.substituteUserId ?? 'none'}`}
        title="Liderança da Gestão Operacional"
        hint="A área Gestão Operacional tem 1 responsável e 1 substituto para períodos de ausência. Sem responsável, a área fica pendente."
        area={area}
        candidateUsers={candidateUsers}
        canManage={canManage}
        busy={busy}
        onSave={onUpdateArea}
      />

      <div className="users-dashboard-card gestao-dashboard-breakdown">
        <h3>Processos por subcélula</h3>
        <p className="users-dashboard-ranking-hint">
          Distribuição dos processos da área {ORG_STRUCTURE.label} em cada subcélula.
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
  onSave: (payload: LeadershipPayload) => Promise<void>
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
  const [responsibleUserId, setResponsibleUserId] = useState(area.responsibleUserId ?? '')
  const [substituteUserId, setSubstituteUserId] = useState(area.substituteUserId ?? '')
  const [error, setError] = useState<string | null>(null)
  const status = area.status === 'ativa' ? 'ativa' : 'pendente'

  const handleSave = async () => {
    setError(null)
    if (responsibleUserId && substituteUserId && responsibleUserId === substituteUserId) {
      setError('O substituto deve ser diferente do responsável.')
      return
    }
    try {
      await onSave({
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
          {area.responsibleName ? (
            <>
              Responsável: <strong>{area.responsibleName}</strong>
            </>
          ) : (
            'Sem responsável'
          )}
          {area.substituteName ? (
            <>
              {' '}
              · Substituto: <strong>{area.substituteName}</strong>
            </>
          ) : null}
        </span>
      </div>
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
              <option value="">Sem substituto</option>
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
            {busy ? 'Salvando…' : 'Salvar liderança'}
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
}

export function CellResponsibleEditor({
  cell,
  candidateUsers,
  canManage,
  busy = false,
  onAssign,
}: CellResponsibleEditorProps) {
  const [responsibleUserId, setResponsibleUserId] = useState(cell.responsibleUserId ?? '')
  const [substituteUserId, setSubstituteUserId] = useState(cell.substituteUserId ?? '')
  const [error, setError] = useState<string | null>(null)
  const status = cell.status === 'ativa' ? 'ativa' : 'pendente'

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
            'Sem responsável — célula pendente'
          )}
          {cell.substituteName ? (
            <>
              {' '}
              · Substituto: <strong>{cell.substituteName}</strong>
            </>
          ) : null}
        </span>
      </div>
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
              <option value="">Sem substituto</option>
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
            {busy ? 'Salvando…' : 'Salvar liderança'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
