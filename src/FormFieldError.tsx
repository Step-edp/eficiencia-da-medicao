type FormFieldErrorProps = {
  id?: string
  message?: string
}

export function FormFieldError({ id, message }: FormFieldErrorProps) {
  if (!message) return null

  return (
    <span id={id} className="field-error" role="alert">
      {message}
    </span>
  )
}
