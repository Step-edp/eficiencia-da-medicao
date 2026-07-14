type EdpLogoProps = {
  className?: string
  compact?: boolean
}

export function EdpLogo({ className = '', compact = false }: EdpLogoProps) {
  return (
    <img
      className={`edp-logo ${compact ? 'edp-logo-compact' : ''} ${className}`.trim()}
      src="/logo/Logso%20edp%20branca.png"
      alt="EDP"
      draggable={false}
    />
  )
}
