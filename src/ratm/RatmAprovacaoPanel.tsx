import { useState } from 'react'
import { api, ApiError } from '../api'
import { RatmLaudoViewer } from './RatmLaudoViewer'
import { formatRatmLaudoNumber, mapRatmLaudoFromApi, type RatmLaudo } from './laudos'
import { openRatmLaudoPdf } from './laudoPdf'

type RatmAprovacaoPanelProps = {
  laudos: RatmLaudo[]
  onLaudoUpdated: (laudo: RatmLaudo) => void
  onLaudoApproved: (laudo: RatmLaudo) => void
  onLaudoDeleted?: (laudoId: string) => void
  readOnly?: boolean
  isAdmin?: boolean
  approverUserId?: string
  approverIsLab?: boolean
}

export function RatmAprovacaoPanel({
  laudos,
  onLaudoUpdated,
  onLaudoApproved,
  onLaudoDeleted,
  readOnly = false,
  isAdmin = false,
  approverUserId,
  approverIsLab = false,
}: RatmAprovacaoPanelProps) {
  const [viewingLaudo, setViewingLaudo] = useState<RatmLaudo | null>(null)
  const [viewerMode, setViewerMode] = useState<'view' | 'edit'>('view')
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const query = search.trim().toLocaleLowerCase('pt-BR')
  const matchesSearch = (laudo: RatmLaudo) => {
    if (!query) return true
    const haystack = [
      formatRatmLaudoNumber(laudo.ratmNumber, laudo.createdAt),
      laudo.meter,
      laudo.client,
      laudo.createdByName,
      laudo.createdByRegistration,
      new Date(laudo.createdAt).toLocaleString('pt-BR'),
    ]
      .join(' ')
      .toLocaleLowerCase('pt-BR')
    return haystack.includes(query)
  }
  const pendingLaudos = laudos.filter((laudo) => laudo.status === 'Pendente' && !laudo.revokedAt)
  const approvedLaudos = laudos.filter((laudo) => laudo.status === 'Aprovado' && !laudo.revokedAt)
  const visiblePending = pendingLaudos.filter(matchesSearch)
  const visibleApproved = approvedLaudos.filter(matchesSearch)

  const approveLaudo = async (laudo: RatmLaudo) => {
    setApprovingId(laudo.id)
    setDeleteError('')
    setSuccessMessage('')
    try {
      const response = await api.approveRatmLaudo(laudo.id, { clientPresent: 'Não' })
      const approved = mapRatmLaudoFromApi(response.laudo)
      onLaudoApproved(approved)
      setSuccessMessage(
        `Laudo ${formatRatmLaudoNumber(approved.ratmNumber, approved.createdAt)} aprovado com sucesso.`,
      )
    } catch (error) {
      setDeleteError(error instanceof ApiError ? error.message : 'Não foi possível aprovar o laudo.')
    } finally {
      setApprovingId(null)
    }
  }

  const deleteLaudo = async (laudo: RatmLaudo) => {
    const number = formatRatmLaudoNumber(laudo.ratmNumber, laudo.createdAt)
    const confirmed = window.confirm(`Excluir o laudo ${number} do medidor ${laudo.meter}?`)
    if (!confirmed) return

    setDeletingId(laudo.id)
    setDeleteError('')
    try {
      await api.deleteRatmLaudo(laudo.id)
      onLaudoDeleted?.(laudo.id)
      if (viewingLaudo?.id === laudo.id) setViewingLaudo(null)
    } catch (error) {
      setDeleteError(
        error instanceof ApiError ? error.message : 'Não foi possível excluir o laudo.',
      )
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <label className="approval-search">
        Pesquisar
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Laudo, medidor ou cliente"
        />
      </label>

      {successMessage ? (
        <div className="login-feedback success" role="status">
          {successMessage}
        </div>
      ) : null}

      {deleteError ? (
        <div className="login-feedback error" role="status">
          {deleteError}
        </div>
      ) : null}

      <section className="approval-section">
        <h3>Pendente Aprovação</h3>
        <div className="approval-list" aria-label="Laudos de RATM pendentes">
          {pendingLaudos.length === 0 ? (
            <p className="generated-password-empty">
              Nenhum laudo de RATM aguardando aprovação.
            </p>
          ) : visiblePending.length === 0 ? (
            <p className="generated-password-empty">
              Nenhum laudo encontrado com essa pesquisa.
            </p>
          ) : (
            visiblePending.map((laudo) => (
              <article key={laudo.id} className="approval-item">
                <div className="approval-item-info">
                  <strong>Laudo {formatRatmLaudoNumber(laudo.ratmNumber, laudo.createdAt)}</strong>
                  <span>Medidor: {laudo.meter}</span>
                  <span>Cliente: {laudo.client}</span>
                  <span>
                    Ensaio realizado por:{' '}
                    {laudo.createdByName || laudo.createdByRegistration
                      ? `${laudo.createdByName || '—'}${
                          laudo.createdByRegistration ? ` (${laudo.createdByRegistration})` : ''
                        }`
                      : '—'}
                  </span>
                  <span>Gerado em {new Date(laudo.createdAt).toLocaleString('pt-BR')}</span>
                </div>
                <div className="approval-item-actions">
                  <button
                    className="secondary-button approval-action-button"
                    type="button"
                    onClick={() => openRatmLaudoPdf(laudo.id)}
                  >
                    Visualizar PDF
                  </button>
                  {readOnly ? null : (
                    <button
                      className="secondary-button approval-action-button"
                      type="button"
                      onClick={() => {
                        setViewerMode('edit')
                        setViewingLaudo(laudo)
                      }}
                    >
                      Editar
                    </button>
                  )}
                  {readOnly ? null : (
                    <button
                      className="secondary-button approval-action-button is-approve"
                      type="button"
                      disabled={approvingId === laudo.id}
                      onClick={() => void approveLaudo(laudo)}
                    >
                      Aprovar
                    </button>
                  )}
                  {isAdmin ? (
                    <button
                      className="secondary-button approval-action-button is-delete"
                      type="button"
                      disabled={deletingId === laudo.id}
                      onClick={() => void deleteLaudo(laudo)}
                    >
                      Excluir
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="approval-section">
        <h3>Relatórios Aprovados</h3>
        <div className="approval-list" aria-label="Relatórios RATM aprovados">
          {approvedLaudos.length === 0 ? (
            <p className="generated-password-empty">Nenhum relatório aprovado.</p>
          ) : visibleApproved.length === 0 ? (
            <p className="generated-password-empty">
              Nenhum laudo encontrado com essa pesquisa.
            </p>
          ) : (
            visibleApproved.map((laudo) => (
              <article key={laudo.id} className="approval-item">
                <div className="approval-item-info">
                  <strong>Laudo {formatRatmLaudoNumber(laudo.ratmNumber, laudo.createdAt)}</strong>
                  <span>Medidor: {laudo.meter}</span>
                  <span>Cliente: {laudo.client}</span>
                  <span>
                    Ensaio realizado por:{' '}
                    {laudo.createdByName || laudo.createdByRegistration
                      ? `${laudo.createdByName || '—'}${
                          laudo.createdByRegistration ? ` (${laudo.createdByRegistration})` : ''
                        }`
                      : '—'}
                  </span>
                  <span>Gerado em {new Date(laudo.createdAt).toLocaleString('pt-BR')}</span>
                </div>
                <div className="approval-item-actions">
                  <button
                    className="secondary-button approval-action-button"
                    type="button"
                    onClick={() => openRatmLaudoPdf(laudo.id)}
                  >
                    Visualizar PDF
                  </button>
                  {isAdmin ? (
                    <button
                      className="secondary-button approval-action-button is-delete"
                      type="button"
                      disabled={deletingId === laudo.id}
                      onClick={() => void deleteLaudo(laudo)}
                    >
                      Excluir
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {viewingLaudo ? (
        <RatmLaudoViewer
          laudo={viewingLaudo}
          initialMode={viewerMode}
          readOnly={readOnly}
          approverUserId={approverUserId}
          approverIsLab={approverIsLab}
          onClose={() => setViewingLaudo(null)}
          onUpdated={(laudo) => {
            onLaudoUpdated(laudo)
            setViewingLaudo(laudo)
          }}
          onApproved={(laudo) => {
            onLaudoApproved(laudo)
            setViewingLaudo(null)
          }}
        />
      ) : null}
    </>
  )
}
