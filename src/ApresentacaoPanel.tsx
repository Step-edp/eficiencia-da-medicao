import { FormEvent, useCallback, useEffect, useId, useState } from 'react'
import { api, ApiError, type PresentationRecord } from './api'
import { readAttachmentAsDataUrl } from './readAttachmentAsDataUrl'

const ATTACHMENT_ACCEPT =
  '.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.odp,.odt,.ods,image/*,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation'

export function ApresentacaoPanel() {
  const [presentations, setPresentations] = useState<PresentationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [link, setLink] = useState('')
  const [attachment, setAttachment] = useState('')
  const [attachmentName, setAttachmentName] = useState('')
  const attachmentInputId = useId()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { presentations: rows } = await api.listPresentations()
      setPresentations(rows)
    } catch (error) {
      setPresentations([])
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar as apresentações.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const resetForm = () => {
    setName('')
    setDescription('')
    setLink('')
    setAttachment('')
    setAttachmentName('')
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !description.trim()) {
      setFeedback({
        type: 'error',
        message: 'Informe o nome e a descrição da apresentação.',
      })
      return
    }

    setCreating(true)
    setFeedback(null)
    try {
      const { presentation } = await api.createPresentation({
        name: name.trim(),
        description: description.trim(),
        link: link.trim(),
        attachment: attachment || undefined,
        attachmentName: attachment ? attachmentName || 'anexo' : undefined,
      })
      setPresentations((current) => [presentation, ...current])
      resetForm()
      setShowForm(false)
      setFeedback({
        type: 'success',
        message: `Apresentação "${presentation.name}" cadastrada com sucesso.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível cadastrar a apresentação.',
      })
    } finally {
      setCreating(false)
    }
  }

  const handleDownloadAttachment = async (item: PresentationRecord) => {
    setDownloadingId(item.id)
    setFeedback(null)
    try {
      const { attachment: dataUrl, attachmentName: fileName } =
        await api.getPresentationAttachment(item.id)
      const anchor = document.createElement('a')
      anchor.href = dataUrl
      anchor.download = fileName || item.attachmentName || 'anexo'
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível baixar o anexo.',
      })
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="apresentacao-panel">
      <div className="area-actions right-aligned-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setShowForm((current) => !current)
            setFeedback(null)
          }}
        >
          {showForm ? 'Fechar formulário' : 'Adicionar apresentação'}
        </button>
      </div>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      {showForm ? (
        <form
          className="material-form-grid apresentacao-form"
          onSubmit={(event) => void handleCreate(event)}
        >
          <label className="full-width">
            Nome da apresentação
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Apresentação de resultados"
              required
              disabled={creating}
            />
          </label>
          <label className="full-width">
            Descrição
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Descreva o conteúdo da apresentação"
              required
              disabled={creating}
            />
          </label>
          <label className="full-width">
            Link (opcional)
            <input
              type="url"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://..."
              disabled={creating}
            />
          </label>
          <div className="full-width">
            <span className="agenda-attachment-label">Anexo (opcional)</span>
            <div className="file-picker">
              <input
                id={attachmentInputId}
                className="file-picker-input"
                type="file"
                accept={ATTACHMENT_ACCEPT}
                disabled={creating}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) {
                    setAttachment('')
                    setAttachmentName('')
                    return
                  }
                  void readAttachmentAsDataUrl(file, {
                    maxBytes: 15_000_000,
                    allowOfficeDocuments: true,
                  })
                    .then((dataUrl) => {
                      setAttachment(dataUrl)
                      setAttachmentName(file.name)
                      setFeedback(null)
                    })
                    .catch((error: unknown) => {
                      setAttachment('')
                      setAttachmentName('')
                      event.target.value = ''
                      setFeedback({
                        type: 'error',
                        message:
                          error instanceof Error
                            ? error.message
                            : 'Não foi possível carregar o arquivo.',
                      })
                    })
                }}
              />
              <label htmlFor={attachmentInputId} className="file-picker-button">
                Anexar arquivo
              </label>
              <span className="file-picker-name">
                {attachmentName || 'Nenhum arquivo selecionado'}
              </span>
            </div>
            <p className="field-hint">PDF, PowerPoint, Word, Excel ou imagem (até 15 MB).</p>
          </div>
          <div className="agenda-form-actions full-width">
            <button
              type="button"
              className="secondary-button"
              disabled={creating}
              onClick={() => {
                resetForm()
                setShowForm(false)
              }}
            >
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={creating}>
              {creating ? 'Salvando…' : 'Salvar apresentação'}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">Carregando apresentações...</p>
      ) : (
        <div className="entrada-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
                <th>Link</th>
                <th>Anexo</th>
                <th>Criado por</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {presentations.length ? (
                presentations.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.description || '—'}</td>
                    <td>
                      {item.link ? (
                        <a href={item.link} target="_blank" rel="noreferrer">
                          Abrir link
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {item.hasAttachment ? (
                        <button
                          type="button"
                          className="link-button"
                          disabled={downloadingId === item.id}
                          onClick={() => void handleDownloadAttachment(item)}
                        >
                          {downloadingId === item.id
                            ? 'Baixando…'
                            : item.attachmentName || 'Baixar anexo'}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {item.createdByName || item.createdByRegistration
                        ? `${item.createdByName || '—'}${
                            item.createdByRegistration
                              ? ` (${item.createdByRegistration})`
                              : ''
                          }`
                        : '—'}
                    </td>
                    <td>{new Date(item.createdAt).toLocaleString('pt-BR')}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>Nenhuma apresentação cadastrada ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
