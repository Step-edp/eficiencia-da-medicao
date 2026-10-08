import { useState } from 'react'
import { FieldTeamConsultarPanel } from './FieldTeamConsultarPanel'
import { ScheduleAgendarForm } from './ScheduleAgendarForm'

type LabAgendarTab = 'novo' | 'lista'

type LabAgendarPanelProps = {
  readOnly?: boolean
  allowCancelSchedule?: boolean
}

export function LabAgendarPanel({
  readOnly = false,
  allowCancelSchedule = false,
}: LabAgendarPanelProps) {
  const [tab, setTab] = useState<LabAgendarTab>('lista')
  const activeTab = tab === 'novo' && readOnly ? 'lista' : tab

  return (
    <>
      <div
        className="panel-switch users-view-switch lab-agendar-switch"
        role="tablist"
        aria-label="Agendamento"
      >
        <button
          className={activeTab === 'lista' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={activeTab === 'lista'}
          onClick={() => setTab('lista')}
        >
          Medidores agendados
        </button>
        {readOnly ? null : (
          <button
            className={activeTab === 'novo' ? 'active' : ''}
            type="button"
            role="tab"
            aria-selected={activeTab === 'novo'}
            onClick={() => setTab('novo')}
          >
            Novo agendamento
          </button>
        )}
      </div>

      {activeTab === 'novo' ? (
        <>
          <p>Preencha os dados abaixo para reservar a data de agendamento.</p>
          <ScheduleAgendarForm />
        </>
      ) : (
        <>
          {readOnly ? <p>Agendamentos realizados (visualização).</p> : null}
          <FieldTeamConsultarPanel
            allowCancelSchedule={allowCancelSchedule && !readOnly}
            excludeAnalyzed
          />
        </>
      )}
    </>
  )
}
