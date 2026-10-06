import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { readImageAsDataUrl } from '../readImageAsDataUrl'
import { downloadRatmLaudoPdf, printRatmLaudoPdf } from './laudoPdf'
import { buildWhatsAppSurveyUrl, isValidWhatsappNumber } from './satisfactionSurvey'

type ApprovalStep = 'ask' | 'photo' | 'cpf' | 'sign' | 'whatsapp' | 'done'

type PresentPayload = {
  clientDocumentPhoto: string
  clientCpf: string
  clientSignature: string
  satisfactionWhatsapp: string
}

type RatmApprovalWizardProps = {
  laudoId: string
  loading: boolean
  onClose: () => void
  onApproveAbsent: () => Promise<void>
  onApprovePresent: (payload: PresentPayload) => Promise<void>
}

function isValidCpf(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false
  const check = (length: number) => {
    let sum = 0
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index)
    }
    const result = (sum * 10) % 11
    return (result === 10 ? 0 : result) === Number(digits[length])
  }
  return check(9) && check(10)
}

function maskCpf(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

function captureVideoFrame(video: HTMLVideoElement) {
  const maxDimension = 1280
  const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight, 1))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) return ''
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.75)
}

function DocumentPhotoStep({
  photo,
  onPhoto,
}: {
  photo: string
  onPhoto: (value: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState('')

  useEffect(() => {
    if (photo) return
    let cancelled = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('A câmera não está disponível neste aparelho.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
      } catch {
        if (!cancelled) setCameraError('Não foi possível abrir a câmera.')
      }
    }

    void start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [photo])

  const takePhoto = () => {
    const video = videoRef.current
    if (!video?.videoWidth) return
    const frame = captureVideoFrame(video)
    if (!frame) return
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    onPhoto(frame)
  }

  const chooseFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const dataUrl = await readImageAsDataUrl(file, {
        maxBytes: 8_000_000,
        maxDimension: 1280,
        quality: 0.75,
      })
      onPhoto(dataUrl)
      setCameraError('')
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : 'Não foi possível usar esta foto.')
    }
  }

  return (
    <div className="laudo-approval-photo">
      {photo ? (
        <img src={photo} alt="Documento com foto do cliente" />
      ) : (
        <video ref={videoRef} autoPlay muted playsInline />
      )}
      {cameraError ? <p className="laudo-whatsapp-hint">{cameraError}</p> : null}
      <div className="laudo-confirm-actions">
        {photo ? (
          <button className="secondary-button" type="button" onClick={() => onPhoto('')}>
            Tirar outra
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={takePhoto}>
            Tirar foto
          </button>
        )}
        <label className="secondary-button laudo-file-button">
          Escolher foto
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              void chooseFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </label>
      </div>
    </div>
  )
}

function SignaturePad({ onChange }: { onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(rect.width * ratio))
    canvas.height = Math.max(1, Math.round(rect.height * ratio))
    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(ratio, ratio)
    context.lineWidth = 2.4
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#102033'
  }, [])

  const contextOf = (canvas: HTMLCanvasElement) => canvas.getContext('2d')

  const pointFrom = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const publish = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasInk.current) {
      onChange('')
      return
    }
    onChange(canvas.toDataURL('image/png'))
  }

  return (
    <div className="laudo-signature-wrap">
      <canvas
        ref={canvasRef}
        className="laudo-signature-pad"
        onPointerDown={(event) => {
          const canvas = event.currentTarget
          canvas.setPointerCapture(event.pointerId)
          const context = contextOf(canvas)
          if (!context) return
          const point = pointFrom(event)
          context.beginPath()
          context.moveTo(point.x, point.y)
          drawing.current = true
          lastPoint.current = point
        }}
        onPointerMove={(event) => {
          if (!drawing.current || !lastPoint.current) return
          const context = contextOf(event.currentTarget)
          if (!context) return
          const point = pointFrom(event)
          context.beginPath()
          context.moveTo(lastPoint.current.x, lastPoint.current.y)
          context.lineTo(point.x, point.y)
          context.stroke()
          lastPoint.current = point
          hasInk.current = true
        }}
        onPointerUp={() => {
          drawing.current = false
          lastPoint.current = null
          publish()
        }}
        onPointerCancel={() => {
          drawing.current = false
          lastPoint.current = null
          publish()
        }}
      />
      <button
        className="secondary-button"
        type="button"
        onClick={() => {
          const canvas = canvasRef.current
          const context = canvas ? contextOf(canvas) : null
          if (!canvas || !context) return
          context.save()
          context.setTransform(1, 0, 0, 1, 0, 0)
          context.clearRect(0, 0, canvas.width, canvas.height)
          context.restore()
          hasInk.current = false
          lastPoint.current = null
          onChange('')
        }}
      >
        Limpar
      </button>
    </div>
  )
}

export function RatmApprovalWizard({
  laudoId,
  loading,
  onClose,
  onApproveAbsent,
  onApprovePresent,
}: RatmApprovalWizardProps) {
  const [step, setStep] = useState<ApprovalStep>('ask')
  const [photo, setPhoto] = useState('')
  const [cpf, setCpf] = useState('')
  const [signature, setSignature] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [error, setError] = useState('')
  const [fileAction, setFileAction] = useState<'download' | 'print' | ''>('')

  const fail = (caught: unknown, fallback: string) => {
    setError(caught instanceof Error ? caught.message : fallback)
  }

  const approveAbsent = async () => {
    setError('')
    try {
      await onApproveAbsent()
    } catch (caught) {
      fail(caught, 'Não foi possível aprovar o laudo.')
    }
  }

  const approvePresent = async () => {
    setError('')
    const popup = window.open('about:blank', '_blank')
    try {
      await onApprovePresent({
        clientDocumentPhoto: photo,
        clientCpf: cpf,
        clientSignature: signature,
        satisfactionWhatsapp: whatsapp,
      })
      if (popup) popup.location.href = buildWhatsAppSurveyUrl(whatsapp, laudoId)
      setStep('done')
    } catch (caught) {
      popup?.close()
      fail(caught, 'Não foi possível aprovar o laudo.')
    }
  }

  const runFileAction = async (action: 'download' | 'print') => {
    setFileAction(action)
    setError('')
    try {
      if (action === 'download') await downloadRatmLaudoPdf(laudoId)
      else await printRatmLaudoPdf(laudoId)
    } catch (caught) {
      fail(caught, 'Não foi possível abrir o PDF do laudo.')
    } finally {
      setFileAction('')
    }
  }

  return (
    <div className="laudo-approval-overlay" role="presentation">
      <section
        className="laudo-confirm-dialog laudo-approval-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="laudo-approval-title"
      >
        {step === 'ask' ? (
          <>
            <h4 id="laudo-approval-title">Cliente acompanhou</h4>
            <p>O cliente acompanhou o ensaio?</p>
            {error ? <p className="laudo-approval-error">{error}</p> : null}
            <div className="laudo-confirm-actions">
              <button className="secondary-button" type="button" disabled={loading} onClick={onClose}>
                Cancelar
              </button>
              <button className="secondary-button" type="button" disabled={loading} onClick={() => void approveAbsent()}>
                Não
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={loading}
                onClick={() => {
                  setError('')
                  setStep('photo')
                }}
              >
                Sim
              </button>
            </div>
          </>
        ) : null}

        {step === 'photo' ? (
          <>
            <h4 id="laudo-approval-title">Documento com foto</h4>
            <p>Tire uma foto do documento de identificação do cliente.</p>
            <DocumentPhotoStep photo={photo} onPhoto={setPhoto} />
            {error ? <p className="laudo-approval-error">{error}</p> : null}
            <div className="laudo-confirm-actions">
              <button className="secondary-button" type="button" onClick={() => setStep('ask')}>
                Voltar
              </button>
              <button className="primary-button" type="button" disabled={!photo} onClick={() => setStep('cpf')}>
                Continuar
              </button>
            </div>
          </>
        ) : null}

        {step === 'cpf' ? (
          <>
            <h4 id="laudo-approval-title">CPF do cliente</h4>
            <label className="full-width">
              CPF
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(event) => setCpf(maskCpf(event.target.value))}
              />
            </label>
            <div className="laudo-confirm-actions">
              <button className="secondary-button" type="button" onClick={() => setStep('photo')}>
                Voltar
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={!isValidCpf(cpf)}
                onClick={() => setStep('sign')}
              >
                Continuar
              </button>
            </div>
          </>
        ) : null}

        {step === 'sign' ? (
          <>
            <h4 id="laudo-approval-title">Assinatura do cliente</h4>
            <p>Peça para o cliente assinar no espaço abaixo.</p>
            <SignaturePad onChange={setSignature} />
            <div className="laudo-confirm-actions">
              <button className="secondary-button" type="button" onClick={() => setStep('cpf')}>
                Voltar
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={!signature}
                onClick={() => setStep('whatsapp')}
              >
                Continuar
              </button>
            </div>
          </>
        ) : null}

        {step === 'whatsapp' ? (
          <>
            <h4 id="laudo-approval-title">Pesquisa de satisfação</h4>
            <label className="full-width">
              WhatsApp do cliente
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(11) 99999-9999"
                value={whatsapp}
                disabled={loading}
                onChange={(event) => setWhatsapp(event.target.value)}
              />
            </label>
            <p className="laudo-whatsapp-hint">O link da pesquisa é enviado neste número.</p>
            {error ? <p className="laudo-approval-error">{error}</p> : null}
            <div className="laudo-confirm-actions">
              <button className="secondary-button" type="button" disabled={loading} onClick={() => setStep('sign')}>
                Voltar
              </button>
              <button
                className="reserve-button"
                type="button"
                disabled={loading || !isValidWhatsappNumber(whatsapp)}
                onClick={() => void approvePresent()}
              >
                Aprovar
              </button>
            </div>
          </>
        ) : null}

        {step === 'done' ? (
          <>
            <h4 id="laudo-approval-title">Laudo aprovado</h4>
            <p>O laudo está disponível para baixar ou imprimir.</p>
            {error ? <p className="laudo-approval-error">{error}</p> : null}
            <div className="laudo-confirm-actions">
              <button className="secondary-button" type="button" onClick={onClose}>
                Fechar
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={fileAction !== ''}
                onClick={() => void runFileAction('print')}
              >
                Imprimir
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={fileAction !== ''}
                onClick={() => void runFileAction('download')}
              >
                Baixar
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  )
}
