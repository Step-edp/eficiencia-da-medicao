import { useState } from 'react'
import { AgendamentoDashPanel } from './AgendamentoDashPanel'
import { EntradaCsdDashboard } from './EntradaCsdDashboard'

type LabDashTab = 'agendamento' | 'entrada'

export function LabDashboardPanel() {
  const [tab, setTab] = useState<LabDashTab>('agendamento')

  return (
    <>
      <div
        className="panel-switch users-view-switch lab-agendar-switch"
        role="tablist"
        aria-label="Dashboards do laboratório"
      >
        <button
          className={tab === 'agendamento' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={tab === 'agendamento'}
          onClick={() => setTab('agendamento')}
        >
          Agendamento
        </button>
        <button
          className={tab === 'entrada' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={tab === 'entrada'}
          onClick={() => setTab('entrada')}
        >
          Entrada
        </button>
      </div>

      {tab === 'entrada' ? <EntradaCsdDashboard /> : <AgendamentoDashPanel />}
    </>
  )
}
