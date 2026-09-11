import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError, type MeterScheduleRecord } from './api'
import { ENSAIAR_TRAIL_STEP } from './labTrailSteps'
import { RatmWorkflow } from './ratm/RatmWorkflow'
import { loadRatmDraft } from './ratm/ratmDraft'
import type { RatmFormData } from './ratm/types'

const maxRatmCount = 10
const ratmOptions = Array.from({ length: maxRatmCount }, (_, index) => index + 1)

type EnsaiarFormProps = {
  onFinish: (forms: RatmFormData[]) => void | Promise<void>
  initialMeter?: string
}

function formatDateTime(isoDate: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(isoDate))
}

function receivedMeterMatches(item: MeterScheduleRecord, query: string) {
  if (!query) return true
  const haystack = [
    item.meter,
    item.installation,
    item.toi,
    item.note,
    item.csd,
    item.scheduledAtLabel,
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export function EnsaiarForm({ onFinish, initialMeter }: EnsaiarFormProps) {
  const draft = initialMeter ? null : loadRatmDraft()
  const [ratmCount, setRatmCount] = useState(initialMeter ? '1' : draft ? String(draft.count) : '')
  const [startedCount, setStartedCount] = useState<number | null>(
    initialMeter ? 1 : draft?.count ?? null,
  )
  const [workflowMeter, setWorkflowMeter] = useState(initialMeter)
  const [showReceived, setShowReceived] = useState(false)
  const [receivedMeters, setReceivedMeters] = useState<MeterScheduleRecord[]>([])
  const [receivedLoading, setReceivedLoading] = useState(false)
  const [receivedSearch, setReceivedSearch] = useState('')
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const selectedCount = Number(ratmCount)

  const loadReceivedMeters = useCallback(async () => {
    setReceivedLoading(true)
    try {
      const response = await api.listMeterSchedules(ENSAIAR_TRAIL_STEP)
      setReceivedMeters(response.schedules)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os medidores recebidos.',
      })
      setReceivedMeters([])
    } finally {
      setReceivedLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!showReceived) return
    void loadReceivedMeters()
  }, [showReceived, loadReceivedMeters])

  const filteredReceivedMeters = useMemo(() => {
    const query = receivedSearch.trim().toLowerCase()
    if (!query) return receivedMeters
    return receivedMeters.filter((item) => receivedMeterMatches(item, query))
  }, [receivedMeters, receivedSearch])

  const handleStart = () => {
    if (!ratmCount) {
      setFeedback({
        type: 'error',
        message: 'Selecione quantos RATMs deseja realizar de uma vez.',
      })
      return
    }

    setFeedback(null)
    setStartedCount(selectedCount)
  }

  const handleEnsaiarMeter = (meter: string) => {
    setWorkflowMeter(meter)
    setRatmCount('1')
    setStartedCount(1)
    setShowReceived(false)
    setFeedback(null)
  }

  const openReceivedList = () => {
    setShowReceived(true)
    setFeedback(null)
  }

  if (startedCount) {
    return (
      <RatmWorkflow
        count={startedCount}
        initialMeter={workflowMeter}
        onBack={() => {
          setStartedCount(null)
          setFeedback(null)
        }}
        onFinish={onFinish}
      />
    )
  }

  if (showReceived) {
    const hasSearch = Boolean(receivedSearch.trim())
    const showingCount = filteredReceivedMeters.length
    const total = receivedMeters.length

    return (
      <>
        {feedback ? (
          <div className={`login-feedback ${feedback.type}`} role="status">
            {feedback.message}
          </div>
        ) : null}

        <div className="ensaiar-received">
          <div className="entrada-section-heading">
            <h3 className="entrada-section-title">Medidores recebidos</h3>
            <p className="demm-analysis-summary">
              {receivedLoading && total === 0
                ? 'Carregando medidores...'
                : hasSearch
                  ? `${showingCount} de ${total} medidor(es) encontrado(s)`
                  : `${total} medidor(es) recebido(s)`}
            </p>
          </div>

          <div className="consultar-toolbar entrada-wpa-toolbar">
            <label className="consultar-search">
              <span className="sr-only">Pesquisar medidores recebidos</span>
              <span className="consultar-search-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle
                    cx="11"
                    cy="11"
                    r="7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M20 20l-3.5-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                type="search"
                value={receivedSearch}
                onChange={(event) => setReceivedSearch(event.target.value)}
                placeholder="Pesquisar por medidor, instalação, TOI, nota, CSD…"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>

          {receivedLoading && total === 0 ? (
            <p className="entrada-panel-empty">Carregando medidores...</p>
          ) : showingCount === 0 ? (
            <p className="entrada-panel-empty">
              {hasSearch
                ? 'Nenhum medidor encontrado para esta pesquisa.'
                : 'Nenhum medidor recebido aguardando ensaio.'}
            </p>
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
                    <th>Data agendada</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReceivedMeters.map((item) => (
                    <tr key={item.id}>
                      <td>{item.meter}</td>
                      <td>{item.installation || '—'}</td>
                      <td>{item.toi || '—'}</td>
                      <td>{item.note || '—'}</td>
                      <td>{item.csd || '—'}</td>
                      <td>{item.scheduledAtLabel || formatDateTime(item.scheduledAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => handleEnsaiarMeter(item.meter)}
                        >
                          Ensaiar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            className="secondary-button full-width"
            type="button"
            onClick={() => {
              setShowReceived(false)
              setFeedback(null)
            }}
          >
            Voltar
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      <div className="form-grid ensaiar-form">
        <label className="full-width">
          Quantidade de RATMs
          <select
            value={ratmCount}
            onChange={(event) => {
              setRatmCount(event.target.value)
              setFeedback(null)
            }}
          >
            <option value="">Selecione a quantidade (máximo {maxRatmCount})</option>
            {ratmOptions.map((count) => (
              <option key={count} value={String(count)}>
                {count} {count === 1 ? 'RATM' : 'RATMs'}
              </option>
            ))}
          </select>
        </label>

        <button className="primary-button full-width" type="button" onClick={handleStart}>
          Iniciar formulários
        </button>
        <button className="secondary-button full-width" type="button" onClick={openReceivedList}>
          Medidores recebidos
        </button>
      </div>
    </>
  )
}
