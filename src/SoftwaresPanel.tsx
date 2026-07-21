import { FormEvent, useCallback, useEffect, useId, useState } from 'react'
import { api, ApiError, type SoftwareRecord } from './api'
import { readAttachmentAsDataUrl } from './readAttachmentAsDataUrl'

export function SoftwaresPanel() {
  const [softwares, setSoftwares] = useState<SoftwareRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [attachment, setAttachment] = useState('')
  const [attachmentName, setAttachmentName] = useState('')
  const attachmentInputId = useId()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { softwares: rows } = await api.listSoftwares()
      setSoftwares(rows)
    } catch (error) {
      setSoftwares([])
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os softwares.',
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
    setAttachment('')
    setAttachmentName('')
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !description.trim()) {
      setFeedback({
        type: 'error',
        message: 'Informe o nome e a descrição do software.',
      })
      return
    }

    setCreating(true)
    setFeedback(null)
    try {
      const { software } = await api.createSoftware({
        name: name.trim(),
        description: description.trim(),
        attachment: attachment || undefined,
        attachmentName: attachment ? attachmentName || 'anexo' : undefined,
      })
      setSoftwares((current) => [software, ...current])
      resetForm()
      setShowForm(false)
      setFeedback({
        type: 'success',
        message: `Software "${software.name}" cadastrado com sucesso.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível cadastrar o software.',
      })
    } finally {
      setCreating(false)
    }
  }

  const handleDownloadAttachment = async (item: SoftwareRecord) => {
    setDownloadingId(item.id)
    setFeedback(null)
    try {
      const { attachment: dataUrl, attachmentName: fileName } =
        await api.getSoftwareAttachment(item.id)
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
            : 'Não foi possível baixar o arquivo.',
      })
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="softwares-panel">
      <div className="area-actions right-aligned-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setShowForm((current) => !current)
            setFeedback(null)
          }}
        >
          {showForm ? 'Fechar formulário' : 'Novo software'}
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
            Nome
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Software de calibração"
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
              placeholder="Descreva o software"
              required
              disabled={creating}
            />
          </label>
          <div className="full-width">
            <span className="agenda-attachment-label">Upload</span>
            <div className="file-picker">
              <input
                id={attachmentInputId}
                className="file-picker-input"
                type="file"
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
                    allowAnyFile: true,
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
                Selecionar arquivo
              </label>
              <span className="file-picker-name">
                {attachmentName || 'Nenhum arquivo selecionado'}
              </span>
            </div>
            <p className="field-hint">Qualquer arquivo de até 15 MB.</p>
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
              {creating ? 'Salvando…' : 'Salvar software'}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">Carregando softwares...</p>
      ) : (
        <div className="entrada-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
                <th>Arquivo</th>
                <th>Criado por</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {softwares.length ? (
                softwares.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.description || '—'}</td>
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
                            : item.attachmentName || 'Baixar arquivo'}
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
                  <td colSpan={5}>Nenhum software cadastrado ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
