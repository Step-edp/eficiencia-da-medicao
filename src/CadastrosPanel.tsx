import { FormEvent, useCallback, useEffect, useState } from 'react'
import {
  api,
  ApiError,
  type CatalogKey,
  type CatalogOption,
  type CatalogGroup,
} from './api'

type CadastrosPanelProps = {
  isAdmin: boolean
}

export function CadastrosPanel({ isAdmin }: CadastrosPanelProps) {
  const [catalogs, setCatalogs] = useState<CatalogGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Partial<Record<CatalogKey, string>>>({})
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const loadCatalogs = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.listCatalogOptions()
      setCatalogs(response.catalogs)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar as listas.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCatalogs()
  }, [loadCatalogs])

  const handleAdd = async (event: FormEvent<HTMLFormElement>, key: CatalogKey) => {
    event.preventDefault()
    const value = drafts[key]?.trim() ?? ''
    if (!value) {
      setFeedback({ type: 'error', message: 'Informe um valor para cadastrar.' })
      return
    }

    try {
      await api.createCatalogOption(key, value)
      setDrafts((current) => ({ ...current, [key]: '' }))
      setFeedback({ type: 'success', message: `Opção "${value}" cadastrada.` })
      await loadCatalogs()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível cadastrar a opção.',
      })
    }
  }

  const handleDelete = async (option: CatalogOption) => {
    try {
      await api.deleteCatalogOption(option.id)
      setFeedback({
        type: 'success',
        message: `Opção "${option.value}" removida.`,
      })
      await loadCatalogs()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível remover a opção.',
      })
    }
  }

  if (loading) {
    return <p className="entrada-panel-empty">Carregando listas...</p>
  }

  return (
    <>
      <p>
        Aqui ficam todas as listas suspensas usadas no cadastro de usuários.
        Você pode consultar as opções e, se for administrador, incluir ou remover
        itens.
      </p>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      <div className="catalogs-grid">
        {catalogs.map((catalog) => (
          <section key={catalog.key} className="catalog-card">
            <header className="catalog-card-header">
              <h3>{catalog.label}</h3>
              <span>{catalog.options.length} opção(ões)</span>
            </header>

            <label>
              Visualizar lista
              <select defaultValue="" aria-label={`Lista de ${catalog.label}`}>
                <option value="" disabled>
                  Selecione para ver as opções
                </option>
                {catalog.options.map((option) => (
                  <option key={option.id} value={option.value}>
                    {option.value}
                  </option>
                ))}
              </select>
            </label>

            <ul className="catalog-option-list">
              {catalog.options.map((option) => (
                <li key={option.id}>
                  <span>{option.value}</span>
                  {isAdmin && catalog.key !== 'tipo' ? (
                    <button
                      type="button"
                      className="secondary-button compact-button"
                      onClick={() => void handleDelete(option)}
                    >
                      Remover
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>

            {isAdmin && catalog.key !== 'tipo' ? (
              <form
                className="catalog-add-form"
                onSubmit={(event) => void handleAdd(event, catalog.key)}
              >
                <label>
                  Nova opção de {catalog.label.toLowerCase()}
                  <input
                    type="text"
                    value={drafts[catalog.key] ?? ''}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [catalog.key]: event.target.value,
                      }))
                    }
                    placeholder={`Digite um(a) ${catalog.label.toLowerCase()}`}
                  />
                </label>
                <button className="primary-button compact-button" type="submit">
                  Adicionar
                </button>
              </form>
            ) : null}
          </section>
        ))}
      </div>
    </>
  )
}
