type LoginFeedbackProps = {
  type: 'success' | 'error'
  message: string
  /** Só avisos de sucesso mostram o botão fechar. */
  onClose?: () => void
}

export function LoginFeedback({ type, message, onClose }: LoginFeedbackProps) {
  const canDismiss = type === 'success' && typeof onClose === 'function'

  return (
    <div
      className={`login-feedback ${type}${canDismiss ? ' has-dismiss' : ''}`}
      role={type === 'error' ? 'alert' : 'status'}
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
}
