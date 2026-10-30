import { FormEvent, PointerEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  api,
  ApiError,
  type GcDestinacaoRecord,
  type GcEnsaioMeter,
  type GcEnsaioRecord,
  type GcLaudo,
} from './api'
import { formatAuditDate } from './auditLabels'
import { readFileAsBase64 } from './fileUtils'
import { LoginFeedback } from './LoginFeedback'

type Tab = 'ensaios' | 'destinacao'
type PhotoKind = 'medidor' | 'tampa' | 'extra'
type Feedback = { type: 'success' | 'error'; message: string }

const PHOTO_SLOTS: { kind: PhotoKind; label: string }[] = [
  { kind: 'medidor', label: 'Medidor' },
  { kind: 'tampa', label: 'Medidor com a tampa' },
  { kind: 'extra', label: 'Foto extra' },
]

const STATUS_LABEL: Record<GcDestinacaoRecord['withdrawalStatus'], string> = {
  disponivel: 'Disponível',
  aguardando_sab: 'Aguardando SAB',
  retirada: 'Retirada',
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

function formatWhen(value: string | null) {
  return value ? formatAuditDate(value) : '—'
}

async function compressImage(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Não foi possível ler a foto.'))
      element.src = url
    })
    const maxSide = 1400
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Não foi possível preparar a foto.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.72)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function printLaudo(laudo: GcLaudo) {
  const photos = PHOTO_SLOTS.map((slot) => {
    const photo = laudo.photos.find((item) => item.kind === slot.kind)
    return photo
      ? `<figure><img src="${photo.dataUrl}" alt="${escapeHtml(slot.label)}" /><figcaption>${escapeHtml(slot.label)}</figcaption></figure>`
      : `<figure><figcaption>${escapeHtml(slot.label)} — sem foto</figcaption></figure>`
  }).join('')
  const tests = laudo.tests
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.test)}</td><td>${escapeHtml(item.energy)}</td><td>${escapeHtml(item.value)}</td></tr>`,
    )
    .join('')
  const popup = window.open('', '_blank')
  if (!popup) return
  popup.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" /><title>Laudo ${escapeHtml(laudo.meter)}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #142033; margin: 24px; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #d5deea; padding: 6px 8px; text-align: left; font-size: 13px; }
      .photos { display: flex; gap: 12px; margin-top: 16px; }
      figure { margin: 0; flex: 1; }
      img { width: 100%; max-height: 280px; object-fit: contain; background: #f4f7fb; }
      figcaption { font-size: 12px; margin-top: 4px; }
    </style></head><body>
    <p>Laboratório de Medição · Grandes Clientes</p>
    <h1>Laudo do medidor ${escapeHtml(laudo.meter)}</h1>
    <p>${escapeHtml(laudo.title)}</p>
    <p>Operador: ${escapeHtml(laudo.operatorName || '—')} · Nome do medidor: ${escapeHtml(laudo.meterName || '—')} · Validação: ${escapeHtml(laudo.validation || '—')}</p>
    <p>Lacre 1: ${escapeHtml(laudo.seal1 || '—')} · Lacre 2: ${escapeHtml(laudo.seal2 || '—')}</p>
    <table><thead><tr><th>Teste</th><th>Energia</th><th>Resultado</th></tr></thead><tbody>${tests || '<tr><td colspan="3">Sem pontos de teste.</td></tr>'}</tbody></table>
    <div class="photos">${photos}</div>
    </body></html>`)
  popup.document.close()
  popup.focus()
  popup.print()
}

function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string, hasInk: boolean) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const ink = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = '#102033'
    context.lineWidth = 2.2
    context.lineCap = 'round'
  }, [])

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    canvas.setPointerCapture(event.pointerId)
    drawing.current = true
    const cursor = point(event)
    context.beginPath()
    context.moveTo(cursor.x, cursor.y)
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const cursor = point(event)
    context.lineTo(cursor.x, cursor.y)
    context.stroke()
    ink.current = true
    onChange(canvas.toDataURL('image/png'), true)
  }

  function end() {
    drawing.current = false
  }

  function clear() {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    ink.current = false
    onChange('', false)
  }

  return (
    <div className="gc-signature">
      <canvas
        ref={canvasRef}
        width={640}
        height={160}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <button type="button" className="secondary-button" onClick={clear}>
        Limpar assinatura
      </button>
    </div>
  )
}

export function GrandesClientesPanel({
  readOnly = false,
  signerName,
  canReleaseSab = false,
  initialTab = 'ensaios',
}: {
  readOnly?: boolean
  signerName: string
  canReleaseSab?: boolean
  initialTab?: Tab
}) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [ensaios, setEnsaios] = useState<GcEnsaioRecord[]>([])
  const [ensaiosLoading, setEnsaiosLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ensaioTitle, setEnsaioTitle] = useState('')
  const [medidores, setMedidores] = useState<GcEnsaioMeter[]>([])
  const [meterSearch, setMeterSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [sealsOpen, setSealsOpen] = useState(false)
  const [photoMeter, setPhotoMeter] = useState<GcEnsaioMeter | null>(null)
  const [laudo, setLaudo] = useState<GcLaudo | null>(null)
  const [laudoLoading, setLaudoLoading] = useState(false)
  const [destinacoes, setDestinacoes] = useState<GcDestinacaoRecord[]>([])
  const [destinacoesLoading, setDestinacoesLoading] = useState(false)
  const [destSearch, setDestSearch] = useState('')
  const [importDestOpen, setImportDestOpen] = useState(false)
  const [signTarget, setSignTarget] = useState<GcDestinacaoRecord | null>(null)
  const [releaseTarget, setReleaseTarget] = useState<GcDestinacaoRecord | null>(null)
  const [termo, setTermo] = useState<GcDestinacaoRecord | null>(null)

  async function loadEnsaios(preferId?: string) {
    setEnsaiosLoading(true)
    try {
      const response = await api.listGcEnsaios()
      setEnsaios(response.ensaios)
      const nextId = preferId ?? selectedId ?? response.ensaios[0]?.id ?? null
      setSelectedId(nextId)
      if (nextId) await loadEnsaio(nextId)
      else {
        setMedidores([])
        setEnsaioTitle('')
      }
    } catch (error) {
      setFeedback({ type: 'error', message: errorMessage(error, 'Não foi possível carregar os ensaios.') })
    } finally {
      setEnsaiosLoading(false)
    }
  }

  async function loadEnsaio(id: string) {
    const response = await api.getGcEnsaio(id)
    setEnsaioTitle(response.ensaio.title)
    setMedidores(response.medidores)
  }

  async function loadDestinacoes(q = destSearch) {
    setDestinacoesLoading(true)
    try {
      const response = await api.listGcDestinacoes(q)
      setDestinacoes(response.destinacoes)
    } catch (error) {
      setFeedback({
        type: 'error',
        message: errorMessage(error, 'Não foi possível carregar a destinação.'),
      })
    } finally {
      setDestinacoesLoading(false)
    }
  }

  useEffect(() => {
    void loadEnsaios()
    // The first load selects the latest assay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (tab !== 'destinacao') return
    const timer = window.setTimeout(() => {
      void loadDestinacoes(destSearch)
    }, 250)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, destSearch])

  const visibleMeters = medidores.filter((item) => {
    const needle = meterSearch.trim().toLowerCase()
    if (!needle) return true
    return (
      item.meter.includes(needle) ||
      item.meterName.toLowerCase().includes(needle) ||
      item.seal1.toLowerCase().includes(needle) ||
      item.seal2.toLowerCase().includes(needle)
    )
  })

  async function openLaudo(meter: GcEnsaioMeter) {
    if (!selectedId) return
    setLaudoLoading(true)
    setLaudo(null)
    try {
      const response = await api.getGcLaudo(selectedId, meter.id)
      setLaudo(response.laudo)
    } catch (error) {
      setFeedback({ type: 'error', message: errorMessage(error, 'Não foi possível abrir o laudo.') })
    } finally {
      setLaudoLoading(false)
    }
  }

  return (
    <div className="gc-panel">
      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}
      <div className="panel-switch" role="tablist" aria-label="Grandes Clientes">
        <button type="button" className={tab === 'ensaios' ? 'active' : ''} onClick={() => setTab('ensaios')}>
          Ensaios
        </button>
        <button
          type="button"
          className={tab === 'destinacao' ? 'active' : ''}
          onClick={() => setTab('destinacao')}
        >
          Destinação
        </button>
      </div>

      {tab === 'ensaios' ? (
        <section className="gc-section">
          <div className="consultar-toolbar">
            <p>
              Cada medidor da planilha de ensaio vira um laudo, com os lacres do mesmo número e as fotos do medidor,
              da tampa e uma extra.
            </p>
            {readOnly ? null : (
              <div className="consultar-toolbar-end">
                <button type="button" className="secondary-button" onClick={() => setSealsOpen(true)}>
                  Importar lacres
                </button>
                <button type="button" className="primary-button" onClick={() => setImportOpen(true)}>
                  Registrar ensaio
                </button>
              </div>
            )}
          </div>
          <div className="gc-layout">
            <div className="gc-batch-list">
              {ensaiosLoading && ensaios.length === 0 ? <p>Carregando ensaios...</p> : null}
              {!ensaiosLoading && ensaios.length === 0 ? (
                <p>Nenhum ensaio registrado. Importe a planilha da bancada para criar um laudo por medidor.</p>
              ) : null}
              {ensaios.map((ensaio) => (
                <button
                  key={ensaio.id}
                  type="button"
                  className={`gc-batch${ensaio.id === selectedId ? ' is-selected' : ''}`}
                  onClick={() => {
                    setSelectedId(ensaio.id)
                    void loadEnsaio(ensaio.id).catch((error) => {
                      setFeedback({
                        type: 'error',
                        message: errorMessage(error, 'Não foi possível abrir o ensaio.'),
                      })
                    })
                  }}
                >
                  <strong>{ensaio.title || 'Ensaio'}</strong>
                  <span>
                    {ensaio.meterCount} medidor(es) · {formatWhen(ensaio.createdAt)}
                  </span>
                  <span>{ensaio.operatorName || ensaio.createdByName || ensaio.sourceFile}</span>
                </button>
              ))}
            </div>
            <div className="gc-meters">
              <div className="consultar-toolbar">
                <input
                  type="search"
                  value={meterSearch}
                  onChange={(event) => setMeterSearch(event.target.value)}
                  placeholder="Pesquisar medidor ou lacre"
                  aria-label="Pesquisar medidor ou lacre"
                />
              </div>
              {selectedId ? <h3>{ensaioTitle || 'Medidores do ensaio'}</h3> : null}
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Medidor</th>
                      <th>Nome</th>
                      <th>Lacre 1</th>
                      <th>Lacre 2</th>
                      <th>Fotos</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMeters.map((meter) => (
                      <tr key={meter.id}>
                        <td>{meter.meter}</td>
                        <td>{meter.meterName || '—'}</td>
                        <td>{meter.seal1 || '—'}</td>
                        <td>{meter.seal2 || '—'}</td>
                        <td>
                          {meter.photos.length
                            ? `${meter.photos.length} de 3`
                            : 'Sem fotos'}
                        </td>
                        <td className="gc-row-actions">
                          {readOnly ? null : (
                            <button type="button" className="secondary-button" onClick={() => setPhotoMeter(meter)}>
                              Fotos
                            </button>
                          )}
                          <button type="button" className="primary-button" onClick={() => void openLaudo(meter)}>
                            Laudo
                          </button>
                        </td>
                      </tr>
                    ))}
                    {selectedId && visibleMeters.length === 0 ? (
                      <tr>
                        <td colSpan={6}>Nenhum medidor encontrado neste ensaio.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="gc-section">
          <div className="consultar-toolbar">
            <input
              type="search"
              value={destSearch}
              onChange={(event) => setDestSearch(event.target.value)}
              placeholder="Pesquisar cliente, medidor ou cidade"
              aria-label="Pesquisar destinação"
            />
            {readOnly ? null : (
              <div className="consultar-toolbar-end">
                <button type="button" className="primary-button" onClick={() => setImportDestOpen(true)}>
                  Importar destinação
                </button>
              </div>
            )}
          </div>
          <p className="gc-note">
            A planilha fica no histórico. Para retirar o medidor, alguém assina o termo e outro usuário de Grandes
            Clientes (SAB) libera a retirada.
          </p>
          {destinacoesLoading && destinacoes.length === 0 ? <p>Carregando histórico...</p> : null}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Medidor</th>
                  <th>Cidade</th>
                  <th>Calibrado em</th>
                  <th>Situação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {destinacoes.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.clientName || '—'}</strong>
                      <span className="gc-sub">
                        {item.installation ? `Instalação ${item.installation}` : ''}
                        {item.withdrawnByNote ? ` · Planilha: ${item.withdrawnByNote}` : ''}
                      </span>
                    </td>
                    <td>{item.meter}</td>
                    <td>{item.city || '—'}</td>
                    <td>{item.calibratedOn || '—'}</td>
                    <td>
                      <span className={`gc-status gc-status-${item.withdrawalStatus}`}>
                        {STATUS_LABEL[item.withdrawalStatus]}
                      </span>
                      {item.signerName ? <span className="gc-sub">Assinado por {item.signerName}</span> : null}
                      {item.releasedByName ? (
                        <span className="gc-sub">Liberado por {item.releasedByName}</span>
                      ) : null}
                    </td>
                    <td className="gc-row-actions">
                      {item.withdrawalStatus === 'disponivel' && !readOnly ? (
                        <button type="button" className="primary-button" onClick={() => setSignTarget(item)}>
                          Assinar termo
                        </button>
                      ) : null}
                      {item.withdrawalStatus === 'aguardando_sab' && canReleaseSab ? (
                        <button type="button" className="primary-button" onClick={() => setReleaseTarget(item)}>
                          Liberar retirada
                        </button>
                      ) : null}
                      {item.withdrawalStatus === 'aguardando_sab' && !canReleaseSab ? (
                        <span className="gc-sub">Aguardando liberação da SAB</span>
                      ) : null}
                      {item.hasSignature ? (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            void api
                              .getGcDestinacao(item.id)
                              .then((response) => setTermo(response.destinacao))
                              .catch((error) => {
                                setFeedback({
                                  type: 'error',
                                  message: errorMessage(error, 'Não foi possível abrir o termo.'),
                                })
                              })
                          }}
                        >
                          Ver termo
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!destinacoesLoading && destinacoes.length === 0 ? (
                  <tr>
                    <td colSpan={6}>Nenhuma destinação importada.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {importOpen ? (
        <ImportAssayModal
          onClose={() => setImportOpen(false)}
          onDone={async (message, id) => {
            setImportOpen(false)
            setFeedback({ type: 'success', message })
            await loadEnsaios(id)
          }}
          onError={(message) => setFeedback({ type: 'error', message })}
        />
      ) : null}
      {sealsOpen ? (
        <ImportFileModal
          title="Importar lacres"
          description="A planilha de lacres é separada do ensaio. Os lacres entram no laudo pelo número do medidor."
          acceptLabel="Planilha de lacres"
          submitLabel="Importar lacres"
          onClose={() => setSealsOpen(false)}
          onSubmit={async (file) => {
            const dataUrl = await readFileAsBase64(file)
            const response = await api.importGcLacres({
              fileName: file.name,
              fileBase64: dataUrl,
            })
            setSealsOpen(false)
            setFeedback({
              type: 'success',
              message: `${response.sealCount} medidor(es) com lacre atualizados.`,
            })
            if (selectedId) await loadEnsaio(selectedId)
          }}
          onError={(message) => setFeedback({ type: 'error', message })}
        />
      ) : null}
      {photoMeter && selectedId ? (
        <PhotoModal
          meter={photoMeter}
          ensaioId={selectedId}
          onClose={() => setPhotoMeter(null)}
          onSaved={async () => {
            setPhotoMeter(null)
            setFeedback({ type: 'success', message: `Fotos do medidor ${photoMeter.meter} salvas no laudo.` })
            await loadEnsaio(selectedId)
          }}
          onError={(message) => setFeedback({ type: 'error', message })}
        />
      ) : null}
      {laudo || laudoLoading
        ? createPortal(
            <div className="ensaios-block-modal-overlay" role="presentation" onClick={() => setLaudo(null)}>
              <div
                className="ensaios-block-modal gc-wide-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="gc-laudo-title"
                onClick={(event) => event.stopPropagation()}
              >
                <button type="button" className="icon-button schedule-slot-modal-close" onClick={() => setLaudo(null)} aria-label="Fechar">
                  ×
                </button>
                {laudoLoading || !laudo ? (
                  <p>Abrindo laudo...</p>
                ) : (
                  <LaudoView laudo={laudo} />
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
      {importDestOpen ? (
        <ImportFileModal
          title="Importar destinação"
          description="Cada linha entra no histórico com o cliente e o medidor. Uma nova importação não apaga as anteriores."
          acceptLabel="Planilha de destinação"
          submitLabel="Importar para o histórico"
          onClose={() => setImportDestOpen(false)}
          onSubmit={async (file) => {
            const dataUrl = await readFileAsBase64(file)
            const response = await api.importGcDestinacoes({
              fileName: file.name,
              fileBase64: dataUrl,
            })
            setImportDestOpen(false)
            setFeedback({
              type: 'success',
              message: `${response.count} medidor(es) incluídos no histórico de destinação.`,
            })
            await loadDestinacoes('')
            setDestSearch('')
          }}
          onError={(message) => setFeedback({ type: 'error', message })}
        />
      ) : null}
      {signTarget ? (
        <SignTermModal
          item={signTarget}
          defaultName={signerName}
          onClose={() => setSignTarget(null)}
          onDone={async () => {
            const meter = signTarget.meter
            setSignTarget(null)
            setFeedback({
              type: 'success',
              message: `Termo do medidor ${meter} assinado. A retirada aguarda a liberação da SAB.`,
            })
            await loadDestinacoes()
          }}
          onError={(message) => setFeedback({ type: 'error', message })}
        />
      ) : null}
      {releaseTarget ? (
        <ReleaseModal
          item={releaseTarget}
          onClose={() => setReleaseTarget(null)}
          onDone={async () => {
            const meter = releaseTarget.meter
            setReleaseTarget(null)
            setFeedback({ type: 'success', message: `Retirada do medidor ${meter} liberada.` })
            await loadDestinacoes()
          }}
          onError={(message) => setFeedback({ type: 'error', message })}
        />
      ) : null}
      {termo
        ? createPortal(
            <div className="ensaios-block-modal-overlay" role="presentation" onClick={() => setTermo(null)}>
              <div
                className="ensaios-block-modal gc-wide-modal"
                role="dialog"
                aria-modal="true"
                onClick={(event) => event.stopPropagation()}
              >
                <button type="button" className="icon-button schedule-slot-modal-close" onClick={() => setTermo(null)} aria-label="Fechar">
                  ×
                </button>
                <h3>Termo de retirada</h3>
                <p>
                  Medidor {termo.meter}
                  {termo.clientName ? ` · ${termo.clientName}` : ''}
                </p>
                <p>
                  Assinado por {termo.signerName || '—'} em {formatWhen(termo.signedAt)}.
                  {termo.releasedByName
                    ? ` Liberado por ${termo.releasedByName} em ${formatWhen(termo.releasedAt)}.`
                    : ' Aguardando liberação da SAB.'}
                </p>
                {termo.signatureData ? (
                  <img className="gc-signature-preview" src={termo.signatureData} alt="Assinatura do termo" />
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function LaudoView({ laudo }: { laudo: GcLaudo }) {
  return (
    <div className="laudo-sheet gc-laudo">
      <p className="gc-laudo-kicker">Laboratório de Medição · Grandes Clientes</p>
      <h3 id="gc-laudo-title">Laudo do medidor {laudo.meter}</h3>
      <p>{laudo.title}</p>
      <p>
        Operador: {laudo.operatorName || '—'} · Nome: {laudo.meterName || '—'} · Validação:{' '}
        {laudo.validation || '—'}
      </p>
      <p>
        Lacre 1: {laudo.seal1 || 'não informado'} · Lacre 2: {laudo.seal2 || 'não informado'}
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Teste</th>
              <th>Energia</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {laudo.tests.map((item, index) => (
              <tr key={`${item.test}-${index}`}>
                <td>{item.test}</td>
                <td>{item.energy || '—'}</td>
                <td>{item.value}</td>
              </tr>
            ))}
            {laudo.tests.length === 0 ? (
              <tr>
                <td colSpan={3}>A planilha não trouxe pontos de teste para este medidor.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="gc-photo-grid">
        {PHOTO_SLOTS.map((slot) => {
          const photo = laudo.photos.find((item) => item.kind === slot.kind)
          return (
            <figure key={slot.kind}>
              {photo ? <img src={photo.dataUrl} alt={slot.label} /> : <div className="gc-photo-empty">Sem foto</div>}
              <figcaption>{slot.label}</figcaption>
            </figure>
          )
        })}
      </div>
      <div className="ensaios-block-modal-actions">
        <button type="button" className="secondary-button" onClick={() => printLaudo(laudo)}>
          Imprimir laudo
        </button>
      </div>
    </div>
  )
}

function ImportAssayModal({
  onClose,
  onDone,
  onError,
}: {
  onClose: () => void
  onDone: (message: string, id: string) => Promise<void>
  onError: (message: string) => void
}) {
  const [assay, setAssay] = useState<File | null>(null)
  const [seals, setSeals] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!assay) {
      onError('Selecione a planilha de ensaio.')
      return
    }
    setSubmitting(true)
    try {
      const assayBase64 = await readFileAsBase64(assay)
      const sealsBase64 = seals ? await readFileAsBase64(seals) : undefined
      const response = await api.importGcEnsaio({
        assayFileName: assay.name,
        assayBase64,
        sealsFileName: seals?.name,
        sealsBase64,
      })
      const sealsText = response.sealCount
        ? ` ${response.sealCount} lacre(s) vinculados pelo número do medidor.`
        : ''
      await onDone(
        `Ensaio registrado com ${response.meterCount} medidor(es).${sealsText}`,
        response.id,
      )
    } catch (error) {
      onError(errorMessage(error, 'Não foi possível registrar o ensaio.'))
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={() => { if (!submitting) onClose() }}>
      <form
        className="ensaios-block-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <button type="button" className="icon-button schedule-slot-modal-close" onClick={onClose} aria-label="Fechar" disabled={submitting}>
          ×
        </button>
        <h3>Registrar ensaio</h3>
        <p>
          A planilha da bancada traz um medidor por coluna. A planilha de lacres é opcional neste passo e também pode
          ser importada depois.
        </p>
        <label>
          Planilha de ensaio
          <input
            type="file"
            accept=".xlsx,.xls"
            required
            onChange={(event) => setAssay(event.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          Planilha de lacres
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => setSeals(event.target.files?.[0] ?? null)}
          />
        </label>
        <div className="ensaios-block-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? 'Importando...' : 'Registrar'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

function ImportFileModal({
  title,
  description,
  acceptLabel,
  submitLabel,
  onClose,
  onSubmit,
  onError,
}: {
  title: string
  description: string
  acceptLabel: string
  submitLabel: string
  onClose: () => void
  onSubmit: (file: File) => Promise<void>
  onError: (message: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file) {
      onError(`Selecione a ${acceptLabel.toLowerCase()}.`)
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(file)
    } catch (error) {
      onError(errorMessage(error, 'Não foi possível importar a planilha.'))
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={() => { if (!submitting) onClose() }}>
      <form
        className="ensaios-block-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <button type="button" className="icon-button schedule-slot-modal-close" onClick={onClose} aria-label="Fechar" disabled={submitting}>
          ×
        </button>
        <h3>{title}</h3>
        <p>{description}</p>
        <label>
          {acceptLabel}
          <input
            type="file"
            accept=".xlsx,.xls"
            required
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <div className="ensaios-block-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? 'Importando...' : submitLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

function PhotoModal({
  meter,
  ensaioId,
  onClose,
  onSaved,
  onError,
}: {
  meter: GcEnsaioMeter
  ensaioId: string
  onClose: () => void
  onSaved: () => Promise<void>
  onError: (message: string) => void
}) {
  const [drafts, setDrafts] = useState<Partial<Record<PhotoKind, string>>>({})
  const [existing, setExisting] = useState<Partial<Record<PhotoKind, string>>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void api.getGcLaudo(ensaioId, meter.id).then((response) => {
      if (cancelled) return
      const next: Partial<Record<PhotoKind, string>> = {}
      for (const photo of response.laudo.photos) next[photo.kind] = photo.dataUrl
      setExisting(next)
    }).catch(() => {
      if (!cancelled) onError('Não foi possível carregar as fotos deste medidor.')
    })
    return () => {
      cancelled = true
    }
    // onError is recreated by the parent on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensaioId, meter.id])

  async function save() {
    const kinds = PHOTO_SLOTS.map((slot) => slot.kind).filter((kind) => drafts[kind])
    if (!kinds.length) {
      onError('Escolha ao menos uma foto para salvar.')
      return
    }
    setSubmitting(true)
    try {
      for (const kind of kinds) {
        const dataUrl = drafts[kind]
        if (!dataUrl) continue
        await api.saveGcFoto(ensaioId, meter.id, {
          kind,
          fileName: `${meter.meter}-${kind}.jpg`,
          dataUrl,
        })
      }
      await onSaved()
    } catch (error) {
      onError(errorMessage(error, 'Não foi possível salvar as fotos.'))
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={() => { if (!submitting) onClose() }}>
      <div
        className="ensaios-block-modal gc-wide-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="icon-button schedule-slot-modal-close" onClick={onClose} aria-label="Fechar" disabled={submitting}>
          ×
        </button>
        <h3>Fotos do medidor {meter.meter}</h3>
        <div className="gc-photo-grid">
          {PHOTO_SLOTS.map((slot) => {
            const preview = drafts[slot.kind] || existing[slot.kind]
            return (
              <label key={slot.kind}>
                {preview ? <img src={preview} alt={slot.label} /> : <div className="gc-photo-empty">Sem foto</div>}
                <span>{slot.label}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    void compressImage(file)
                      .then((dataUrl) => setDrafts((prev) => ({ ...prev, [slot.kind]: dataUrl })))
                      .catch((error) => onError(error instanceof Error ? error.message : 'Não foi possível ler a foto.'))
                  }}
                />
              </label>
            )
          })}
        </div>
        <div className="ensaios-block-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="button" className="primary-button" onClick={() => void save()} disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar fotos'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SignTermModal({
  item,
  defaultName,
  onClose,
  onDone,
  onError,
}: {
  item: GcDestinacaoRecord
  defaultName: string
  onClose: () => void
  onDone: () => Promise<void>
  onError: (message: string) => void
}) {
  const [name, setName] = useState(defaultName)
  const [signature, setSignature] = useState('')
  const [hasInk, setHasInk] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!accepted || !hasInk) {
      onError('Leia o termo, assine e confirme para registrar a retirada.')
      return
    }
    setSubmitting(true)
    try {
      await api.signGcTermo(item.id, { signatureData: signature, signerName: name.trim() })
      await onDone()
    } catch (error) {
      onError(errorMessage(error, 'Não foi possível registrar o termo.'))
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={() => { if (!submitting) onClose() }}>
      <form
        className="ensaios-block-modal gc-wide-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <button type="button" className="icon-button schedule-slot-modal-close" onClick={onClose} aria-label="Fechar" disabled={submitting}>
          ×
        </button>
        <h3>Termo de retirada</h3>
        <p>
          Declaro que estou retirando o medidor {item.meter}
          {item.clientName ? `, destinado a ${item.clientName}` : ''}
          {item.installation ? `, instalação ${item.installation}` : ''}, e assumo a responsabilidade pela retirada.
          A saída só se conclui depois que um usuário de Grandes Clientes (SAB) liberar este termo.
        </p>
        <label>
          Nome de quem assina
          <input value={name} onChange={(event) => setName(event.target.value)} required minLength={3} />
        </label>
        <SignaturePad
          onChange={(dataUrl, ink) => {
            setSignature(dataUrl)
            setHasInk(ink)
          }}
        />
        <label className="gc-check">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          Li e concordo com o termo de retirada.
        </label>
        <div className="ensaios-block-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? 'Registrando...' : 'Assinar termo'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

function ReleaseModal({
  item,
  onClose,
  onDone,
  onError,
}: {
  item: GcDestinacaoRecord
  onClose: () => void
  onDone: () => Promise<void>
  onError: (message: string) => void
}) {
  const [submitting, setSubmitting] = useState(false)

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={() => { if (!submitting) onClose() }}>
      <div
        className="ensaios-block-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Liberar retirada</h3>
        <p>
          O termo do medidor {item.meter}
          {item.clientName ? ` (${item.clientName})` : ''} foi assinado por {item.signerName || '—'}. Confirme para
          liberar a retirada.
        </p>
        <div className="ensaios-block-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={submitting}
            onClick={() => {
              setSubmitting(true)
              void api
                .releaseGcRetirada(item.id)
                .then(() => onDone())
                .catch((error) => {
                  onError(errorMessage(error, 'Não foi possível liberar a retirada.'))
                  setSubmitting(false)
                })
            }}
          >
            {submitting ? 'Liberando...' : 'Liberar retirada'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
