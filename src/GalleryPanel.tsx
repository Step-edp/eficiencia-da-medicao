import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, type MeterScheduleRecord, type RatmLaudoRecord } from './api'

type GalleryItem = {
  id: string
  photo: string
  meter: string
  toi: string
  installation: string
  note: string
  client: string
  user: string
  sourceLabel: string
}

function includesText(value: string, query: string) {
  if (!query.trim()) return true
  return value.toLowerCase().includes(query.trim().toLowerCase())
}

function photosFromLaudo(laudo: RatmLaudoRecord): string[] {
  const raw = laudo.formData?.photos
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (photo): photo is string =>
      typeof photo === 'string' && photo.startsWith('data:image/'),
  )
}

function buildItems(
  schedules: MeterScheduleRecord[],
  laudos: RatmLaudoRecord[],
): GalleryItem[] {
  const fromSchedules = schedules
    .filter((item) => item.envelopePhoto?.startsWith('data:image/'))
    .map((item) => ({
      id: `schedule-${item.id}`,
      photo: item.envelopePhoto || '',
      meter: item.meter || '',
      toi: item.toi || '',
      installation: item.installation || '',
      note: item.note || '',
      client: '',
      user:
        item.createdByRegistration ||
        item.partnerRegistration ||
        item.partnerName ||
        '',
      sourceLabel: 'Invólucro',
    }))

  const fromLaudos = laudos.flatMap((laudo) =>
    photosFromLaudo(laudo).map((photo, index) => ({
      id: `ratm-${laudo.id}-${index}`,
      photo,
      meter: laudo.meter || '',
      toi: '',
      installation: '',
      note: '',
      client: laudo.client || '',
      user: '',
      sourceLabel: `RATM ${laudo.ratmNumber} · Foto ${index + 1}`,
    })),
  )

  return [...fromSchedules, ...fromLaudos]
}

export function GalleryPanel() {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )
  const [preview, setPreview] = useState<GalleryItem | null>(null)

  const [meterFilter, setMeterFilter] = useState('')
  const [toiFilter, setToiFilter] = useState('')
  const [installationFilter, setInstallationFilter] = useState('')
  const [noteFilter, setNoteFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const [{ schedules }, { laudos }] = await Promise.all([
        api.listMeterSchedules(undefined, { gallery: true }),
        api.listRatmLaudos(),
      ])
      setItems(buildItems(schedules, laudos))
    } catch (error) {
      setItems([])
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar as fotos da galeria.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          includesText(item.meter, meterFilter) &&
          includesText(item.toi, toiFilter) &&
          includesText(item.installation, installationFilter) &&
          includesText(item.note, noteFilter) &&
          includesText(item.client, clientFilter) &&
          includesText(item.user, userFilter),
      ),
    [
      items,
      meterFilter,
      toiFilter,
      installationFilter,
      noteFilter,
      clientFilter,
      userFilter,
    ],
  )

  return (
    <div className="gallery-panel">
      <p className="csds-form-hint">
        Fotos de invólucro dos agendamentos e fotos dos ensaios RATM do laboratório de
        medidores.
      </p>

      <div className="gallery-filters">
        <label>
          Medidor
          <input
            type="text"
            value={meterFilter}
            onChange={(event) => setMeterFilter(event.target.value)}
            placeholder="Número do medidor"
          />
        </label>
        <label>
          TOI
          <input
            type="text"
            value={toiFilter}
            onChange={(event) => setToiFilter(event.target.value)}
            placeholder="Número do TOI"
          />
        </label>
        <label>
          Instalação
          <input
            type="text"
            value={installationFilter}
            onChange={(event) => setInstallationFilter(event.target.value)}
            placeholder="Instalação"
          />
        </label>
        <label>
          Nota
          <input
            type="text"
            value={noteFilter}
            onChange={(event) => setNoteFilter(event.target.value)}
            placeholder="Nota"
          />
        </label>
        <label>
          Cliente
          <input
            type="text"
            value={clientFilter}
            onChange={(event) => setClientFilter(event.target.value)}
            placeholder="Cliente"
          />
        </label>
        <label>
          Usuário
          <input
            type="text"
            value={userFilter}
            onChange={(event) => setUserFilter(event.target.value)}
            placeholder="Matrícula ou nome"
          />
        </label>
      </div>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">Carregando fotos...</p>
      ) : filtered.length === 0 ? (
        <p className="entrada-panel-empty">Nenhuma foto encontrada com esses filtros.</p>
      ) : (
        <div className="gallery-grid" aria-label="Galeria de fotos do laboratório">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className="gallery-card"
              onClick={() => setPreview(item)}
            >
              <img src={item.photo} alt={`Foto do medidor ${item.meter || 'sem número'}`} />
              <div className="gallery-card-meta">
                <strong>{item.meter || 'Sem medidor'}</strong>
                <span>{item.sourceLabel}</span>
                {item.toi ? <span>TOI {item.toi}</span> : null}
                {item.client ? <span>{item.client}</span> : null}
              </div>
            </button>
          ))}
        </div>
      )}

      {preview
        ? createPortal(
            <div
              className="envelope-photo-lightbox"
              role="presentation"
              onClick={() => setPreview(null)}
            >
              <div
                className="envelope-photo-lightbox-dialog gallery-lightbox-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Ampliar foto da galeria"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="secondary-button compact-button"
                  onClick={() => setPreview(null)}
                >
                  Fechar
                </button>
                <img
                  className="envelope-photo-lightbox-image"
                  src={preview.photo}
                  alt={`Foto ampliada do medidor ${preview.meter || ''}`}
                />
                <dl className="gallery-lightbox-details">
                  <div>
                    <dt>Medidor</dt>
                    <dd>{preview.meter || '—'}</dd>
                  </div>
                  <div>
                    <dt>TOI</dt>
                    <dd>{preview.toi || '—'}</dd>
                  </div>
                  <div>
                    <dt>Instalação</dt>
                    <dd>{preview.installation || '—'}</dd>
                  </div>
                  <div>
                    <dt>Nota</dt>
                    <dd>{preview.note || '—'}</dd>
                  </div>
                  <div>
                    <dt>Cliente</dt>
                    <dd>{preview.client || '—'}</dd>
                  </div>
                  <div>
                    <dt>Usuário</dt>
                    <dd>{preview.user || '—'}</dd>
                  </div>
                  <div>
                    <dt>Origem</dt>
                    <dd>{preview.sourceLabel}</dd>
                  </div>
                </dl>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
