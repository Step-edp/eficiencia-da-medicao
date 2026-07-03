import { FormEvent, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError } from './api'
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

type EntradaPanelProps = {
  onCountChange?: (count: number) => void
}

export function EntradaPanel({ onCountChange }: EntradaPanelProps) {
  const [schedules, setSchedules] = useState<Awaited<ReturnType<typeof api.listMeterSchedules>>['schedules']>([])
  const [loading, setLoading] = useState(true)
  const [showDemmModal, setShowDemmModal] = useState(false)
  const [selectedScheduleId, setSelectedScheduleId] = useState('')
  const [demmFile, setDemmFile] = useState<File | null>(null)
  const [submittingDemm, setSubmittingDemm] = useState(false)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const loadSchedules = useCallback(async () => {
    setLoading(true)
    setFeedback(null)

    try {
      const response = await api.listMeterSchedules(ENTRADA_TRAIL_STEP)
      setSchedules(response.schedules)
      onCountChange?.(response.total)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os medidores agendados.',
      })
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  useEffect(() => {
    void loadSchedules()
  }, [loadSchedules])

  const closeDemmModal = () => {
    setShowDemmModal(false)
    setSelectedScheduleId('')
    setDemmFile(null)
  }

  const handleDemmSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!selectedScheduleId) {
      setFeedback({ type: 'error', message: 'Selecione o medidor.' })
      return
    }

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
      await api.createDemmDocument({
        meterScheduleId: selectedScheduleId,
        fileName: demmFile.name,
        fileBase64,
      })

      closeDemmModal()
      setFeedback({ type: 'success', message: 'DEMM registrada com sucesso.' })
      await loadSchedules()
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

  return (
    <>
      <div className="entrada-panel">
        <div className="entrada-panel-header">
          <p className="entrada-panel-intro">
            Medidores agendados pela equipe de campo aguardando entrada no laboratório.
          </p>
          <div className="entrada-panel-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => setShowDemmModal(true)}
              disabled={loading || schedules.length === 0}
            >
              Nova DEMM
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void loadSchedules()}
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
                  <th>DEMM</th>
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
                    <td>
                      {schedule.demmDocumentId ? (
                        <a
                          className="entrada-demm-link"
                          href={api.getDemmDocumentFileUrl(schedule.demmDocumentId)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {schedule.demmFileName ?? 'Ver PDF'}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{schedule.createdByRegistration ?? '—'}</td>
                    <td>{formatDateTime(schedule.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                <p className="demm-modal-intro">Selecione o medidor e envie o PDF da DEMM.</p>

                <form className="form-grid demm-form-grid" onSubmit={(event) => void handleDemmSubmit(event)}>
                  <label className="full-width">
                    Medidor
                    <select
                      value={selectedScheduleId}
                      onChange={(event) => setSelectedScheduleId(event.target.value)}
                      required
                    >
                      <option value="">Selecione o medidor</option>
                      {schedules.map((schedule) => (
                        <option key={schedule.id} value={schedule.id}>
                          {schedule.meter} — {schedule.scheduledAtLabel}
                        </option>
                      ))}
                    </select>
                  </label>

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
                      {submittingDemm ? 'Enviando...' : 'Salvar DEMM'}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
