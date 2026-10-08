import { AgendamentoDashPanel } from './AgendamentoDashPanel'
import { EntradaCsdDashboard } from './EntradaCsdDashboard'

export function LabDashboardPanel() {
  return (
    <div className="lab-central-dashboard">
      <section className="lab-central-dashboard-section" aria-label="Dash de agendamento">
        <h3 className="entrada-section-title">Agendamento</h3>
        <AgendamentoDashPanel />
      </section>
      <section className="lab-central-dashboard-section" aria-label="Escore dos CSDs">
        <h3 className="entrada-section-title">Escore dos CSDs</h3>
        <EntradaCsdDashboard />
      </section>
    </div>
  )
}
