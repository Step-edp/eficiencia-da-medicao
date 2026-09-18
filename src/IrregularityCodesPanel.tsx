import { FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ApiError, type IrregularityCodeRecord } from './api'
import { LoginFeedback } from './LoginFeedback'

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20zM14.5 5l4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IrregularityCodesPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [codes, setCodes] = useState<IrregularityCodeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState<IrregularityCodeRecord | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { codes: rows } = await api.listIrregularityCodes()
      setCodes(rows)
    } catch (error) {
      setCodes([])
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os códigos de irregularidade.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const resetForm = () => {
    setCode('')
    setDescription('')
    setEditing(null)
    setShowForm(false)
  }

  const startEdit = (row: IrregularityCodeRecord) => {
    setEditing(row)
    setCode(row.code)
    setDescription(row.description)
    setShowForm(true)
    setFeedback(null)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!code.trim() || !description.trim()) {
      setFeedback({
        type: 'error',
        message: 'Informe o código e a descrição da irregularidade.',
      })
      return
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      if (editing) {
        const { code: updated } = await api.updateIrregularityCode(editing.id, {
          code: code.trim(),
          description: description.trim(),
        })
        setCodes((current) =>
          current
            .map((item) => (item.id === updated.id ? updated : item))
            .sort((left, right) => left.code.localeCompare(right.code, 'pt-BR')),
        )
        setFeedback({
          type: 'success',
          message: `Código ${updated.code} atualizado.`,
        })
      } else {
        const { code: created } = await api.createIrregularityCode({
          code: code.trim(),
          description: description.trim(),
        })
        setCodes((current) =>
          [...current, created].sort((left, right) => left.code.localeCompare(right.code, 'pt-BR')),
        )
        setFeedback({
          type: 'success',
          message: `Código ${created.code} cadastrado.`,
        })
      }
      resetForm()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível salvar o código de irregularidade.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (row: IrregularityCodeRecord) => {
    const confirmed = window.confirm(`Excluir o código ${row.code}?`)
    if (!confirmed) return

    setDeletingId(row.id)
    setFeedback(null)
    try {
      await api.deleteIrregularityCode(row.id)
      setCodes((current) => current.filter((item) => item.id !== row.id))
      if (editing?.id === row.id) resetForm()
      setFeedback({
        type: 'success',
        message: `Código ${row.code} excluído.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível excluir o código de irregularidade.',
      })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="irregularity-codes-panel">
      {readOnly ? null : (
        <div className="area-actions right-aligned-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              if (showForm) {
                resetForm()
                return
              }
              setShowForm(true)
              setFeedback(null)
            }}
          >
            {showForm ? 'Fechar formulário' : 'Novo código'}
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
        <form className="material-form-grid apresentacao-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Código
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Ex.: 23"
              required
              disabled={submitting}
            />
          </label>
          <label className="full-width">
            Descrição
            <input
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ex.: MANCAL FORA DE POSIÇÃO"
              required
              disabled={submitting}
            />
          </label>
          <div className="agenda-form-actions full-width">
            <button
              type="button"
              className="secondary-button"
              disabled={submitting}
              onClick={resetForm}
            >
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar código'}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">Carregando códigos...</p>
      ) : codes.length === 0 ? (
        <p className="entrada-panel-empty">Nenhum código de irregularidade cadastrado.</p>
      ) : (
        <div className="entrada-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                {readOnly ? null : <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {codes.map((row) => (
                <tr key={row.id}>
                  <td>{row.code}</td>
                  <td>{row.description}</td>
                  {readOnly ? null : (
                    <td>
                      <div className="table-row-actions">
                        <button
                          type="button"
                          className="csds-icon-button"
                          onClick={() => startEdit(row)}
                          aria-label={`Editar código ${row.code}`}
                          title="Editar"
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className="csds-icon-button is-danger"
                          onClick={() => void handleDelete(row)}
                          disabled={deletingId === row.id}
                          aria-label={`Excluir código ${row.code}`}
                          title="Excluir"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
