import { useEffect, useMemo, useState } from 'react'
import { LoginFeedback } from './LoginFeedback'
import {
  api,
  ApiError,
  type AppUser,
  type ProcessAssignment,
  type ProcessRole,
} from './api'

type UsersDashboardProps = {
  users: AppUser[]
  pendingCount: number
  approvedCount: number
}

function countBy(values: Array<string | undefined | null>) {
  const map = new Map<string, number>()
  for (const value of values) {
    const key = value?.trim() || 'Não informado'
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
}

function DistributionList({
  title,
  items,
  total,
}: {
  title: string
  items: Array<{ label: string; count: number }>
  total: number
}) {
  return (
    <div className="users-dashboard-card">
      <h4>{title}</h4>
      {items.length ? (
        <ul className="users-dashboard-bars" aria-label={title}>
          {items.map((item) => {
            const percent = total > 0 ? Math.round((item.count / total) * 100) : 0
            return (
              <li key={item.label}>
                <div className="users-dashboard-bar-meta">
                  <span>{item.label}</span>
                  <strong>
                    {item.count} <span>({percent}%)</span>
                  </strong>
                </div>
                <div className="users-dashboard-bar-track" aria-hidden="true">
                  <div
                    className="users-dashboard-bar-fill"
                    style={{ width: `${Math.max(percent, item.count > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="generated-password-empty">Sem dados para exibir.</p>
      )}
    </div>
  )
}

function RoleRanking({
  title,
  hint,
  rows,
}: {
  title: string
  hint: string
  rows: Array<{
    id: string
    name: string
    registration: string
    jobTitle: string
    workArea: string
    locality: string
    count: number
  }>
}) {
  const max = rows[0]?.count ?? 0

  return (
    <div className="users-dashboard-card users-dashboard-ranking">
      <h4>{title}</h4>
      <p className="users-dashboard-ranking-hint">{hint}</p>
      {rows.length ? (
        <div className="entrada-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Nome</th>
                <th>Matrícula</th>
                <th>Cargo</th>
                <th>Área</th>
                <th>Cidade</th>
                <th>Processos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, index) => {
                const percent = max > 0 ? Math.round((item.count / max) * 100) : 0
                return (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>{item.name}</td>
                    <td>{item.registration}</td>
                    <td>{item.jobTitle}</td>
                    <td>{item.workArea}</td>
                    <td>{item.locality}</td>
                    <td>
                      <div className="users-dashboard-rank-cell">
                        <strong>{item.count}</strong>
                        <div className="users-dashboard-bar-track" aria-hidden="true">
                          <div
                            className="users-dashboard-bar-fill"
                            style={{
                              width: `${Math.max(percent, item.count > 0 ? 4 : 0)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="generated-password-empty">
          Nenhuma atribuição encontrada para este papel.
        </p>
      )}
    </div>
  )
}

export function UsersDashboard({
  users,
  pendingCount,
  approvedCount,
}: UsersDashboardProps) {
  const approvedUsers = users.filter((user) => user.approvalStatus === 'approved')
  const assignableUsers = approvedUsers

  const [assignments, setAssignments] = useState<ProcessAssignment[]>([])
  const [areaFilter, setAreaFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void api
      .listProcessAssignments()
      .then(({ assignments: next }) => {
        if (!cancelled) setAssignments(next)
      })
      .catch((error) => {
        if (!cancelled) {
          setFeedback({
            type: 'error',
            message:
              error instanceof ApiError
                ? error.message
                : 'Não foi possível carregar as atribuições de processos.',
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const byCity = countBy(assignableUsers.map((user) => user.locality))
  const byArea = countBy(assignableUsers.map((user) => user.workArea))
  const byJob = countBy(assignableUsers.map((user) => user.jobTitle))

  const areas = useMemo(
    () => [...new Set(assignments.map((item) => item.area))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [assignments],
  )

  const filteredAssignments = useMemo(
    () =>
      areaFilter
        ? assignments.filter((item) => item.area === areaFilter)
        : assignments,
    [assignments, areaFilter],
  )

  const EXECUTOR_SLOTS: Array<{
    role: ProcessRole
    label: string
    key: 'executor1' | 'executor2' | 'executor3'
  }> = [
    { role: 'executor1', label: 'Executor 1', key: 'executor1' },
    { role: 'executor2', label: 'Executor 2', key: 'executor2' },
    { role: 'executor3', label: 'Executor 3', key: 'executor3' },
  ]

  const assignedSlots = assignments.reduce((total, item) => {
    return (
      total +
      EXECUTOR_SLOTS.filter((slot) => item[slot.key].userId).length
    )
  }, 0)
  const processesWithExecutor = assignments.filter((item) =>
    EXECUTOR_SLOTS.some((slot) => item[slot.key].userId),
  ).length

  const executorRanking = (() => {
    const counts = new Map<string, number>()
    for (const item of assignments) {
      for (const slot of EXECUTOR_SLOTS) {
        const assignment = item[slot.key]
        const userId = assignment.actingUserId ?? assignment.userId
        if (!userId) continue
        counts.set(userId, (counts.get(userId) ?? 0) + 1)
      }
    }

    return assignableUsers
      .map((user) => ({
        id: user.id,
        name: user.name,
        registration: user.registration,
        jobTitle: user.jobTitle || '—',
        workArea: user.workArea || '—',
        locality: user.locality || '—',
        count: counts.get(user.id) ?? 0,
      }))
      .filter((item) => item.count > 0)
      .sort(
        (a, b) =>
          b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'),
      )
  })()

  const handleAssign = async (
    processKey: string,
    role: ProcessRole,
    userId: string | null,
  ) => {
    setSavingKey(`${processKey}:${role}`)
    setFeedback(null)
    try {
      const { assignments: next } = await api.upsertProcessAssignment({
        processKey,
        role,
        userId,
      })
      setAssignments(next)
      const label =
        role === 'executor1'
          ? 'Executor 1'
          : role === 'executor2'
            ? 'Executor 2'
            : 'Executor 3'
      setFeedback({
        type: 'success',
        message: `${label} do processo atualizado.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível salvar a atribuição.',
      })
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="users-dashboard" aria-label="Dashboard de usuários">
      <div className="users-dashboard-kpis">
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Total de usuários</p>
          <p className="users-dashboard-kpi-value">{users.length}</p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Aprovados</p>
          <p className="users-dashboard-kpi-value">{approvedCount}</p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Pendentes</p>
          <p className="users-dashboard-kpi-value">{pendingCount}</p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Cidades atendidas</p>
          <p className="users-dashboard-kpi-value">
            {byCity.filter((item) => item.label !== 'Não informado').length}
          </p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Processos com executor</p>
          <p className="users-dashboard-kpi-value">{processesWithExecutor}</p>
        </article>
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Slots de executor</p>
          <p className="users-dashboard-kpi-value">{assignedSlots}</p>
        </article>
      </div>

      <div className="users-dashboard-grid">
        <DistributionList
          title="Quantidade por cidade"
          items={byCity}
          total={assignableUsers.length}
        />
        <DistributionList
          title="Quantidade por área"
          items={byArea}
          total={assignableUsers.length}
        />
        <DistributionList
          title="Quantidade por cargo"
          items={byJob}
          total={assignableUsers.length}
        />
      </div>

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      <div className="users-dashboard-card users-dashboard-ranking">
        <div className="users-dashboard-assign-header">
          <div>
            <h4>Atribuição por processo</h4>
            <p className="users-dashboard-ranking-hint">
              Cada processo pode ter até três executores (Executor 1, 2 e 3).
            </p>
          </div>
          <label className="users-dashboard-area-filter">
            Filtrar área
            <select
              value={areaFilter}
              onChange={(event) => setAreaFilter(event.target.value)}
            >
              <option value="">Todas</option>
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="generated-password-empty">Carregando processos...</p>
        ) : (
          <div className="entrada-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Área</th>
                  <th>Processo</th>
                  {EXECUTOR_SLOTS.map((slot) => (
                    <th key={slot.role}>{slot.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.map((item) => (
                  <tr key={item.processKey}>
                    <td>{item.area}</td>
                    <td>{item.process}</td>
                    {EXECUTOR_SLOTS.map((slot) => {
                      const assignment = item[slot.key]
                      return (
                        <td key={slot.role}>
                          <select
                            className="users-dashboard-assign-select"
                            value={assignment.userId ?? ''}
                            disabled={savingKey === `${item.processKey}:${slot.role}`}
                            onChange={(event) => {
                              void handleAssign(
                                item.processKey,
                                slot.role,
                                event.target.value || null,
                              )
                            }}
                          >
                            <option value="">Sem {slot.label.toLowerCase()}</option>
                            {assignableUsers.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name} ({user.registration})
                              </option>
                            ))}
                          </select>
                          {assignment.coveredBySubstitute && assignment.actingName ? (
                            <p className="users-dashboard-cover-note">
                              Em férias → {assignment.actingName}
                            </p>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="users-dashboard-rankings-grid">
        <RoleRanking
          title="Ranking por execução"
          hint="Quantidade de processos em que a pessoa é executora (slots 1, 2 ou 3; substituto conta durante férias do titular)."
          rows={executorRanking}
        />
      </div>
    </div>
  )
}
