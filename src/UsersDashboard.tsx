import type { AppUser } from './api'

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
                  <span>
                    {item.count} ({percent}%)
                  </span>
                </div>
                <div className="users-dashboard-bar-track" aria-hidden="true">
                  <div
                    className="users-dashboard-bar-fill"
                    style={{ width: `${percent}%` }}
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
  const byArea = countBy(approvedUsers.map((user) => user.workArea))
  const byJob = countBy(approvedUsers.map((user) => user.jobTitle))
  const byType = countBy(approvedUsers.map((user) => user.employmentType))
  const byUnit = countBy(approvedUsers.map((user) => user.edpUnit))
  const byLocality = countBy(approvedUsers.map((user) => user.locality))

  return (
    <div className="users-dashboard" aria-label="Dashboard de usuários">
      <div className="users-dashboard-kpis">
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Total cadastrados</p>
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
          <p className="users-dashboard-kpi-label">Administradores</p>
          <p className="users-dashboard-kpi-value">
            {users.filter((user) => user.role === 'admin').length}
          </p>
        </article>
      </div>

      <div className="users-dashboard-grid">
        <DistributionList title="Por área" items={byArea} total={approvedUsers.length} />
        <DistributionList title="Por cargo" items={byJob} total={approvedUsers.length} />
        <DistributionList title="Por tipo" items={byType} total={approvedUsers.length} />
        <DistributionList title="Por abrangência EDP" items={byUnit} total={approvedUsers.length} />
        <DistributionList
          title="Por localidade"
          items={byLocality}
          total={approvedUsers.length}
        />
      </div>
    </div>
  )
}
