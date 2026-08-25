import { useCallback, useEffect, useState } from 'react'
import {
  api,
  ApiError,
  type ScheduleDateAdjustmentRecord,
} from './api'
import { LoginFeedback } from './LoginFeedback'
import { MeterDetailModal } from './MeterDetailModal'

function formatCollaborator(name: string, registration: string) {
  const trimmedName = name.trim()
  const trimmedRegistration = registration.trim()
  if (trimmedName && trimmedRegistration) return `${trimmedName} (${trimmedRegistration})`
  return trimmedName || trimmedRegistration || '—'
}

function formatPhysicallyAdjustedBy(item: ScheduleDateAdjustmentRecord) {
  return formatCollaborator(
    item.physicallyAdjustedByName ?? '',
    item.physicallyAdjustedByRegistration ?? '',
  )
}

function formatWhen(isoDate: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(isoDate))
}

export function ScheduleDateAdjustmentsPanel({
  scope,
  title,
  intro,
  allowPhysicalAdjust = false,
  includeFillingDeviations = false,
  readOnly = false,
  onPendingCountChange,
}: {
  scope: 'all' | 'mine'
  title: string
  intro: string
  allowPhysicalAdjust?: boolean
  includeFillingDeviations?: boolean
  readOnly?: boolean
  onPendingCountChange?: (count: number) => void
}) {
  const [items, setItems] = useState<ScheduleDateAdjustmentRecord[]>([])
  const [history, setHistory] = useState<ScheduleDateAdjustmentRecord[]>([])
  const [listTab, setListTab] = useState<'pending' | 'history'>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [meterDetail, setMeterDetail] = useState<string | null>(null)
  const dateOnly = !includeFillingDeviations

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.listScheduleDateAdjustments(
        scope,
        dateOnly ? 'schedule_date_mismatch' : undefined,
      )
      setItems(response.adjustments)
      setHistory(response.history ?? [])
      onPendingCountChange?.(response.total)
    } catch (err) {
      setItems([])
      setHistory([])
      onPendingCountChange?.(0)
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar os apontamentos de desvio.',
      )
    } finally {
      setLoading(false)
    }
  }, [dateOnly, onPendingCountChange, scope])

  useEffect(() => {
    void load()
  }, [load])

  const handlePhysicalAdjust = async (item: ScheduleDateAdjustmentRecord) => {
    if (readOnly || savingId) return
    setSavingId(item.id)
    setError('')
    try {
      const { adjustment } = await api.markScheduleDatePhysicallyAdjusted(item.id)
      const nextPending = items.filter((row) => row.id !== item.id)
      setItems(nextPending)
      setHistory((current) => [
        adjustment,
        ...current.filter((row) => row.id !== item.id),
      ])
      onPendingCountChange?.(nextPending.length)
      setListTab('history')
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível marcar o ajuste físico.',
      )
    } finally {
      setSavingId(null)
    }
  }

  const visibleItems = listTab === 'pending' ? items : history
  const showPhysicalButton = allowPhysicalAdjust && !readOnly && listTab === 'pending'
  const showPhysicalColumns = listTab === 'history'
  const summary =
    loading
      ? 'Carregando...'
      : listTab === 'pending'
        ? dateOnly
          ? `${items.length} medidor(es) com data de agendamento alterada`
          : `${items.length} apontamento(s) de desvio`
        : dateOnly
          ? `${history.length} medidor(es) ajustado(s) fisicamente`
          : `${history.length} apontamento(s) no histórico`

  return (
    <section className="entrada-section" aria-label={title}>
      <div className="entrada-section-heading">
        <h3 className="entrada-section-title">
          {listTab === 'history' ? 'Histórico de ajuste físico' : title}
        </h3>
        <p className="demm-analysis-summary">{summary}</p>
      </div>
      <p className="entrada-panel-intro">{intro}</p>

      <div
        className="panel-switch users-view-switch"
        role="tablist"
        aria-label={dateOnly ? 'Lista de alterações de data' : 'Lista de apontamentos de desvio'}
      >
        <button
          type="button"
          role="tab"
          aria-selected={listTab === 'pending'}
          className={listTab === 'pending' ? 'active' : ''}
          onClick={() => setListTab('pending')}
        >
          Pendentes
          {items.length > 0 ? ` (${items.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={listTab === 'history'}
          className={listTab === 'history' ? 'active' : ''}
          onClick={() => setListTab('history')}
        >
          Histórico
          {history.length > 0 ? ` (${history.length})` : ''}
        </button>
      </div>

      {error ? <LoginFeedback type="error" message={error} /> : null}

      {loading && visibleItems.length === 0 ? (
        <p className="entrada-panel-empty">Carregando alterações...</p>
      ) : visibleItems.length === 0 ? (
        <p className="entrada-panel-empty">
          {listTab === 'history'
            ? dateOnly
              ? 'Nenhum ajuste físico registrado.'
              : 'Nenhum apontamento no histórico.'
            : dateOnly
              ? 'Nenhuma alteração de data pendente.'
              : 'Nenhum apontamento de desvio pendente.'}
        </p>
      ) : (
        <div className="entrada-table-wrap">
          <table className="data-table entrada-table">
            <thead>
              <tr>
                <th>Medidor</th>
                {dateOnly ? null : <th>Tipo</th>}
                <th>{dateOnly ? 'Agendado no sistema' : 'Valor anterior'}</th>
                <th>{dateOnly ? 'No documento' : 'Valor corrigido'}</th>
                {showPhysicalColumns ? <th>Ajustado fisicamente por</th> : null}
                {showPhysicalColumns ? <th>Ajuste físico em</th> : null}
                {showPhysicalButton ? <th>Ação</th> : null}
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button
                      type="button"
                      className="schedule-meter-link"
                      onClick={() => setMeterDetail(item.meter)}
                    >
                      {item.meter}
                    </button>
                  </td>
                  {dateOnly ? null : <td>{item.description}</td>}
                  <td>{item.scheduledLabel}</td>
                  <td>{item.documentLabel}</td>
                  {showPhysicalColumns ? <td>{formatPhysicallyAdjustedBy(item)}</td> : null}
                  {showPhysicalColumns ? (
                    <td>
                      {item.physicallyAdjustedAt ? formatWhen(item.physicallyAdjustedAt) : '—'}
                    </td>
                  ) : null}
                  {showPhysicalButton && item.kind === 'schedule_date_mismatch' ? (
                    <td>
                      <button
                        type="button"
                        className="success-button compact-button"
                        disabled={savingId === item.id}
                        onClick={() => void handlePhysicalAdjust(item)}
                      >
                        {savingId === item.id ? 'Salvando...' : 'Ajustado fisicamente'}
                      </button>
                    </td>
                  ) : showPhysicalButton ? (
                    <td>—</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meterDetail ? (
        <MeterDetailModal meter={meterDetail} onClose={() => setMeterDetail(null)} />
      ) : null}
    </section>
  )
}
