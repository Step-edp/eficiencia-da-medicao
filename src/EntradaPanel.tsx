import { FormEvent, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, type DemmDocumentRecord, type DemmMeterAnalysisRecord } from './api'
import { ENTRADA_TRAIL_STEP } from './labTrailSteps'

function formatDateTime(isoDate: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(isoDate))
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

type DemmAnalysisModalProps = {
  title: string
  fileName?: string
  meters: DemmMeterAnalysisRecord[]
  loading?: boolean
  showSources?: boolean
  onClose: () => void
}

function DemmAnalysisModal({
  title,
  fileName,
  meters,
  loading = false,
  showSources = false,
  onClose,
}: DemmAnalysisModalProps) {
  const scheduledCount = meters.filter((item) => item.scheduled).length

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="ensaios-block-modal demm-analysis-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demm-analysis-title"
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

        <h3 id="demm-analysis-title">{title}</h3>
        {fileName ? <p className="demm-modal-intro">{fileName}</p> : null}
        <p className="demm-analysis-summary">
          {loading
            ? 'Carregando medidores...'
            : `${meters.length} medidor(es) · ${scheduledCount} agendado(s) no aplicativo`}
        </p>

        {loading ? (
          <p className="entrada-panel-empty">Carregando...</p>
        ) : meters.length === 0 ? (
          <p className="entrada-panel-empty">Nenhum medidor encontrado.</p>
        ) : (
          <div className="entrada-table-wrap">
            <table className="data-table demm-analysis-table">
              <thead>
                <tr>
                  <th>Medidor</th>
                  <th>Status no aplicativo</th>
                  <th>Data agendada</th>
                  {showSources ? <th>DEMM</th> : null}
                </tr>
              </thead>
              <tbody>
                {meters.map((item) => (
                  <tr key={item.meter}>
                    <td>{item.meter}</td>
                    <td>
                      <span
                        className={`demm-status-badge ${item.scheduled ? 'is-scheduled' : 'is-not-scheduled'}`}
                      >
                        {item.scheduled ? 'Agendado' : 'Não agendado'}
                      </span>
                    </td>
                    <td>{item.scheduledAtLabel ?? '—'}</td>
                    {showSources ? (
                      <td>{item.sourceFiles?.length ? item.sourceFiles.join(', ') : '—'}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

type EntradaPanelProps = {
  onCountChange?: (count: number) => void
}

export function EntradaPanel({ onCountChange }: EntradaPanelProps) {
  const [demmDocuments, setDemmDocuments] = useState<DemmDocumentRecord[]>([])
  const [schedules, setSchedules] = useState<Awaited<ReturnType<typeof api.listMeterSchedules>>['schedules']>([])
  const [loading, setLoading] = useState(true)
  const [showDemmModal, setShowDemmModal] = useState(false)
  const [demmFile, setDemmFile] = useState<File | null>(null)
  const [submittingDemm, setSubmittingDemm] = useState(false)
  const [deletingDemmId, setDeletingDemmId] = useState<string | null>(null)
  const [analysisModal, setAnalysisModal] = useState<{
    title: string
    fileName?: string
    meters: DemmMeterAnalysisRecord[]
    loading?: boolean
    showSources?: boolean
  } | null>(null)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setFeedback(null)

    try {
      const [demmResponse, scheduleResponse] = await Promise.all([
        api.listDemmDocuments(),
        api.listMeterSchedules(ENTRADA_TRAIL_STEP),
      ])
      setDemmDocuments(demmResponse.documents)
      setSchedules(scheduleResponse.schedules)
      onCountChange?.(scheduleResponse.total)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os dados de entrada.',
      })
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const closeDemmModal = () => {
    setShowDemmModal(false)
    setDemmFile(null)
  }

  const openDemmAnalysis = async (demmId: string, fileName?: string) => {
    setAnalysisModal({
      title: 'Medidores da DEMM',
      fileName,
      meters: [],
      loading: true,
      showSources: false,
    })

    try {
      const response = await api.getDemmDocumentAnalysis(demmId)
      setAnalysisModal({
        title: 'Medidores da DEMM',
        fileName: response.fileName,
        meters: response.analysis.meters,
        loading: false,
        showSources: false,
      })
      await loadData()
    } catch (error) {
      setAnalysisModal(null)
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível analisar os medidores da DEMM.',
      })
    }
  }

  const openMetersBase = async () => {
    setAnalysisModal({
      title: 'Base de medidores',
      meters: [],
      loading: true,
      showSources: true,
    })

    try {
      const response = await api.getDemmMetersBase()
      setAnalysisModal({
        title: 'Base de medidores',
        meters: response.meters,
        loading: false,
        showSources: true,
      })
    } catch (error) {
      setAnalysisModal(null)
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar a base de medidores.',
      })
    }
  }

  const handleDemmSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!demmFile) {
      setFeedback({ type: 'error', message: 'Envie o arquivo PDF da DEMM.' })
      return
    }

    if (demmFile.type !== 'application/pdf' && !demmFile.name.toLowerCase().endsWith('.pdf')) {
      setFeedback({ type: 'error', message: 'A DEMM deve ser um arquivo PDF.' })
      return
    }

    setSubmittingDemm(true)
    setFeedback(null)

    try {
      const fileBase64 = await readFileAsBase64(demmFile)
      const response = await api.createDemmDocument({
        fileName: demmFile.name,
        fileBase64,
      })

      closeDemmModal()
      setFeedback({
        type: 'success',
        message: `DEMM registrada. ${response.analysis.total} medidor(es) identificado(s).`,
      })
      setAnalysisModal({
        title: 'Medidores identificados na DEMM',
        fileName: response.document.fileName,
        meters: response.analysis.meters,
        loading: false,
        showSources: false,
      })
      await loadData()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError ? error.message : 'Não foi possível registrar a DEMM.',
      })
    } finally {
      setSubmittingDemm(false)
    }
  }

  const handleDeleteDemm = async (document: DemmDocumentRecord) => {
    const confirmed = window.confirm(`Excluir a DEMM "${document.fileName}"?`)
    if (!confirmed) return

    setDeletingDemmId(document.id)
    setFeedback(null)

    try {
      await api.deleteDemmDocument(document.id)
      setDemmDocuments((prev) => prev.filter((item) => item.id !== document.id))
      setFeedback({ type: 'success', message: `DEMM "${document.fileName}" excluída.` })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível excluir a DEMM.',
      })
    } finally {
      setDeletingDemmId(null)
    }
  }

  const totalDemmMeters = demmDocuments.reduce((sum, document) => sum + document.meterCount, 0)
  const totalDemmScheduled = demmDocuments.reduce(
    (sum, document) => sum + document.scheduledCount,
    0,
  )

  return (
    <>
      <div className="entrada-panel">
        <div className="entrada-panel-header">
          <div className="entrada-panel-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => setShowDemmModal(true)}
              disabled={loading}
            >
              Nova DEMM
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void openMetersBase()}
              disabled={loading || demmDocuments.length === 0}
            >
              Ver base de medidores
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void loadData()}
              disabled={loading}
            >
              {loading ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </div>

        {feedback ? (
          <div className={`login-feedback ${feedback.type}`} role="status">
            {feedback.message}
          </div>
        ) : null}

        <section className="entrada-section">
          <div className="entrada-section-heading">
            <h3 className="entrada-section-title">DEMMs cadastradas</h3>
            {demmDocuments.length > 0 ? (
              <span className="entrada-section-total">
                Total: {totalDemmMeters} medidor(es)
                {totalDemmScheduled > 0 ? ` · ${totalDemmScheduled} agendado(s)` : ''}
              </span>
            ) : null}
          </div>
          {loading && demmDocuments.length === 0 ? (
            <p className="entrada-panel-empty">Carregando DEMMs...</p>
          ) : demmDocuments.length === 0 ? (
            <p className="entrada-panel-empty">Nenhuma DEMM cadastrada.</p>
          ) : (
            <div className="entrada-table-wrap">
              <table className="data-table entrada-table">
                <thead>
                  <tr>
                    <th>Nº documento</th>
                    <th>Data emissão</th>
                    <th>Arquivo</th>
                    <th>Medidores</th>
                    <th>Agendados</th>
                    <th>Cadastrado por</th>
                    <th>Cadastrado em</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {demmDocuments.map((document) => (
                    <tr key={document.id}>
                      <td>{document.documentNumber ?? '—'}</td>
                      <td>{document.emissionDate ?? '—'}</td>
                      <td>{document.fileName}</td>
                      <td>{document.meterCount}</td>
                      <td>{document.scheduledCount}</td>
                      <td>{document.createdByRegistration ?? '—'}</td>
                      <td>{formatDateTime(document.createdAt)}</td>
                      <td>
                        <div className="entrada-demm-actions">
                          <a
                            className="entrada-demm-link"
                            href={api.getDemmDocumentFileUrl(document.id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            PDF
                          </a>
                          <button
                            type="button"
                            className="secondary-button entrada-demm-meters-button"
                            onClick={() => void openDemmAnalysis(document.id, document.fileName)}
                          >
                            Medidores
                            {document.meterCount > 0 ? ` (${document.meterCount})` : ''}
                          </button>
                          <button
                            type="button"
                            className="entrada-demm-delete-button"
                            disabled={deletingDemmId === document.id}
                            onClick={() => void handleDeleteDemm(document)}
                            aria-label={
                              deletingDemmId === document.id ? 'Excluindo DEMM' : 'Excluir DEMM'
                            }
                            title={
                              deletingDemmId === document.id ? 'Excluindo...' : 'Excluir DEMM'
                            }
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="entrada-table-total-row">
                    <td colSpan={3}>Total</td>
                    <td>{totalDemmMeters}</td>
                    <td>{totalDemmScheduled}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        <section className="entrada-section">
          <h3 className="entrada-section-title">Medidores agendados</h3>
          {loading && schedules.length === 0 ? (
            <p className="entrada-panel-empty">Carregando medidores...</p>
          ) : schedules.length === 0 ? (
            <p className="entrada-panel-empty">Nenhum medidor agendado aguardando entrada.</p>
          ) : (
            <div className="entrada-table-wrap">
              <table className="data-table entrada-table">
                <thead>
                  <tr>
                    <th>Medidor</th>
                    <th>Instalação</th>
                    <th>TOI</th>
                    <th>Nota</th>
                    <th>CSD</th>
                    <th>Cliente presente</th>
                    <th>Data agendada</th>
                    <th>Agendado por</th>
                    <th>Registrado em</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((schedule) => (
                    <tr key={schedule.id}>
                      <td>{schedule.meter}</td>
                      <td>{schedule.installation}</td>
                      <td>{schedule.toi}</td>
                      <td>{schedule.note}</td>
                      <td>{schedule.csd}</td>
                      <td>{schedule.clientPresent === 'sim' ? 'Sim' : 'Não'}</td>
                      <td>{schedule.scheduledAtLabel}</td>
                      <td>{schedule.createdByRegistration ?? '—'}</td>
                      <td>{formatDateTime(schedule.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {showDemmModal
        ? createPortal(
            <div
              className="ensaios-block-modal-overlay"
              role="presentation"
              onClick={closeDemmModal}
            >
              <div
                className="ensaios-block-modal demm-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="demm-modal-title"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="icon-button schedule-slot-modal-close"
                  onClick={closeDemmModal}
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

                <h3 id="demm-modal-title">Nova DEMM</h3>

                <form className="form-grid demm-form-grid" onSubmit={(event) => void handleDemmSubmit(event)}>
                  <label className="full-width photo-upload-field">
                    PDF da DEMM
                    <div className="photo-upload-area demm-upload-area">
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(event) => setDemmFile(event.target.files?.[0] ?? null)}
                        required
                      />
                      <span className="photo-upload-hint">
                        {demmFile ? demmFile.name : 'Clique para selecionar o PDF da DEMM'}
                      </span>
                    </div>
                  </label>

                  <div className="ensaios-block-modal-actions full-width">
                    <button type="button" className="secondary-button" onClick={closeDemmModal}>
                      Cancelar
                    </button>
                    <button type="submit" className="primary-button" disabled={submittingDemm}>
                      {submittingDemm ? 'Lendo PDF...' : 'Enviar DEMM'}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {analysisModal ? (
        <DemmAnalysisModal
          title={analysisModal.title}
          fileName={analysisModal.fileName}
          meters={analysisModal.meters}
          loading={analysisModal.loading}
          showSources={analysisModal.showSources}
          onClose={() => setAnalysisModal(null)}
        />
      ) : null}
    </>
  )
}
