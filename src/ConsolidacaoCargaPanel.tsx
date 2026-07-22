import { FormEvent, useMemo, useState } from 'react'
import { LoginFeedback } from './LoginFeedback'

const CLIENT_FORM_FIELDS = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'instalacao', label: 'Instalação' },
  { key: 'cnpj', label: 'CNPJ' },
  { key: 'simplificada', label: 'Simplificada', kind: 'yesNo' },
  { key: 'medPrincipal', label: 'Med. Principal' },
  { key: 'portaPrinc', label: 'Porta Princ.' },
  { key: 'codCceePrinc', label: 'Cód. CCEE Princ.' },
  { key: 'medRetaguarda', label: 'Med. Retaguarda' },
  { key: 'portaRet', label: 'Porta Ret.' },
  { key: 'codCceeRet', label: 'Cód. CCEE Ret.' },
  { key: 'processoCcee', label: 'Processo CCEE' },
  { key: 'cadastroPim', label: 'Cadastro PIM', kind: 'yesNo' },
  { key: 'solicCadastroScde', label: 'Solic. Cadastro SCDE', kind: 'yesNo' },
  { key: 'pontoCadastrado', label: 'Ponto Cadastrado', kind: 'yesNo' },
  { key: 'cat', label: 'Cat.' },
  { key: 'tensao', label: 'Tensão' },
  { key: 'rtp', label: 'RTP' },
  { key: 'rtc', label: 'RTC' },
  { key: 'demandaMaxKw', label: 'Demanda máx.(kw)' },
  { key: 'ordem', label: 'Ordem' },
  { key: 'endereco', label: 'Endereço', fullWidth: true },
  { key: 'cidade', label: 'Cidade' },
  { key: 'regional', label: 'Regional' },
  { key: 'energizacao', label: 'Energização' },
  { key: 'ano', label: 'Ano' },
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
    () => ['cliente', 'instalacao', 'cnpj'] as ClientFieldKey[],
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
      id: `${Date.now()}-${form.cliente.trim()}`,
      createdAt: new Date().toLocaleString('pt-BR'),
    }

    setClients((current) => [entry, ...current])
    setFeedback({
      type: 'success',
      message: `Cliente "${form.cliente.trim()}" cadastrado com sucesso.`,
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
            const isYesNo = 'kind' in field && field.kind === 'yesNo'
            const isFullWidth = 'fullWidth' in field && field.fullWidth

            return (
              <label
                key={field.key}
                className={isFullWidth ? 'full-width' : undefined}
              >
                {field.label}
                {isYesNo ? (
                  <select
                    value={form[field.key]}
                    onChange={(event) => updateField(field.key, event.target.value)}
                  >
                    <option value="">Selecione</option>
                    <option value="Sim">Sim</option>
                    <option value="Não">Não</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form[field.key]}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    placeholder={field.label}
                    required={requiredKeys.includes(field.key)}
                  />
                )}
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
              <th>Cliente</th>
              <th>Instalação</th>
              <th>CNPJ</th>
              <th>Med. Principal</th>
              <th>Cidade</th>
              <th>Regional</th>
              <th>Cadastrado em</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  Nenhum cliente cadastrado. Clique em Cadastrar cliente para
                  preencher o formulário.
                </td>
              </tr>
            ) : (
              clients.map((client) => (
                <tr key={client.id}>
                  <td>{client.cliente || '—'}</td>
                  <td>{client.instalacao || '—'}</td>
                  <td>{client.cnpj || '—'}</td>
                  <td>{client.medPrincipal || '—'}</td>
                  <td>{client.cidade || '—'}</td>
                  <td>{client.regional || '—'}</td>
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
