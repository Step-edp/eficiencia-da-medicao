import { createPortal } from 'react-dom'

type LoginFeedbackProps = {
  type: 'success' | 'error'
  message: string
  /** Exibe o aviso fixo na área visível da tela (toast). */
  fixed?: boolean
  /** Botão fechar. Em avisos fixos, sucesso e erro podem ser fechados. */
  onClose?: () => void
}

export function LoginFeedback({ type, message, onClose, fixed = true }: LoginFeedbackProps) {
  const canDismiss =
    typeof onClose === 'function' && (fixed || type === 'success')

  const content = (
    <div
      className={`login-feedback ${type}${canDismiss ? ' has-dismiss' : ''}${fixed ? ' is-fixed' : ''}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      <span className="login-feedback-message">{message}</span>
      {canDismiss ? (
        <button
          type="button"
          className="notice-dismiss"
          aria-label="Fechar aviso"
          onClick={onClose}
        >
          ×
        </button>
      ) : null}
    </div>
  )

  if (fixed) {
    return createPortal(content, document.body)
  }

  return content
}
