import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  api,
  ApiError,
  type ConsolidacaoCargaClienteRecord,
} from './api'
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

function formatDateTimeBr(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR')
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MIN_DATE_GAP_DAYS = 180

function daysBetween(dateA: string, dateB: string): number | null {
  const a = new Date(`${dateA}T00:00:00`)
  const b = new Date(`${dateB}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.abs(Math.round((b.getTime() - a.getTime()) / MS_PER_DAY))
}

const NINE_DIGITS = 9

function formatNineDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, NINE_DIGITS)
}

type ConsolidacaoCargaPanelProps = {
  readOnly?: boolean
}

export function ConsolidacaoCargaPanel({ readOnly = false }: ConsolidacaoCargaPanelProps) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ClientFormValues>(createEmptyForm)
  const [clients, setClients] = useState<ConsolidacaoCargaClienteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const requiredKeys = useMemo(
    () => CLIENT_FORM_FIELDS.map((field) => field.key),
    [],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { clients: rows } = await api.listConsolidacaoCargaClientes()
      setClients(rows)
    } catch (error) {
      setClients([])
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os clientes cadastrados.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const updateField = (key: ClientFieldKey, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const resetForm = () => {
    setForm(createEmptyForm())
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (readOnly || creating) return

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

    const gapDays = daysBetween(form.dataDenuncia, form.dataPrevistaMigracao)
    if (gapDays === null || gapDays < MIN_DATE_GAP_DAYS) {
      setFeedback({
        type: 'error',
        message:
          'A Data denúncia e a Data prevista para migração devem ter pelo menos 180 dias de diferença.',
      })
      return
    }

    if (form.instalacao.length !== NINE_DIGITS) {
      setFeedback({
        type: 'error',
        message: `O campo Instalação deve ter exatamente ${NINE_DIGITS} dígitos.`,
      })
      return
    }

    if (form.nota.length !== NINE_DIGITS) {
      setFeedback({
        type: 'error',
        message: `O campo Nota deve ter exatamente ${NINE_DIGITS} dígitos.`,
      })
      return
    }

    setCreating(true)
    setFeedback(null)
    try {
      const { client } = await api.createConsolidacaoCargaCliente({
        nomeCliente: form.nomeCliente.trim(),
        instalacao: form.instalacao,
        dataDenuncia: form.dataDenuncia,
        dataPrevistaMigracao: form.dataPrevistaMigracao,
        nota: form.nota,
      })
      setClients((current) => [client, ...current])
      setFeedback({
        type: 'success',
        message: `Cliente "${client.nomeCliente}" cadastrado com sucesso.`,
      })
      resetForm()
      setShowForm(false)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível cadastrar o cliente.',
      })
    } finally {
      setCreating(false)
    }
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
                {field.key === 'instalacao' || field.key === 'nota' ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={NINE_DIGITS}
                    value={form[field.key]}
                    onChange={(event) =>
                      updateField(field.key, formatNineDigits(event.target.value))
                    }
                    placeholder="000000000"
                    required
                    disabled={creating}
                  />
                ) : isDate ? (
                  <input
                    type="date"
                    className="consolidacao-date-input"
                    value={form[field.key]}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    onClick={(event) => {
                      const input = event.currentTarget
                      if (typeof input.showPicker === 'function') {
                        try {
                          input.showPicker()
                        } catch {
                          // Navegadores podem bloquear showPicker fora de gesto confiável.
                        }
                      }
                    }}
                    required
                    disabled={creating}
                  />
                ) : (
                  <input
                    type="text"
                    value={form[field.key]}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    placeholder={field.label}
                    required
                    disabled={creating}
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
              disabled={creating}
            >
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={creating}>
              {creating ? 'Salvando…' : 'Salvar cliente'}
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
            {loading ? (
              <tr>
                <td colSpan={6}>Carregando clientes…</td>
              </tr>
            ) : clients.length === 0 ? (
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
                  <td>{formatDateTimeBr(client.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
