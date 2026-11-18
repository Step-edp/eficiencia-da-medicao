import { FormEvent, useCallback, useEffect, useId, useMemo, useState } from 'react'
import { api, ApiError, type SoftwareRecord } from './api'
import { readAttachmentAsDataUrl } from './readAttachmentAsDataUrl'

type FormMode = { kind: 'new' } | { kind: 'version'; name: string }
type Origem = 'arquivo' | 'link'

function nomeChave(nome: string) {
  return nome.trim().toLocaleLowerCase('pt-BR')
}

function agrupar(linhas: SoftwareRecord[]) {
  const grupos = new Map<string, SoftwareRecord[]>()
  for (const item of linhas) {
    const chave = nomeChave(item.name)
    const lista = grupos.get(chave) ?? []
    lista.push(item)
    grupos.set(chave, lista)
  }
  return [...grupos.values()]
    .map((versoes) => {
      const ordenadas = [...versoes].sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id,
      )
      return {
        chave: nomeChave(ordenadas[0].name),
        nome: ordenadas[0].name,
        atual: ordenadas[0],
        anteriores: ordenadas.slice(1),
      }
    })
    .sort((a, b) => b.atual.createdAt.localeCompare(a.atual.createdAt))
}

function rotuloVersao(item: SoftwareRecord) {
  const quando = new Date(item.createdAt).toLocaleString('pt-BR')
  return item.versionLabel ? `${item.versionLabel} · ${quando}` : quando
}

export function SoftwaresPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [softwares, setSoftwares] = useState<SoftwareRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [formMode, setFormMode] = useState<FormMode | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const [name, setName] = useState('')
  const [versionLabel, setVersionLabel] = useState('')
  const [origem, setOrigem] = useState<Origem>('arquivo')
  const [attachment, setAttachment] = useState('')
  const [attachmentName, setAttachmentName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const attachmentInputId = useId()
  const grupos = useMemo(() => agrupar(softwares), [softwares])

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
    setVersionLabel('')
    setOrigem('arquivo')
    setAttachment('')
    setAttachmentName('')
    setLinkUrl('')
  }

  const abrirNovo = () => {
    setFeedback(null)
    if (formMode?.kind === 'new') {
      setFormMode(null)
      resetForm()
      return
    }
    resetForm()
    setFormMode({ kind: 'new' })
  }

  const abrirVersao = (nome: string) => {
    setFeedback(null)
    resetForm()
    setName(nome)
    setFormMode({ kind: 'version', name: nome })
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    const nome = (formMode?.kind === 'version' ? formMode.name : name).trim()
    if (!nome) {
      setFeedback({ type: 'error', message: 'Informe o nome do software.' })
      return
    }
    const link = linkUrl.trim()
    if (origem === 'arquivo' && !attachment) {
      setFeedback({ type: 'error', message: 'Anexe o arquivo do software.' })
      return
    }
    if (origem === 'link' && !link) {
      setFeedback({ type: 'error', message: 'Informe o link do software.' })
      return
    }

    const jaExiste = softwares.some((item) => nomeChave(item.name) === nomeChave(nome))
    setCreating(true)
    setFeedback(null)
    try {
      const { software } = await api.createSoftware({
        name: nome,
        versionLabel: versionLabel.trim(),
        ...(origem === 'arquivo'
          ? { attachment, attachmentName: attachmentName || 'arquivo' }
          : { linkUrl: link }),
      })
      setSoftwares((current) => [software, ...current])
      resetForm()
      setFormMode(null)
      setFeedback({
        type: 'success',
        message: jaExiste
          ? `Nova versão de "${software.name}" guardada. A anterior continua disponível.`
          : `Software "${software.name}" guardado.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError ? error.message : 'Não foi possível guardar o software.',
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
      const blob = await fetch(dataUrl).then((response) => response.blob())
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName || item.attachmentName || 'arquivo'
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1500)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError ? error.message : 'Não foi possível baixar o arquivo.',
      })
    } finally {
      setDownloadingId(null)
    }
  }

  const recursoDo = (item: SoftwareRecord) => (
    <>
      {item.hasAttachment ? (
        <button
          type="button"
          className="link-button"
          disabled={downloadingId === item.id}
          onClick={() => void handleDownloadAttachment(item)}
        >
          {downloadingId === item.id ? 'Baixando…' : item.attachmentName || 'Baixar arquivo'}
        </button>
      ) : null}
      {item.linkUrl ? (
        <a className="link-button" href={item.linkUrl} target="_blank" rel="noopener noreferrer">
          {item.linkUrl}
        </a>
      ) : null}
    </>
  )

  return (
    <div className="softwares-panel">
      {readOnly ? null : (
        <div className="area-actions right-aligned-actions">
          <button type="button" className="primary-button" onClick={abrirNovo}>
            {formMode?.kind === 'new' ? 'Fechar formulário' : 'Novo software'}
          </button>
        </div>
      )}

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      {!readOnly && formMode ? (
        <form className="material-form-grid apresentacao-form" onSubmit={(event) => void handleCreate(event)}>
          <label className="full-width">
            Nome
            <input
              type="text"
              value={formMode.kind === 'version' ? formMode.name : name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: MM Avulsa"
              required
              readOnly={formMode.kind === 'version'}
              disabled={creating || formMode.kind === 'version'}
            />
          </label>
          <label className="full-width">
            Versão
            <input
              type="text"
              value={versionLabel}
              onChange={(event) => setVersionLabel(event.target.value)}
              placeholder="Ex.: 2.0"
              disabled={creating}
            />
          </label>
          <fieldset className="software-origem full-width">
            <legend>O que guardar</legend>
            <label>
              <input
                type="radio"
                name="origem-software"
                checked={origem === 'arquivo'}
                disabled={creating}
                onChange={() => setOrigem('arquivo')}
              />
              Arquivo
            </label>
            <label>
              <input
                type="radio"
                name="origem-software"
                checked={origem === 'link'}
                disabled={creating}
                onChange={() => setOrigem('link')}
              />
              Link
            </label>
          </fieldset>
          {origem === 'arquivo' ? (
            <div className="full-width">
              <span className="agenda-attachment-label">Arquivo</span>
              <div className="file-picker">
                <input
                  id={attachmentInputId}
                  className="file-picker-input"
                  type="file"
                  accept=".zip,.rar,.7z,.tar,.gz,.tgz,.bz2,.xz,.apk,.cab,.iso,.exe,.msi,application/zip,application/x-zip-compressed,application/octet-stream,*/*"
                  disabled={creating}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) {
                      setAttachment('')
                      setAttachmentName('')
                      return
                    }
                  void readAttachmentAsDataUrl(file, {
                    maxBytes: 200_000_000,
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
            </div>
          ) : (
            <label className="full-width">
              Link
              <input
                type="url"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://"
                disabled={creating}
                required
              />
            </label>
          )}
          <p className="field-hint full-width">
            {formMode.kind === 'version'
              ? 'O arquivo ou o link novo vira a versão atual. Os anteriores permanecem disponíveis. Vale qualquer tipo, inclusive zip, rar, 7z e apk, até 200 MB.'
              : 'Se o nome já existir, isto entra como versão nova e a anterior continua guardada. Vale qualquer tipo, inclusive zip, rar, 7z e apk, até 200 MB.'}
          </p>
          <div className="agenda-form-actions full-width">
            <button
              type="button"
              className="secondary-button"
              disabled={creating}
              onClick={() => {
                resetForm()
                setFormMode(null)
              }}
            >
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={creating}>
              {creating
                ? 'Salvando…'
                : formMode.kind === 'version'
                  ? 'Guardar versão'
                  : 'Salvar software'}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">Carregando softwares...</p>
      ) : grupos.length ? (
        <div className="software-list">
          {grupos.map((grupo) => (
            <article key={grupo.chave} className="software-card">
              <header className="software-card-header">
                <h3>{grupo.nome}</h3>
                {readOnly ? null : (
                  <button
                    type="button"
                    className="secondary-button compact-button"
                    onClick={() => abrirVersao(grupo.nome)}
                  >
                    Nova versão
                  </button>
                )}
              </header>
              {grupo.atual.description ? <p>{grupo.atual.description}</p> : null}
              <p className="software-version-line">
                <span className="software-badge">Atual</span>
                <span>{rotuloVersao(grupo.atual)}</span>
                {recursoDo(grupo.atual)}
              </p>
              {grupo.anteriores.length ? (
                <div className="software-previous">
                  <p className="software-previous-title">Versões anteriores</p>
                  <ul>
                    {grupo.anteriores.map((item) => (
                      <li key={item.id}>
                        <span>{rotuloVersao(item)}</span>
                        {recursoDo(item)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="entrada-panel-empty">
          Nenhum software guardado. Use Novo software para enviar um arquivo ou um link.
        </p>
      )}
    </div>
  )
}
