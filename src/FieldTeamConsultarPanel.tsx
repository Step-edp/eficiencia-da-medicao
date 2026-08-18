import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError, type MeterScheduleRecord } from './api'
import { formatSchedulePartnerLabel, formatScheduleCreatedByLabel, formatScheduleCreatedAtLabel, formatScheduleCollaborator1Label, formatScheduleCollaborator2Label, scheduleAuditSearchText } from './schedulePartnerLabel'

type FieldTeamSchedulesPanelProps = {
  mode?: 'all' | 'mine'
  /** Admin "Ver como": aplica o escopo CSD deste usuário no Consultar. */
  scopeUserId?: string
}

type EnvelopePreview = {
  src: string
  meter: string
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function deliveryStatusLabel(item: MeterScheduleRecord) {
  if (item.isLate) return 'Atrasado'
  if (item.trailStep === 'Entrada de medidores') return 'No prazo'
  return 'Entregue'
}

function scheduleSearchText(item: MeterScheduleRecord) {
  return normalizeSearch(
    [
      item.meter,
      item.installation,
      item.toi,
      item.note,
      item.csd,
      formatSchedulePartnerLabel(item),
      scheduleAuditSearchText(item),
      item.partnerName,
      item.partnerRegistration,
      item.scheduledAtLabel,
      item.deliveryDeadlineLabel,
      deliveryStatusLabel(item),
      item.toiCollaborator1Name,
      item.toiCollaborator1Registration,
      item.toiCollaborator2Name,
      item.toiCollaborator2Registration,
      item.schedulingNotes,
    ]
      .filter(Boolean)
      .join(' '),
  )
}

export function FieldTeamConsultarPanel({
  mode = 'all',
  scopeUserId,
}: FieldTeamSchedulesPanelProps) {
  const [schedules, setSchedules] = useState<MeterScheduleRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )
  const [envelopePreview, setEnvelopePreview] = useState<EnvelopePreview | null>(null)
  const isMine = mode === 'mine'

  const load = useCallback(async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const { schedules: rows } = await api.listMeterSchedules(undefined, {
        mine: isMine,
        forUserId: !isMine && scopeUserId ? scopeUserId : undefined,
      })
      setSchedules(rows)
    } catch (error) {
      setSchedules([])
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : isMine
              ? 'Não foi possível carregar seus TOIs.'
              : 'Não foi possível carregar os agendamentos.',
      })
    } finally {
      setLoading(false)
    }
  }, [isMine, scopeUserId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!envelopePreview) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEnvelopePreview(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [envelopePreview])

  const filteredSchedules = useMemo(() => {
    const query = normalizeSearch(searchQuery)
    if (!query) return schedules
    return schedules.filter((item) => scheduleSearchText(item).includes(query))
  }, [schedules, searchQuery])

  const totalCount = schedules.length
  const shownCount = filteredSchedules.length
  const counterLabel = isMine
    ? shownCount === totalCount
      ? `${totalCount} TOI${totalCount === 1 ? '' : 's'}`
      : `${shownCount} de ${totalCount} TOI${totalCount === 1 ? '' : 's'}`
    : shownCount === totalCount
      ? `${totalCount} agendamento${totalCount === 1 ? '' : 's'}`
      : `${shownCount} de ${totalCount} agendamento${totalCount === 1 ? '' : 's'}`

  return (
    <div className="entrada-panel">
      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      {!loading && totalCount > 0 ? (
        <div className="consultar-toolbar">
          <label className="consultar-search">
            <span className="sr-only">Pesquisar</span>
            <span className="consultar-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle
                  cx="11"
                  cy="11"
                  r="7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M20 20l-3.5-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Pesquisar por medidor, nota, CSD, parceiro, colaborador, usuário, carimbo, status…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="consultar-count" aria-live="polite">
            {counterLabel}
          </p>
        </div>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">
          {isMine ? 'Carregando seus TOIs...' : 'Carregando agendamentos...'}
        </p>
      ) : schedules.length === 0 ? (
        <p className="entrada-panel-empty">
          {isMine ? 'Nenhum TOI encontrado para o seu usuário.' : 'Nenhum agendamento encontrado.'}
        </p>
      ) : filteredSchedules.length === 0 ? (
        <p className="entrada-panel-empty">Nenhum resultado para a pesquisa.</p>
      ) : (
        <div className="entrada-table-wrap">
          <table className="data-table entrada-table">
            <thead>
              <tr>
                <th>Medidor</th>
                <th>Instalação</th>
                <th>TOI</th>
                <th>Invólucro</th>
                <th>Nota</th>
                <th>CSD</th>
                <th>Parceiro</th>
                <th>Agendado por</th>
                <th>Colaborador 1</th>
                <th>Colaborador 2</th>
                <th>Carimbo</th>
                <th>Data de ensaio</th>
                <th>Prazo entrega</th>
                <th>Status entrega</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedules.map((item) => (
                <tr
                  key={item.id}
                  className={item.isLate ? 'schedule-row-late' : undefined}
                >
                  <td>{item.meter}</td>
                  <td>{item.installation || '—'}</td>
                  <td>{item.toi || '—'}</td>
                  <td>
                    {item.envelopePhoto ? (
                      <button
                        type="button"
                        className="envelope-photo-link"
                        onClick={() => {
                          const photo = item.envelopePhoto
                          if (!photo) return
                          setEnvelopePreview({
                            src: photo,
                            meter: item.meter,
                          })
                        }}
                        aria-label={`Ampliar foto do invólucro do medidor ${item.meter}`}
                        title="Clique para ampliar"
                      >
                        <img
                          className="envelope-photo-thumb"
                          src={item.envelopePhoto}
                          alt={`Invólucro do medidor ${item.meter}`}
                        />
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{item.note || '—'}</td>
                  <td>{item.csd || '—'}</td>
                  <td>{formatSchedulePartnerLabel(item) || '—'}</td>
                  <td>{formatScheduleCreatedByLabel(item) || '—'}</td>
                  <td>{formatScheduleCollaborator1Label(item) || '—'}</td>
                  <td>{formatScheduleCollaborator2Label(item) || '—'}</td>
                  <td>{formatScheduleCreatedAtLabel(item.createdAt) || '—'}</td>
                  <td>{item.scheduledAtLabel || '—'}</td>
                  <td>{item.deliveryDeadlineLabel || '—'}</td>
                  <td>
                    {item.isLate ? (
                      <span className="schedule-late-badge">Atrasado</span>
                    ) : item.trailStep === 'Entrada de medidores' ? (
                      <span className="schedule-ok-badge">No prazo</span>
                    ) : (
                      'Entregue'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {envelopePreview ? (
        <div
          className="envelope-photo-lightbox"
          role="presentation"
          onClick={() => setEnvelopePreview(null)}
        >
          <div
            className="envelope-photo-lightbox-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Foto do invólucro do medidor ${envelopePreview.meter}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="icon-button schedule-slot-modal-close"
              onClick={() => setEnvelopePreview(null)}
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
            <p className="envelope-photo-lightbox-caption">
              Invólucro · medidor {envelopePreview.meter}
            </p>
            <img
              className="envelope-photo-lightbox-image"
              src={envelopePreview.src}
              alt={`Foto ampliada do invólucro do medidor ${envelopePreview.meter}`}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
