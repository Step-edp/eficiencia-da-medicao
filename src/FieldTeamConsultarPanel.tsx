import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type MeterScheduleRecord } from './api'

type FieldTeamSchedulesPanelProps = {
  mode?: 'all' | 'mine'
  /** Admin "Ver como": aplica o escopo CSD deste usuário no Consultar. */
  scopeUserId?: string
}

type EnvelopePreview = {
  src: string
  meter: string
}

export function FieldTeamConsultarPanel({
  mode = 'all',
  scopeUserId,
}: FieldTeamSchedulesPanelProps) {
  const [schedules, setSchedules] = useState<MeterScheduleRecord[]>([])
  const [loading, setLoading] = useState(true)
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

  return (
    <div className="entrada-panel">
      {isMine ? null : (
        <p className="entrada-panel-intro">
          Consulta dos medidores agendados. Perfis Ponto Focal veem apenas os agendamentos
          dos CSDs (localidades) atribuídos a eles.
        </p>
      )}

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
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
                <th>Data agendada</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((item) => (
                <tr key={item.id}>
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
                  <td>
                    {item.partnerName
                      ? `${item.partnerName}${
                          item.partnerRegistration ? ` (${item.partnerRegistration})` : ''
                        }`
                      : '—'}
                  </td>
                  <td>{item.scheduledAtLabel || '—'}</td>
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
