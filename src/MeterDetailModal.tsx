import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  api,
  type MeterRegistryRecord,
  type MeterScheduleHistoryRecord,
  type MeterScheduleRecord,
} from './api'
import { formatAuditAction, formatAuditDate } from './auditLabels'
import {
  formatScheduleCollaborator1Label,
  formatScheduleCollaborator2Label,
  formatScheduleCreatedAtLabel,
  formatScheduleCreatedByLabel,
} from './schedulePartnerLabel'

type MeterDetailModalProps = {
  meter: string
  onClose: () => void
}

function displayValue(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : '—'
}

function formatDateTime(isoDate: string | null | undefined) {
  if (!isoDate) return '—'
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function formatHistoryActor(entry: MeterScheduleHistoryRecord) {
  const name = entry.userName?.trim()
  const registration = entry.userRegistration?.trim()
  if (name && registration) return `${name} (${registration})`
  if (name) return name
  if (registration) return registration
  return 'Sistema / público'
}

function scheduleSourceLabel(source: string) {
  if (source === 'bulk_import') return 'Importação em massa'
  if (source === 'passivo') return 'Passivo'
  if (source === 'field_team') return 'Equipe de campo'
  return source || '—'
}

export function MeterDetailModal({ meter, onClose }: MeterDetailModalProps) {
  const [loading, setLoading] = useState(true)
  const [registry, setRegistry] = useState<MeterRegistryRecord | null>(null)
  const [schedules, setSchedules] = useState<MeterScheduleRecord[]>([])
  const [history, setHistory] = useState<MeterScheduleHistoryRecord[]>([])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const [registryResponse, schedulesResponse, historyResponse] = await Promise.all([
          api.getMeterRegistry(meter),
          api.listMeterSchedules(undefined, { meter }),
          api.listMeterScheduleHistory(meter),
        ])
        if (cancelled) return
        setRegistry(registryResponse.registry)
        setSchedules(schedulesResponse.schedules)
        setHistory(historyResponse.history)
      } catch {
        if (!cancelled) {
          setRegistry(null)
          setSchedules([])
          setHistory([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [meter])

  const latestSchedule = schedules[0] ?? null

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="ensaios-block-modal demm-modal schedule-detail-modal meter-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="meter-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-button schedule-slot-modal-close"
          onClick={onClose}
          aria-label="Fechar"
          title="Fechar"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <h3 id="meter-detail-title">Medidor {meter}</h3>
        <p className="demm-modal-intro">Informações de cadastro e histórico de movimentação.</p>

        {loading ? (
          <p className="entrada-panel-empty">Carregando dados do medidor...</p>
        ) : (
          <>
            <section className="meter-detail-section" aria-label="Cadastro do medidor">
              <h4 className="meter-detail-section-title">Cadastro</h4>
              {registry ? (
                <dl className="user-detail-grid schedule-detail-grid">
                  <div>
                    <dt>Status</dt>
                    <dd>{displayValue(registry.status)}</dd>
                  </div>
                  <div>
                    <dt>Etapa na trilha</dt>
                    <dd>{displayValue(registry.trailStep)}</dd>
                  </div>
                  <div>
                    <dt>Instalação</dt>
                    <dd>{displayValue(registry.installation)}</dd>
                  </div>
                  <div>
                    <dt>TOI</dt>
                    <dd>{displayValue(registry.toi)}</dd>
                  </div>
                  <div>
                    <dt>Nota</dt>
                    <dd>{displayValue(registry.note)}</dd>
                  </div>
                  <div>
                    <dt>CSD</dt>
                    <dd>{displayValue(registry.csd)}</dd>
                  </div>
                  <div>
                    <dt>Cliente</dt>
                    <dd>{displayValue(registry.client)}</dd>
                  </div>
                  <div>
                    <dt>Fabricante</dt>
                    <dd>{displayValue(registry.manufacturer)}</dd>
                  </div>
                  <div>
                    <dt>Modelo</dt>
                    <dd>{displayValue(registry.model)}</dd>
                  </div>
                  <div>
                    <dt>Nº RATM</dt>
                    <dd>{displayValue(registry.ratmNumber)}</dd>
                  </div>
                  <div>
                    <dt>Entregue por</dt>
                    <dd>{displayValue(registry.deliveredBy)}</dd>
                  </div>
                  <div>
                    <dt>Disponível em</dt>
                    <dd>{formatDateTime(registry.availableAt)}</dd>
                  </div>
                  <div>
                    <dt>Agendado em</dt>
                    <dd>{formatDateTime(registry.scheduledAt)}</dd>
                  </div>
                  <div>
                    <dt>Recebido em</dt>
                    <dd>{formatDateTime(registry.receivedAt)}</dd>
                  </div>
                  {registry.schedulingNotes?.trim() ? (
                    <div className="user-detail-full">
                      <dt>Observações</dt>
                      <dd>{registry.schedulingNotes.trim()}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="entrada-panel-empty">Medidor não encontrado na base de cadastro.</p>
              )}
            </section>

            {latestSchedule ? (
              <section className="meter-detail-section" aria-label="Agendamento">
                <h4 className="meter-detail-section-title">Agendamento</h4>
                <dl className="user-detail-grid schedule-detail-grid">
                  <div>
                    <dt>Etapa</dt>
                    <dd>{displayValue(latestSchedule.trailStep)}</dd>
                  </div>
                  <div>
                    <dt>Data de ensaio</dt>
                    <dd>{displayValue(latestSchedule.scheduledAtLabel)}</dd>
                  </div>
                  <div>
                    <dt>Prazo entrega</dt>
                    <dd>{displayValue(latestSchedule.deliveryDeadlineLabel)}</dd>
                  </div>
                  <div>
                    <dt>CSD</dt>
                    <dd>{displayValue(latestSchedule.csd)}</dd>
                  </div>
                  <div>
                    <dt>Agendado por</dt>
                    <dd>{displayValue(formatScheduleCreatedByLabel(latestSchedule))}</dd>
                  </div>
                  <div>
                    <dt>Colaborador 1</dt>
                    <dd>{displayValue(formatScheduleCollaborator1Label(latestSchedule))}</dd>
                  </div>
                  <div>
                    <dt>Colaborador 2</dt>
                    <dd>{displayValue(formatScheduleCollaborator2Label(latestSchedule))}</dd>
                  </div>
                  <div>
                    <dt>Carimbo</dt>
                    <dd>{displayValue(formatScheduleCreatedAtLabel(latestSchedule.createdAt))}</dd>
                  </div>
                  <div>
                    <dt>Origem</dt>
                    <dd>{scheduleSourceLabel(latestSchedule.source)}</dd>
                  </div>
                  {latestSchedule.demmFileName?.trim() ? (
                    <div>
                      <dt>DEMM vinculada</dt>
                      <dd>{latestSchedule.demmFileName.trim()}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            ) : null}

            <section className="meter-detail-section" aria-label="Histórico do medidor">
              <h4 className="meter-detail-section-title">Histórico</h4>
              {history.length === 0 ? (
                <p className="entrada-panel-empty">Nenhuma alteração registrada para este medidor.</p>
              ) : (
                <div className="entrada-table-wrap meter-detail-history-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Responsável</th>
                        <th>Ação</th>
                        <th>Resumo</th>
                        <th>Justificativa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((entry) => (
                        <tr key={entry.id}>
                          <td>{formatAuditDate(entry.occurredAt)}</td>
                          <td>{formatHistoryActor(entry)}</td>
                          <td>
                            <span className={`audit-action audit-action-${entry.action}`}>
                              {formatAuditAction(entry.action)}
                            </span>
                          </td>
                          <td>{entry.summary ?? '—'}</td>
                          <td>{entry.justification || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        <div className="ensaios-block-modal-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
