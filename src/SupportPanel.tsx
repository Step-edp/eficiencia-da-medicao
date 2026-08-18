import { FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ApiError, type SupportTicketRecord } from './api'

function statusLabel(status: SupportTicketRecord['status']) {
  if (status === 'respondido') return 'Respondido'
  if (status === 'fechado') return 'Fechado'
  return 'Aberto'
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR')
}

type SupportPanelProps = {
  onOpenCountChange?: (count: number) => void
  readOnly?: boolean
}

export function SupportPanel({ onOpenCountChange, readOnly = false }: SupportPanelProps) {
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const notifyOpenCount = useCallback(
    (rows: SupportTicketRecord[]) => {
      onOpenCountChange?.(rows.filter((ticket) => ticket.status === 'aberto').length)
    },
    [onOpenCountChange],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { tickets: rows } = await api.listSupportTickets()
      setTickets(rows)
      notifyOpenCount(rows)
    } catch {
      setTickets([])
      notifyOpenCount([])
      setFeedback({
        type: 'error',
        message: 'Não foi possível carregar as solicitações de suporte.',
      })
    } finally {
      setLoading(false)
    }
  }, [notifyOpenCount])

  useEffect(() => {
    void load()
  }, [load])

  const handleReply = async (ticket: SupportTicketRecord, event: FormEvent) => {
    event.preventDefault()
    const response = (replyDrafts[ticket.id] ?? '').trim()
    if (!response) {
      setFeedback({ type: 'error', message: 'Escreva a resposta antes de enviar.' })
      return
    }

    setReplyingId(ticket.id)
    setFeedback(null)

    try {
      const { ticket: updated } = await api.replySupportTicket(ticket.id, { response })
      setTickets((prev) => {
        const next = prev.map((item) => (item.id === updated.id ? updated : item))
        notifyOpenCount(next)
        return next
      })
      setReplyDrafts((prev) => ({ ...prev, [ticket.id]: '' }))
      setFeedback({
        type: 'success',
        message: `Resposta registrada no chamado ${updated.ticketNumber}.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível enviar a resposta.',
      })
    } finally {
      setReplyingId(null)
    }
  }

  return (
    <div className="support-panel">
      <p className="csds-form-hint">
        Solicitações abertas pelo card Suporte na home ou pela tela de login. Expanda um
        chamado para ver os detalhes, WhatsApp do solicitante e responder.
      </p>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">Carregando solicitações...</p>
      ) : tickets.length === 0 ? (
        <p className="entrada-panel-empty">Nenhuma solicitação de suporte no momento.</p>
      ) : (
        <div className="support-ticket-list">
          {tickets.map((ticket) => {
            const expanded = expandedId === ticket.id
            return (
              <article
                key={ticket.id}
                className={`support-ticket-card${expanded ? ' is-expanded' : ' is-collapsed'}`}
              >
                <button
                  type="button"
                  className="support-ticket-summary"
                  aria-expanded={expanded}
                  onClick={() =>
                    setExpandedId((current) => (current === ticket.id ? null : ticket.id))
                  }
                >
                  <span className="support-ticket-summary-main">
                    <strong className="support-ticket-number">{ticket.ticketNumber}</strong>
                    <span
                      className={`gestao-cell-status-badge ${
                        ticket.status === 'respondido' ? 'is-ativa' : 'is-pendente'
                      } support-ticket-status`}
                    >
                      {statusLabel(ticket.status)}
                    </span>
                    <span className="support-ticket-summary-requester">
                      {ticket.requesterName}
                    </span>
                  </span>
                  <span className="support-ticket-summary-side">
                    <span className="support-ticket-meta">
                      {formatDateTime(ticket.createdAt)}
                    </span>
                    <span className="support-ticket-toggle" aria-hidden="true">
                      {expanded ? '▾' : '▸'}
                    </span>
                  </span>
                </button>

                {expanded ? (
                  <div className="support-ticket-body">
                    {ticket.subject ? (
                      <p className="support-ticket-subject">{ticket.subject}</p>
                    ) : null}
                    <p className="support-ticket-requester">
                      {ticket.requesterName}
                      {ticket.requesterRegistration
                        ? ` (${ticket.requesterRegistration})`
                        : ''}
                    </p>
                    {ticket.requesterWhatsapp ? (
                      <p className="support-ticket-meta">
                        WhatsApp: {ticket.requesterWhatsapp}
                      </p>
                    ) : null}
                    <p className="support-ticket-message">{ticket.message}</p>

                    {ticket.response ? (
                      <div className="support-ticket-response">
                        <strong>Resposta</strong>
                        <p>{ticket.response}</p>
                        <span className="support-ticket-meta">
                          {ticket.respondedByName || 'Equipe'}
                          {ticket.respondedAt
                            ? ` · ${formatDateTime(ticket.respondedAt)}`
                            : ''}
                        </span>
                      </div>
                    ) : null}

                    {readOnly ? null : (
                      <form
                        className="support-ticket-reply-form"
                        onSubmit={(event) => void handleReply(ticket, event)}
                      >
                        <label>
                          {ticket.response ? 'Atualizar resposta' : 'Responder'}
                          <textarea
                            value={replyDrafts[ticket.id] ?? ''}
                            onChange={(event) =>
                              setReplyDrafts((prev) => ({
                                ...prev,
                                [ticket.id]: event.target.value,
                              }))
                            }
                            rows={3}
                            placeholder="Escreva a resposta para o solicitante..."
                          />
                        </label>
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={replyingId === ticket.id}
                        >
                          {replyingId === ticket.id ? 'Enviando...' : 'Enviar resposta'}
                        </button>
                      </form>
                    )}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
