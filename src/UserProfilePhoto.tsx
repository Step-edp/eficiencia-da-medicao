type UserProfilePhotoProps = {
  name: string
  photoSrc?: string
  hasProfilePhoto?: boolean
  className?: string
  detail?: boolean
  alt?: string
}

export function UserProfilePhoto({
  name,
  photoSrc = '',
  hasProfilePhoto = false,
  className = 'profile-photo-thumb',
  detail = false,
  alt = '',
}: UserProfilePhotoProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?'

  if (photoSrc) {
    return (
      <img
        className={detail ? 'profile-photo-detail' : className}
        src={photoSrc}
        alt={alt || (detail ? `Foto de perfil de ${name}` : '')}
      />
    )
  }

  if (hasProfilePhoto) {
    return (
      <span
        className={`profile-photo-placeholder${detail ? ' profile-photo-placeholder-detail' : ''}`}
        aria-hidden="true"
        title="Carregando foto..."
      >
        ···
      </span>
    )
  }

  return (
    <span className="profile-photo-placeholder" aria-hidden="true">
      {initial}
    </span>
  )
}
