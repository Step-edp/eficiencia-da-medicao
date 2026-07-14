import { FormEvent, useState } from 'react'
import type { AppUser } from './api'
import { getGestaoDashboardStats, ORG_STRUCTURE, type OrgCell } from './orgStructure'

type GestaoDashboardProps = {
  cells: OrgCell[]
  candidateUsers: AppUser[]
  canManage: boolean
  busy?: boolean
  error?: string | null
  onCreateCell: (payload: {
    label: string
    description: string
    responsibleUserId: string | null
  }) => Promise<void>
}

export function GestaoDashboard({
  cells,
  candidateUsers,
  canManage,
  busy = false,
  error = null,
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
  const [localError, setLocalError] = useState<string | null>(null)

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    setLocalError(null)
    const trimmed = label.trim()
    if (!trimmed) {
      setLocalError('Informe o nome da célula.')
      return
    }
    try {
      await onCreateCell({
        label: trimmed,
        description: description.trim(),
        responsibleUserId: responsibleUserId || null,
      })
      setLabel('')
      setDescription('')
      setResponsibleUserId('')
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Não foi possível criar a célula.')
    }
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

      {canManage ? (
        <div className="users-dashboard-card gestao-create-cell">
          <h3>Nova célula</h3>
          <p className="users-dashboard-ranking-hint">
            Crie uma célula e atribua um responsável. Sem responsável, a célula fica
            pendente.
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
                onChange={(event) => setResponsibleUserId(event.target.value)}
                disabled={busy}
              >
                <option value="">Sem responsável — pendente</option>
                {candidateUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.registration})
                  </option>
                ))}
              </select>
            </label>
            {(localError || error) && (
              <p className="gestao-create-cell-error" role="alert">
                {localError || error}
              </p>
            )}
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? 'Criando…' : 'Criar célula'}
            </button>
          </form>
        </div>
      ) : null}

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

type CellResponsibleEditorProps = {
  cell: OrgCell
  candidateUsers: AppUser[]
  canManage: boolean
  busy?: boolean
  onAssign: (responsibleUserId: string | null) => Promise<void>
}

export function CellResponsibleEditor({
  cell,
  candidateUsers,
  canManage,
  busy = false,
  onAssign,
}: CellResponsibleEditorProps) {
  const [responsibleUserId, setResponsibleUserId] = useState(
    cell.responsibleUserId ?? '',
  )
  const [error, setError] = useState<string | null>(null)
  const status = cell.status === 'ativa' ? 'ativa' : 'pendente'

  const handleSave = async () => {
    setError(null)
    try {
      await onAssign(responsibleUserId || null)
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
        {cell.responsibleName ? (
          <span className="gestao-cell-responsible-name">
            Responsável: <strong>{cell.responsibleName}</strong>
          </span>
        ) : (
          <span className="gestao-cell-responsible-name">
            Sem responsável — célula pendente
          </span>
        )}
      </div>
      {canManage ? (
        <div className="gestao-cell-responsible-form">
          <label>
            Atribuir responsável
            <select
              value={responsibleUserId}
              onChange={(event) => setResponsibleUserId(event.target.value)}
              disabled={busy}
            >
              <option value="">Sem responsável — pendente</option>
              {candidateUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.registration})
                </option>
              ))}
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
            {busy ? 'Salvando…' : 'Salvar responsável'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
