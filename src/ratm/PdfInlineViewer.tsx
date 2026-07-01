import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { fetchRatmLaudoPdfBlob } from './laudoPdf'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

type ViewerState =
  | { status: 'loading' }
  | { status: 'ready'; mode: 'pages'; pages: string[] }
  | { status: 'ready'; mode: 'embed'; url: string }
  | { status: 'error'; message: string }

type PdfInlineViewerProps = {
  laudoId: string
  version: number
  onLoadError: (message: string) => void
}

async function renderPdfPages(buffer: ArrayBuffer) {
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  const pages: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1.35 })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Não foi possível preparar a visualização do PDF.')
    }

    canvas.width = viewport.width
    canvas.height = viewport.height

    await page.render({
      canvasContext: context,
      viewport,
      canvas,
    }).promise

    pages.push(canvas.toDataURL('image/jpeg', 0.92))
  }

  return pages
}

export function PdfInlineViewer({ laudoId, version, onLoadError }: PdfInlineViewerProps) {
  const onLoadErrorRef = useRef(onLoadError)
  const embedUrlRef = useRef<string | null>(null)
  const [viewerState, setViewerState] = useState<ViewerState>({ status: 'loading' })

  useEffect(() => {
    onLoadErrorRef.current = onLoadError
  }, [onLoadError])

  useEffect(() => {
    let cancelled = false

    const loadPdf = async () => {
      setViewerState({ status: 'loading' })

      if (embedUrlRef.current) {
        URL.revokeObjectURL(embedUrlRef.current)
        embedUrlRef.current = null
      }

      try {
        const blob = await fetchRatmLaudoPdfBlob(laudoId)
        const buffer = await blob.arrayBuffer()

        try {
          const pages = await renderPdfPages(buffer)

          if (cancelled) {
            return
          }

          if (!pages.length) {
            throw new Error('O laudo PDF não possui páginas para exibir.')
          }

          setViewerState({ status: 'ready', mode: 'pages', pages })
          return
        } catch {
          const pdfBlob =
            blob.type === 'application/pdf'
              ? blob
              : new Blob([buffer], { type: 'application/pdf' })
          const url = URL.createObjectURL(pdfBlob)
          embedUrlRef.current = url

          if (cancelled) {
            URL.revokeObjectURL(url)
            embedUrlRef.current = null
            return
          }

          setViewerState({ status: 'ready', mode: 'embed', url })
        }
      } catch (error) {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error
            ? error.message
            : 'Não foi possível exibir o laudo em PDF dentro do aplicativo.'

        setViewerState({ status: 'error', message })
        onLoadErrorRef.current(message)
      }
    }

    void loadPdf()

    return () => {
      cancelled = true

      if (embedUrlRef.current) {
        URL.revokeObjectURL(embedUrlRef.current)
        embedUrlRef.current = null
      }
    }
  }, [laudoId, version])

  if (viewerState.status === 'loading') {
    return <p className="laudo-viewer-loading">Carregando laudo em PDF...</p>
  }

  if (viewerState.status === 'error') {
    return (
      <p className="generated-password-empty" role="alert">
        {viewerState.message}
      </p>
    )
  }

  if (viewerState.mode === 'embed') {
    return (
      <embed
        className="laudo-viewer-embed"
        src={viewerState.url}
        type="application/pdf"
        title="Laudo RATM"
      />
    )
  }

  return (
    <div className="laudo-pdf-pages">
      {viewerState.pages.map((pageUrl, index) => (
        <img
          key={`${version}-${index + 1}`}
          className="laudo-pdf-page"
          src={pageUrl}
          alt={`Página ${index + 1} do laudo RATM`}
        />
      ))}
    </div>
  )
}
