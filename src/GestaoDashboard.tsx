import { getGestaoDashboardStats, ORG_STRUCTURE } from './orgStructure'

export function GestaoDashboard() {
  const stats = getGestaoDashboardStats()
  const maxProcesses = Math.max(
    ...stats.processesBySubcell.map((item) => item.processCount),
    1,
  )

  return (
    <div className="gestao-dashboard" aria-label="Dashboard gerencial">
      <div className="users-dashboard-kpis gestao-dashboard-kpis">
        <article className="users-dashboard-kpi">
          <p className="users-dashboard-kpi-label">Células</p>
          <p className="users-dashboard-kpi-value">{stats.cellCount}</p>
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
