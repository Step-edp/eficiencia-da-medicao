import { KeyboardEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type UserProfilePhotoProps = {
  name: string
  photoSrc?: string
  hasProfilePhoto?: boolean
  className?: string
  detail?: boolean
  alt?: string
  expandable?: boolean
}

export function UserProfilePhoto({
  name,
  photoSrc = '',
  hasProfilePhoto = false,
  className = 'profile-photo-thumb',
  detail = false,
  alt = '',
  expandable = true,
}: UserProfilePhotoProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  const imageClassName = detail ? 'profile-photo-detail' : className
  const imageAlt = alt || (detail ? `Foto de perfil de ${name}` : '')

  useEffect(() => {
    if (!previewOpen) return

    const listener = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewOpen(false)
      }
    }

    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [previewOpen])

  const openPreview = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    setPreviewOpen(true)
  }

  const handlePreviewKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openPreview(event)
    }
  }

  if (photoSrc) {
    const image = (
      <img className={imageClassName} src={photoSrc} alt={imageAlt} />
    )

    return (
      <>
        {expandable ? (
          <span
            role="button"
            tabIndex={0}
            className="profile-photo-expand-trigger"
            onClick={openPreview}
            onKeyDown={handlePreviewKeyDown}
            aria-label={`Ver foto de perfil de ${name} ampliada`}
            title="Clique para ampliar"
          >
            {image}
          </span>
        ) : (
          image
        )}

        {previewOpen
          ? createPortal(
              <div
                className="envelope-photo-lightbox"
                role="presentation"
                onClick={() => setPreviewOpen(false)}
              >
                <div
                  className="envelope-photo-lightbox-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-label={`Foto de perfil de ${name}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="icon-button schedule-slot-modal-close"
                    onClick={() => setPreviewOpen(false)}
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
                  <p className="envelope-photo-lightbox-caption">{name}</p>
                  <img
                    className="envelope-photo-lightbox-image"
                    src={photoSrc}
                    alt={`Foto ampliada de ${name}`}
                  />
                </div>
              </div>,
              document.body,
            )
          : null}
      </>
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
