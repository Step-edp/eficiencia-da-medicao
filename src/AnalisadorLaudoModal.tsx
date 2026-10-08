import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, type AnalisadorTensaoRecord } from './api'

type AnalisadorLaudoModalProps = {
  analisador: AnalisadorTensaoRecord | null
  ensaioId?: string | null
  onClose: () => void
}

export function AnalisadorLaudoModal({
  analisador,
  ensaioId = null,
  onClose,
}: AnalisadorLaudoModalProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [filename, setFilename] = useState('Certificado_calibracao.pdf')

  useEffect(() => {
    if (!analisador) return
    let active = true
    let objectUrl: string | null = null
    setLoading(true)
    setError(null)
    setPdfUrl(null)

    api
      .fetchAnalisadorLaudo(analisador.id, ensaioId)
      .then(({ blob, filename: downloadedName }) => {
        const url = URL.createObjectURL(blob)
        if (!active) {
          URL.revokeObjectURL(url)
          return
        }
        objectUrl = url
        setPdfUrl(url)
        setFilename(downloadedName)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o laudo.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [analisador, ensaioId])

  useEffect(() => {
    if (!analisador) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [analisador, onClose])

  if (!analisador) return null

  const handleDownload = () => {
    if (!pdfUrl) return
    const link = document.createElement('a')
    link.href = pdfUrl
    link.download = filename
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="ensaios-block-modal analisador-laudo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analisador-laudo-modal-title"
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

        <h3 id="analisador-laudo-modal-title">Certificado de calibração</h3>
        <p className="ensaios-block-modal-date">
          {analisador.identificacaoLaudo || 'Sem identificação de laudo'} · {analisador.numeroSerie}
        </p>

        {loading ? (
          <p className="entrada-panel-empty">Carregando laudo...</p>
        ) : error ? (
          <div className="login-feedback error" role="alert">
            {error}
          </div>
        ) : pdfUrl ? (
          <iframe className="laudo-pdf-frame" title="Certificado de calibração" src={pdfUrl} />
        ) : null}

        <div className="ensaios-block-modal-actions">
          {pdfUrl ? (
            <button type="button" className="primary-button" onClick={handleDownload}>
              Baixar laudo
            </button>
          ) : null}
          <button type="button" className="primary-button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
