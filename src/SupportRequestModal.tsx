import { FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError } from './api'

type SupportRequestModalProps = {
  open: boolean
  onClose: () => void
}

export function SupportRequestModal({ open, onClose }: SupportRequestModalProps) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ticketNumber, setTicketNumber] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSubject('')
    setMessage('')
    setError(null)
    setTicketNumber(null)
    setSubmitting(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!message.trim()) {
      setError('Descreva sua solicitação.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const { ticket } = await api.createSupportTicket({
        subject: subject.trim(),
        message: message.trim(),
      })
      setTicketNumber(ticket.ticketNumber)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível enviar a solicitação.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="ensaios-block-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="ensaios-block-modal support-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-modal-title"
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

        <h3 id="support-modal-title">Suporte</h3>

        {ticketNumber ? (
          <>
            <div className="login-feedback success" role="status">
              Solicitação enviada. Seu número de chamado é{' '}
              <strong>{ticketNumber}</strong>.
            </div>
            <p className="csds-form-hint">
              Guarde este número. A equipe do Laboratório de Medição poderá
              responder pelo menu Suporte.
            </p>
            <div className="ensaios-block-modal-actions">
              <button type="button" className="primary-button" onClick={onClose}>
                Fechar
              </button>
            </div>
          </>
        ) : (
          <form className="support-request-form" onSubmit={(event) => void handleSubmit(event)}>
            <p className="csds-form-hint">
              Descreva sua dúvida ou problema. Após enviar, você receberá um
              número de chamado.
            </p>

            <label>
              Assunto
              <input
                type="text"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Ex.: Erro ao agendar TOI"
                maxLength={120}
              />
            </label>

            <label>
              Solicitação
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Descreva o que precisa com o máximo de detalhes possível."
                rows={5}
                required
              />
            </label>

            {error ? (
              <div className="login-feedback error" role="alert">
                {error}
              </div>
            ) : null}

            <div className="ensaios-block-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
                disabled={submitting}
              >
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={submitting}>
                {submitting ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
