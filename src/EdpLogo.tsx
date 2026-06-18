type EdpLogoProps = {
  className?: string
  compact?: boolean
}

export function EdpLogo({ className = '', compact = false }: EdpLogoProps) {
  return (
    <img
      className={`edp-logo ${compact ? 'edp-logo-compact' : ''} ${className}`.trim()}
      src="/edp-logo.svg"
      alt="EDP"
      draggable={false}
    />
  )
}
