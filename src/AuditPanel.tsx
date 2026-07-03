import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './api'
import { formatAuditAction, formatAuditDate, formatAuditEntity } from './auditLabels'

const PAGE_SIZE = 50

export function AuditPanel() {
  const [logs, setLogs] = useState<Awaited<ReturnType<typeof api.listAuditLogs>>['logs']>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const loadLogs = useCallback(async (nextOffset = 0) => {
    setLoading(true)
    setFeedback(null)

    try {
      const response = await api.listAuditLogs({ limit: PAGE_SIZE, offset: nextOffset })
      setLogs(response.logs)
      setTotal(response.total)
      setOffset(response.offset)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar o histórico de auditoria.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLogs(0)
  }, [loadLogs])

  const canGoBack = offset > 0
  const canGoForward = offset + PAGE_SIZE < total

  return (
    <div className="audit-panel">
      <div className="audit-panel-header">
        <div>
          <p className="audit-panel-intro">
            Registro automático de cadastros, edições, exclusões e aprovações realizadas no
            sistema.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void loadLogs(offset)}
          disabled={loading}
        >
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      {loading && logs.length === 0 ? (
        <p className="audit-panel-empty">Carregando histórico...</p>
      ) : logs.length === 0 ? (
        <p className="audit-panel-empty">Nenhum registro de auditoria encontrado.</p>
      ) : (
        <>
          <div className="audit-table-wrap">
            <table className="data-table audit-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>Entidade</th>
                  <th>Resumo</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatAuditDate(log.occurredAt)}</td>
                    <td>{log.userRegistration ?? 'Sistema / público'}</td>
                    <td>
                      <span className={`audit-action audit-action-${log.action}`}>
                        {formatAuditAction(log.action)}
                      </span>
                    </td>
                    <td>{formatAuditEntity(log.entityType)}</td>
                    <td>{log.summary ?? log.entityId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="audit-pagination">
            <span>
              {total === 0
                ? '0 registros'
                : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} de ${total}`}
            </span>
            <div className="audit-pagination-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={!canGoBack || loading}
                onClick={() => void loadLogs(Math.max(offset - PAGE_SIZE, 0))}
              >
                Anterior
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!canGoForward || loading}
                onClick={() => void loadLogs(offset + PAGE_SIZE)}
              >
                Próxima
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
