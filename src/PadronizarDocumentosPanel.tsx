import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  api,
  ApiError,
  type DocumentTemplateConfig,
  type DocumentTemplateField,
  type DocumentTemplateFieldType,
  type DocumentTemplateRecord,
} from './api'
import { LoginFeedback } from './LoginFeedback'

type Mode = 'list' | 'edit' | 'fill'
type Feedback = { type: 'success' | 'error'; message: string } | null

const FIELD_TYPE_LABELS: Record<DocumentTemplateFieldType, string> = {
  text: 'Texto curto',
  textarea: 'Texto longo',
  date: 'Data',
  number: 'Número',
}

const EMPTY_CONFIG: DocumentTemplateConfig = {
  code: '',
  title: '',
  subtitle: '',
  fields: [],
  showFieldsTable: true,
  body: '',
  signatures: [],
  footer: 'EDP · Área de Medição',
}

const EXAMPLE_TEMPLATE: { name: string; config: DocumentTemplateConfig } = {
  name: 'Comunicado interno',
  config: {
    code: 'MED-COM-001',
    title: 'Comunicado Interno',
    subtitle: 'Área de Medição',
    fields: [
      { key: 'destinatario', label: 'Destinatário', type: 'text' },
      { key: 'assunto', label: 'Assunto', type: 'text' },
      { key: 'data', label: 'Data', type: 'date' },
      { key: 'mensagem', label: 'Mensagem', type: 'textarea' },
    ],
    showFieldsTable: true,
    body:
      '# Objetivo\nInformamos a {{destinatario}} sobre {{assunto}}.\n\n# Detalhamento\n{{mensagem}}\n\nEste comunicado tem validade a partir de {{data}}.',
    signatures: ['Responsável', 'Gestor da área'],
    footer: 'EDP · Área de Medição · Documento de uso interno',
  },
}

function slugify(label: string) {
  return (
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'campo'
  )
}

function uniqueKey(label: string, fields: DocumentTemplateField[], ignoreIndex = -1) {
  const base = slugify(label)
  const taken = new Set(fields.filter((_, i) => i !== ignoreIndex).map((f) => f.key))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}_${n}`)) n += 1
  return `${base}_${n}`
}

function formatValue(field: DocumentTemplateField, raw: string) {
  if (field.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-')
    return `${d}/${m}/${y}`
  }
  return raw
}

function todayLabel() {
  return new Date().toLocaleDateString('pt-BR')
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return fallback
}

/** Substitui {{chave}} pelo valor preenchido (ou um marcador com o nome do campo). */
function renderInline(
  text: string,
  fields: DocumentTemplateField[],
  values: Record<string, string>,
): ReactNode[] {
  const byKey = new Map(fields.map((f) => [f.key, f]))
  const parts = text.split(/(\{\{\s*[a-z0-9_]+\s*\}\})/g)
  return parts.map((part, index) => {
    const match = part.match(/^\{\{\s*([a-z0-9_]+)\s*\}\}$/)
    if (!match) return part
    const field = byKey.get(match[1])
    if (!field) return <span key={index} className="doc-std-missing">{part}</span>
    const value = formatValue(field, values[field.key] ?? '')
    return value ? (
      <span key={index}>{value}</span>
    ) : (
      <span key={index} className="doc-std-placeholder">[{field.label}]</span>
    )
  })
}

function DocumentPreview({
  config,
  values,
  userName,
}: {
  config: DocumentTemplateConfig
  values: Record<string, string>
  userName: string
}) {
  const blocks = useMemo(() => {
    const result: { kind: 'h' | 'p'; text: string }[] = []
    let paragraph: string[] = []
    const flush = () => {
      if (paragraph.length) result.push({ kind: 'p', text: paragraph.join('\n') })
      paragraph = []
    }
    for (const line of config.body.split('\n')) {
      if (line.startsWith('# ')) {
        flush()
        result.push({ kind: 'h', text: line.slice(2) })
      } else if (!line.trim()) {
        flush()
      } else {
        paragraph.push(line)
      }
    }
    flush()
    return result
  }, [config.body])

  return (
    <article className="doc-std-page" aria-label="Pré-visualização do documento">
      <header className="doc-std-page-header">
        <img src="/logo/EDP_2022.svg" alt="EDP" className="doc-std-page-logo" />
        <div className="doc-std-page-meta">
          {config.code ? <span>{config.code}</span> : null}
          <span>Emitido em {todayLabel()}</span>
        </div>
      </header>

      <div className="doc-std-page-title">
        <h1>{config.title || 'Título do documento'}</h1>
        {config.subtitle ? <p>{config.subtitle}</p> : null}
      </div>

      {config.showFieldsTable && config.fields.length > 0 ? (
        <table className="doc-std-page-table">
          <tbody>
            {config.fields
              .filter((f) => f.type !== 'textarea')
              .map((field) => {
                const value = formatValue(field, values[field.key] ?? '')
                return (
                  <tr key={field.key}>
                    <th scope="row">{field.label}</th>
                    <td>{value || <span className="doc-std-placeholder">—</span>}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      ) : null}

      <div className="doc-std-page-body">
        {blocks.length === 0 ? (
          <p className="doc-std-placeholder">O texto do documento aparecerá aqui.</p>
        ) : (
          blocks.map((block, index) =>
            block.kind === 'h' ? (
              <h2 key={index}>{renderInline(block.text, config.fields, values)}</h2>
            ) : (
              <p key={index}>{renderInline(block.text, config.fields, values)}</p>
            ),
          )
        )}
      </div>

      {config.signatures.length > 0 ? (
        <div className="doc-std-page-signatures">
          {config.signatures.map((role, index) => (
            <div key={`${role}-${index}`} className="doc-std-signature">
              <span className="doc-std-signature-line" />
              <span>{role}</span>
            </div>
          ))}
        </div>
      ) : null}

      <footer className="doc-std-page-footer">
        <span>{config.footer}</span>
        <span>Gerado por {userName}</span>
      </footer>
    </article>
  )
}

export function PadronizarDocumentosPanel({ userName }: { userName: string }) {
  const [templates, setTemplates] = useState<DocumentTemplateRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [mode, setMode] = useState<Mode>('list')

  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draft, setDraft] = useState<DocumentTemplateConfig>(EMPTY_CONFIG)
  const [newSignature, setNewSignature] = useState('')
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const [filling, setFilling] = useState<DocumentTemplateRecord | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { templates: rows } = await api.listDocumentTemplates()
      setTemplates(rows)
    } catch (error) {
      setFeedback({ type: 'error', message: errorMessage(error, 'Não foi possível carregar os modelos.') })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const startNew = (preset?: { name: string; config: DocumentTemplateConfig }) => {
    setEditingId(null)
    setDraftName(preset?.name ?? '')
    setDraft(preset ? structuredClone(preset.config) : { ...EMPTY_CONFIG, fields: [], signatures: [] })
    setNewSignature('')
    setMode('edit')
  }

  const startEdit = (template: DocumentTemplateRecord) => {
    setEditingId(template.id)
    setDraftName(template.name)
    setDraft({ ...EMPTY_CONFIG, ...structuredClone(template.config) })
    setNewSignature('')
    setMode('edit')
  }

  const startFill = (template: DocumentTemplateRecord) => {
    setFilling(template)
    setValues({})
    setMode('fill')
  }

  const backToList = () => {
    setMode('list')
    setFilling(null)
  }

  const updateDraft = (patch: Partial<DocumentTemplateConfig>) =>
    setDraft((current) => ({ ...current, ...patch }))

  const addField = () => {
    setDraft((current) => {
      const label = `Campo ${current.fields.length + 1}`
      return {
        ...current,
        fields: [...current.fields, { key: uniqueKey(label, current.fields), label, type: 'text' }],
      }
    })
  }

  const updateField = (index: number, patch: Partial<DocumentTemplateField>) => {
    setDraft((current) => {
      const fields = current.fields.map((field, i) => {
        if (i !== index) return field
        const next = { ...field, ...patch }
        if (patch.label !== undefined) {
          const newKey = uniqueKey(patch.label, current.fields, index)
          // Mantém o texto do documento coerente ao renomear o campo.
          if (newKey !== field.key) {
            next.key = newKey
          }
        }
        return next
      })
      let body = current.body
      const oldKey = current.fields[index]?.key
      const newKey = fields[index]?.key
      if (oldKey && newKey && oldKey !== newKey) {
        body = body.replace(new RegExp(`\\{\\{\\s*${oldKey}\\s*\\}\\}`, 'g'), `{{${newKey}}}`)
      }
      return { ...current, fields, body }
    })
  }

  const moveField = (index: number, delta: number) => {
    setDraft((current) => {
      const target = index + delta
      if (target < 0 || target >= current.fields.length) return current
      const fields = [...current.fields]
      ;[fields[index], fields[target]] = [fields[target], fields[index]]
      return { ...current, fields }
    })
  }

  const removeField = (index: number) =>
    setDraft((current) => ({ ...current, fields: current.fields.filter((_, i) => i !== index) }))

  const insertPlaceholder = (key: string) => {
    const token = `{{${key}}}`
    const el = bodyRef.current
    setDraft((current) => {
      if (!el) return { ...current, body: current.body + token }
      const start = el.selectionStart ?? current.body.length
      const end = el.selectionEnd ?? start
      const body = current.body.slice(0, start) + token + current.body.slice(end)
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(start + token.length, start + token.length)
      })
      return { ...current, body }
    })
  }

  const addSignature = () => {
    const role = newSignature.trim()
    if (!role) return
    updateDraft({ signatures: [...draft.signatures, role] })
    setNewSignature('')
  }

  const save = async () => {
    if (!draftName.trim()) {
      setFeedback({ type: 'error', message: 'Informe o nome do modelo.' })
      return
    }
    if (!draft.title.trim()) {
      setFeedback({ type: 'error', message: 'Informe o título do documento.' })
      return
    }
    setSaving(true)
    try {
      const payload = { name: draftName.trim(), config: draft }
      if (editingId) {
        await api.updateDocumentTemplate(editingId, payload)
      } else {
        await api.createDocumentTemplate(payload)
      }
      setFeedback({ type: 'success', message: 'Modelo salvo.' })
      await load()
      setMode('list')
    } catch (error) {
      setFeedback({ type: 'error', message: errorMessage(error, 'Não foi possível salvar o modelo.') })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (template: DocumentTemplateRecord) => {
    if (!window.confirm(`Excluir o modelo "${template.name}"? Essa ação não pode ser desfeita.`)) return
    try {
      await api.deleteDocumentTemplate(template.id)
      setFeedback({ type: 'success', message: 'Modelo excluído.' })
      await load()
    } catch (error) {
      setFeedback({ type: 'error', message: errorMessage(error, 'Não foi possível excluir o modelo.') })
    }
  }

  const printDocument = () => {
    const previousTitle = document.title
    const fileName = [filling?.config.code, filling?.config.title].filter(Boolean).join(' - ')
    if (fileName) document.title = fileName
    document.body.classList.add('doc-std-printing')
    const cleanup = () => {
      document.body.classList.remove('doc-std-printing')
      document.title = previousTitle
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }

  const feedbackNode = feedback ? (
    <LoginFeedback type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />
  ) : null

  if (mode === 'edit') {
    return (
      <div className="doc-std">
        {feedbackNode}
        <div className="doc-std-toolbar">
          <button type="button" className="secondary-button" onClick={backToList}>
            ← Voltar aos modelos
          </button>
          <button type="button" className="primary-button doc-std-inline-button" onClick={() => void save()} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar modelo'}
          </button>
        </div>

        <div className="doc-std-split">
          <div className="doc-std-editor">
            <h3>{editingId ? 'Editar modelo' : 'Novo modelo'}</h3>
            <label>
              Nome do modelo
              <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Ex.: Comunicado interno" />
            </label>
            <div className="doc-std-row">
              <label>
                Código
                <input value={draft.code} onChange={(e) => updateDraft({ code: e.target.value })} placeholder="Ex.: MED-COM-001" />
              </label>
              <label>
                Título do documento
                <input value={draft.title} onChange={(e) => updateDraft({ title: e.target.value })} placeholder="Ex.: Comunicado Interno" />
              </label>
            </div>
            <label>
              Subtítulo
              <input value={draft.subtitle} onChange={(e) => updateDraft({ subtitle: e.target.value })} placeholder="Opcional" />
            </label>

            <fieldset className="doc-std-fieldset">
              <legend>Campos que serão preenchidos</legend>
              {draft.fields.length === 0 ? (
                <p className="doc-std-hint">Nenhum campo ainda. Adicione as informações que mudam a cada documento.</p>
              ) : null}
              {draft.fields.map((field, index) => (
                <div key={index} className="doc-std-field-row">
                  <input
                    aria-label="Nome do campo"
                    value={field.label}
                    onChange={(e) => updateField(index, { label: e.target.value })}
                  />
                  <select
                    aria-label="Tipo do campo"
                    value={field.type}
                    onChange={(e) => updateField(index, { type: e.target.value as DocumentTemplateFieldType })}
                  >
                    {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <div className="doc-std-field-actions">
                    <button type="button" className="secondary-button" onClick={() => moveField(index, -1)} aria-label="Mover para cima">↑</button>
                    <button type="button" className="secondary-button" onClick={() => moveField(index, 1)} aria-label="Mover para baixo">↓</button>
                    <button type="button" className="danger-button" onClick={() => removeField(index)} aria-label="Remover campo">×</button>
                  </div>
                </div>
              ))}
              <button type="button" className="secondary-button" onClick={addField}>+ Adicionar campo</button>
              <label className="doc-std-check">
                <input
                  type="checkbox"
                  checked={draft.showFieldsTable}
                  onChange={(e) => updateDraft({ showFieldsTable: e.target.checked })}
                />
                Mostrar quadro com os campos no topo do documento
              </label>
            </fieldset>

            <label>
              Texto do documento
              <textarea
                ref={bodyRef}
                rows={10}
                value={draft.body}
                onChange={(e) => updateDraft({ body: e.target.value })}
                placeholder={'# Título de seção\nEscreva o texto e insira os campos abaixo.'}
              />
            </label>
            {draft.fields.length > 0 ? (
              <div className="doc-std-chips" aria-label="Inserir campo no texto">
                <span className="doc-std-hint">Inserir no texto:</span>
                {draft.fields.map((field) => (
                  <button key={field.key} type="button" className="doc-std-chip" onClick={() => insertPlaceholder(field.key)}>
                    {field.label}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="doc-std-hint">
              Dica: comece uma linha com <code># </code> para criar um título de seção. Deixe uma linha em branco entre parágrafos.
            </p>

            <fieldset className="doc-std-fieldset">
              <legend>Assinaturas</legend>
              {draft.signatures.map((role, index) => (
                <div key={`${role}-${index}`} className="doc-std-field-row doc-std-field-row-simple">
                  <span>{role}</span>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => updateDraft({ signatures: draft.signatures.filter((_, i) => i !== index) })}
                    aria-label={`Remover assinatura ${role}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="doc-std-field-row doc-std-field-row-simple">
                <input
                  value={newSignature}
                  onChange={(e) => setNewSignature(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addSignature()
                    }
                  }}
                  placeholder="Ex.: Responsável técnico"
                />
                <button type="button" className="secondary-button" onClick={addSignature}>Adicionar</button>
              </div>
            </fieldset>

            <label>
              Rodapé
              <input value={draft.footer} onChange={(e) => updateDraft({ footer: e.target.value })} />
            </label>
          </div>

          <div className="doc-std-preview-wrap">
            <p className="doc-std-hint">Pré-visualização do layout</p>
            <DocumentPreview config={draft} values={{}} userName={userName} />
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'fill' && filling) {
    const config = filling.config
    return (
      <div className="doc-std">
        {feedbackNode}
        <div className="doc-std-toolbar">
          <button type="button" className="secondary-button" onClick={backToList}>
            ← Voltar aos modelos
          </button>
          <div className="doc-std-toolbar-group">
            <button type="button" className="secondary-button" onClick={() => setValues({})}>
              Limpar
            </button>
            <button type="button" className="primary-button doc-std-inline-button" onClick={printDocument}>
              Imprimir / Salvar PDF
            </button>
          </div>
        </div>

        <div className="doc-std-split">
          <div className="doc-std-editor">
            <h3>{filling.name}</h3>
            {config.fields.length === 0 ? (
              <p className="doc-std-hint">Este modelo não tem campos para preencher.</p>
            ) : null}
            {config.fields.map((field) => (
              <label key={field.key}>
                {field.label}
                {field.type === 'textarea' ? (
                  <textarea
                    rows={5}
                    value={values[field.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                    value={values[field.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  />
                )}
              </label>
            ))}
            <p className="doc-std-hint">
              Na janela de impressão, escolha “Salvar como PDF” para gerar o arquivo.
            </p>
          </div>

          <div className="doc-std-preview-wrap">
            <DocumentPreview config={config} values={values} userName={userName} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="doc-std">
      {feedbackNode}
      <div className="doc-std-toolbar">
        <h3>Modelos de documento</h3>
        <button type="button" className="primary-button doc-std-inline-button" onClick={() => startNew()}>
          + Novo modelo
        </button>
      </div>

      {loading ? <p className="doc-std-hint">Carregando modelos…</p> : null}

      {!loading && templates.length === 0 ? (
        <div className="doc-std-empty">
          <p>Nenhum modelo criado ainda.</p>
          <p className="doc-std-hint">
            Crie o layout uma vez (título, campos, texto e assinaturas). Depois é só preencher as informações e o
            documento sai sempre no mesmo padrão.
          </p>
          <button type="button" className="secondary-button" onClick={() => startNew(EXAMPLE_TEMPLATE)}>
            Começar com um modelo de exemplo
          </button>
        </div>
      ) : null}

      <div className="doc-std-list">
        {templates.map((template) => (
          <div key={template.id} className="doc-std-card">
            <div className="doc-std-card-info">
              <strong>{template.name}</strong>
              <span>
                {[template.config.code, template.config.title].filter(Boolean).join(' · ')}
              </span>
              <span className="doc-std-hint">
                {template.config.fields.length} campo(s)
                {template.createdByName ? ` · criado por ${template.createdByName}` : ''}
              </span>
            </div>
            <div className="doc-std-card-actions">
              <button type="button" className="primary-button doc-std-inline-button" onClick={() => startFill(template)}>
                Preencher
              </button>
              <button type="button" className="secondary-button" onClick={() => startEdit(template)}>
                Editar
              </button>
              <button type="button" className="danger-button" onClick={() => void remove(template)}>
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
