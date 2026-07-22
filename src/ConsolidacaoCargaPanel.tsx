import { FormEvent, useMemo, useState } from 'react'
import { LoginFeedback } from './LoginFeedback'

const CLIENT_FORM_FIELDS = [
  { key: 'nomeCliente', label: 'Nome do cliente' },
  { key: 'instalacao', label: 'Instalação' },
  { key: 'dataDenuncia', label: 'Data denúncia', kind: 'date' },
  {
    key: 'dataPrevistaMigracao',
    label: 'Data prevista para migração',
    kind: 'date',
  },
  { key: 'nota', label: 'Nota', fullWidth: true },
] as const

type ClientFieldKey = (typeof CLIENT_FORM_FIELDS)[number]['key']

type ClientFormValues = Record<ClientFieldKey, string>

type RegisteredClient = ClientFormValues & {
  id: string
  createdAt: string
}

const EMPTY_FORM: ClientFormValues = Object.fromEntries(
  CLIENT_FORM_FIELDS.map((field) => [field.key, '']),
) as ClientFormValues

function createEmptyForm(): ClientFormValues {
  return { ...EMPTY_FORM }
}

function formatDateBr(value: string): string {
  if (!value) return '—'
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

type ConsolidacaoCargaPanelProps = {
  readOnly?: boolean
}

export function ConsolidacaoCargaPanel({ readOnly = false }: ConsolidacaoCargaPanelProps) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ClientFormValues>(createEmptyForm)
  const [clients, setClients] = useState<RegisteredClient[]>([])
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const requiredKeys = useMemo(
    () =>
      ['nomeCliente', 'instalacao', 'dataDenuncia', 'dataPrevistaMigracao'] as ClientFieldKey[],
    [],
  )

  const updateField = (key: ClientFieldKey, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const resetForm = () => {
    setForm(createEmptyForm())
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (readOnly) return

    for (const key of requiredKeys) {
      if (!form[key].trim()) {
        const label =
          CLIENT_FORM_FIELDS.find((field) => field.key === key)?.label ?? key
        setFeedback({
          type: 'error',
          message: `Preencha o campo ${label}.`,
        })
        return
      }
    }

    const entry: RegisteredClient = {
      ...form,
      id: `${Date.now()}-${form.nomeCliente.trim()}`,
      createdAt: new Date().toLocaleString('pt-BR'),
    }

    setClients((current) => [entry, ...current])
    setFeedback({
      type: 'success',
      message: `Cliente "${form.nomeCliente.trim()}" cadastrado com sucesso.`,
    })
    resetForm()
    setShowForm(false)
  }

  return (
    <div className="consolidacao-carga-panel">
      {readOnly ? null : (
        <div className="area-actions right-aligned-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setFeedback(null)
              setShowForm((current) => !current)
              if (showForm) resetForm()
            }}
          >
            {showForm ? 'Fechar formulário' : 'Cadastrar cliente'}
          </button>
        </div>
      )}

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      {!readOnly && showForm ? (
        <form className="form-grid consolidacao-cliente-form" onSubmit={handleSubmit}>
          {CLIENT_FORM_FIELDS.map((field) => {
            const isDate = 'kind' in field && field.kind === 'date'
            const isFullWidth = 'fullWidth' in field && field.fullWidth

            return (
              <label
                key={field.key}
                className={isFullWidth ? 'full-width' : undefined}
              >
                {field.label}
                <input
                  type={isDate ? 'date' : 'text'}
                  value={form[field.key]}
                  onChange={(event) => updateField(field.key, event.target.value)}
                  placeholder={isDate ? undefined : field.label}
                  required={requiredKeys.includes(field.key)}
                />
              </label>
            )
          })}

          <div className="consolidacao-cliente-actions full-width">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                resetForm()
                setShowForm(false)
              }}
            >
              Cancelar
            </button>
            <button type="submit" className="primary-button">
              Salvar cliente
            </button>
          </div>
        </form>
      ) : null}

      <div className="entrada-table-wrap consolidacao-clientes-table-wrap">
        <table className="data-table consolidacao-clientes-table">
          <thead>
            <tr>
              <th>Nome do cliente</th>
              <th>Instalação</th>
              <th>Data denúncia</th>
              <th>Data prevista para migração</th>
              <th>Nota</th>
              <th>Cadastrado em</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  Nenhum cliente cadastrado. Clique em Cadastrar cliente para
                  preencher o formulário.
                </td>
              </tr>
            ) : (
              clients.map((client) => (
                <tr key={client.id}>
                  <td>{client.nomeCliente || '—'}</td>
                  <td>{client.instalacao || '—'}</td>
                  <td>{formatDateBr(client.dataDenuncia)}</td>
                  <td>{formatDateBr(client.dataPrevistaMigracao)}</td>
                  <td>{client.nota || '—'}</td>
                  <td>{client.createdAt}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
