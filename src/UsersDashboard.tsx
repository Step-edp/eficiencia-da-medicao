import type { AppUser } from './api'
import { countResponsibleProcesses } from './registrationOptions'

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

export function UsersDashboard({
  users,
  pendingCount,
  approvedCount,
}: UsersDashboardProps) {
  const approvedUsers = users.filter((user) => user.approvalStatus === 'approved')
  const nonAdminApproved = approvedUsers.filter((user) => user.role !== 'admin')

  const byCity = countBy(nonAdminApproved.map((user) => user.locality))
  const byArea = countBy(nonAdminApproved.map((user) => user.workArea))
  const byJob = countBy(nonAdminApproved.map((user) => user.jobTitle))

  const processRanking = nonAdminApproved
    .map((user) => ({
      id: user.id,
      name: user.name,
      registration: user.registration,
      jobTitle: user.jobTitle || '—',
      workArea: user.workArea || '—',
      locality: user.locality || '—',
      processCount: countResponsibleProcesses(user),
    }))
    .sort(
      (a, b) =>
        b.processCount - a.processCount ||
        a.name.localeCompare(b.name, 'pt-BR'),
    )

  const maxProcesses = processRanking[0]?.processCount ?? 0

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
      </div>

      <div className="users-dashboard-grid">
        <DistributionList
          title="Quantidade por cidade"
          items={byCity}
          total={nonAdminApproved.length}
        />
        <DistributionList
          title="Quantidade por área"
          items={byArea}
          total={nonAdminApproved.length}
        />
        <DistributionList
          title="Quantidade por cargo"
          items={byJob}
          total={nonAdminApproved.length}
        />
      </div>

      <div className="users-dashboard-card users-dashboard-ranking">
        <h4>Ranking por processos sob responsabilidade</h4>
        <p className="users-dashboard-ranking-hint">
          Conta os processos da área própria e, quando aplicável, processos
          específicos ou subáreas atribuídas a cada pessoa.
        </p>
        {processRanking.length ? (
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
                {processRanking.map((item, index) => {
                  const percent =
                    maxProcesses > 0
                      ? Math.round((item.processCount / maxProcesses) * 100)
                      : 0
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
                          <strong>{item.processCount}</strong>
                          <div
                            className="users-dashboard-bar-track"
                            aria-hidden="true"
                          >
                            <div
                              className="users-dashboard-bar-fill"
                              style={{
                                width: `${Math.max(percent, item.processCount > 0 ? 4 : 0)}%`,
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
            Nenhum usuário aprovado para montar o ranking.
          </p>
        )}
      </div>
    </div>
  )
}
