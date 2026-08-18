import { useState } from 'react'
import { FieldTeamConsultarPanel } from './FieldTeamConsultarPanel'
import { ScheduleAgendarForm } from './ScheduleAgendarForm'

type LabAgendarTab = 'novo' | 'lista'

type LabAgendarPanelProps = {
  readOnly?: boolean
}

export function LabAgendarPanel({ readOnly = false }: LabAgendarPanelProps) {
  const [tab, setTab] = useState<LabAgendarTab>(readOnly ? 'lista' : 'novo')

  if (readOnly) {
    return (
      <>
        <p>Agendamentos realizados (visualização).</p>
        <FieldTeamConsultarPanel />
      </>
    )
  }

  return (
    <>
      <div
        className="panel-switch users-view-switch lab-agendar-switch"
        role="tablist"
        aria-label="Agendamento"
      >
        <button
          className={tab === 'novo' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={tab === 'novo'}
          onClick={() => setTab('novo')}
        >
          Novo agendamento
        </button>
        <button
          className={tab === 'lista' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={tab === 'lista'}
          onClick={() => setTab('lista')}
        >
          Medidores agendados
        </button>
      </div>

      {tab === 'novo' ? (
        <>
          <p>Preencha os dados abaixo para reservar a data de agendamento.</p>
          <ScheduleAgendarForm />
        </>
      ) : (
        <FieldTeamConsultarPanel />
      )}
    </>
  )
}
