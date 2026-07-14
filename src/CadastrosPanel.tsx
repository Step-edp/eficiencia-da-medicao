import { FormEvent, useCallback, useEffect, useState } from 'react'
import {
  api,
  ApiError,
  type CatalogGroup,
  type CatalogKey,
} from './api'
import { CADASTRO_PROFILES } from './profilesAccess'

const FALLBACK_CATALOGS: CatalogGroup[] = [
  {
    key: 'cargo',
    label: 'Cargo',
    options: [
      { id: -1, catalogKey: 'cargo', value: 'Técnico', sortOrder: 0, label: 'Cargo' },
      { id: -2, catalogKey: 'cargo', value: 'Analista', sortOrder: 1, label: 'Cargo' },
      { id: -3, catalogKey: 'cargo', value: 'Engenheiro', sortOrder: 2, label: 'Cargo' },
    ],
  },
  {
    key: 'area',
    label: 'Área',
    options: [
      { id: -4, catalogKey: 'area', value: 'Medição', sortOrder: 0, label: 'Área' },
      { id: -5, catalogKey: 'area', value: 'CSD', sortOrder: 1, label: 'Área' },
      { id: -6, catalogKey: 'area', value: 'Consumo Irregular', sortOrder: 2, label: 'Área' },
      { id: -7, catalogKey: 'area', value: 'Grandes Clientes', sortOrder: 3, label: 'Área' },
      { id: -8, catalogKey: 'area', value: 'Qualidade', sortOrder: 4, label: 'Área' },
    ],
  },
  {
    key: 'tipo',
    label: 'Tipo',
    options: [
      { id: -9, catalogKey: 'tipo', value: 'Própria', sortOrder: 0, label: 'Tipo' },
      { id: -10, catalogKey: 'tipo', value: 'Terceira', sortOrder: 1, label: 'Tipo' },
    ],
  },
  {
    key: 'terceira',
    label: 'Empresa terceira',
    options: [
      { id: -11, catalogKey: 'terceira', value: 'Cennatech', sortOrder: 0, label: 'Empresa terceira' },
      { id: -12, catalogKey: 'terceira', value: 'Ecori', sortOrder: 1, label: 'Empresa terceira' },
      { id: -13, catalogKey: 'terceira', value: 'Landis+Gyr', sortOrder: 2, label: 'Empresa terceira' },
      { id: -14, catalogKey: 'terceira', value: 'Metta Brasil', sortOrder: 3, label: 'Empresa terceira' },
      { id: -15, catalogKey: 'terceira', value: 'SEW', sortOrder: 4, label: 'Empresa terceira' },
      { id: -16, catalogKey: 'terceira', value: 'Steenge', sortOrder: 5, label: 'Empresa terceira' },
    ],
  },
]

type CadastrosPanelProps = {
  isAdmin: boolean
}

export function CadastrosPanel({ isAdmin }: CadastrosPanelProps) {
  const [catalogs, setCatalogs] = useState<CatalogGroup[]>(FALLBACK_CATALOGS)
  const [loading, setLoading] = useState(true)
  const [selectedProfileId, setSelectedProfileId] = useState(CADASTRO_PROFILES[0]?.id ?? '')
  const [drafts, setDrafts] = useState<Record<CatalogKey, string>>({
    cargo: '',
    area: '',
    tipo: '',
    terceira: '',
  })
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const selectedProfile =
    CADASTRO_PROFILES.find((profile) => profile.id === selectedProfileId) ?? CADASTRO_PROFILES[0]

  const loadCatalogs = useCallback(async () => {
    setLoading(true)
    try {
      const { catalogs: rows } = await api.listCatalogOptions()
      setCatalogs(rows)
    } catch {
      setCatalogs(FALLBACK_CATALOGS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCatalogs()
  }, [loadCatalogs])

  const handleAdd = async (catalogKey: CatalogKey, event: FormEvent) => {
    event.preventDefault()
    if (!isAdmin) return

    const value = drafts[catalogKey].trim()
    if (!value) {
      setFeedback({ type: 'error', message: 'Informe um valor para cadastrar.' })
      return
    }

    try {
      await api.createCatalogOption({ catalogKey, value })
      setDrafts((current) => ({ ...current, [catalogKey]: '' }))
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

  const handleDelete = async (id: number, catalogKey: CatalogKey) => {
    if (!isAdmin || catalogKey === 'tipo') return

    try {
      await api.deleteCatalogOption(id)
      setFeedback({ type: 'success', message: 'Opção removida.' })
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

  return (
    <>
      <section className="profiles-section" aria-labelledby="cadastros-perfis-title">
        <header className="profiles-section-header">
          <div>
            <h3 id="cadastros-perfis-title">Perfis</h3>
            <p>Selecione um perfil para ver a descrição de acesso.</p>
          </div>
        </header>

        <div className="profiles-selector">
          <label>
            Perfil
            <select
              value={selectedProfile?.id ?? ''}
              onChange={(event) => setSelectedProfileId(event.target.value)}
              aria-label="Selecionar perfil"
            >
              {CADASTRO_PROFILES.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>

          {selectedProfile ? (
            <article className="profile-description-card" aria-live="polite">
              <p className="profile-card-areas-label">Descrição</p>
              <h4>{selectedProfile.name}</h4>
              <p className="profile-card-description">{selectedProfile.description}</p>
            </article>
          ) : null}

          <div className="profiles-table-wrap">
            <table className="data-table profiles-table">
              <thead>
                <tr>
                  <th>Perfil</th>
                  <th>Descrição</th>
                </tr>
              </thead>
              <tbody>
                {CADASTRO_PROFILES.map((profile) => (
                  <tr
                    key={profile.id}
                    className={
                      profile.id === selectedProfile?.id
                        ? 'profiles-table-row is-selected'
                        : 'profiles-table-row'
                    }
                    tabIndex={0}
                    role="button"
                    aria-pressed={profile.id === selectedProfile?.id}
                    onClick={() => setSelectedProfileId(profile.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedProfileId(profile.id)
                      }
                    }}
                  >
                    <td>{profile.name}</td>
                    <td>{profile.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <p>
        Abaixo ficam as listas suspensas usadas no cadastro de usuários. O
        administrador pode incluir novas opções.
      </p>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      {loading ? (
        <p className="entrada-panel-empty">Carregando listas...</p>
      ) : (
        <div className="catalogs-grid">
          {catalogs.map((catalog) => (
            <section key={catalog.key} className="catalog-card">
              <header className="catalog-card-header">
                <h3>{catalog.label}</h3>
                <span>{catalog.options.length} opção(ões)</span>
              </header>

              <label>
                Pré-visualização
                <select defaultValue="" aria-label={`Lista de ${catalog.label}`}>
                  <option value="" disabled>
                    Selecione...
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
                    {isAdmin && catalog.key !== 'tipo' && option.id > 0 ? (
                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={() => void handleDelete(option.id, catalog.key)}
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
                  onSubmit={(event) => void handleAdd(catalog.key, event)}
                >
                  <input
                    type="text"
                    placeholder={`Nova opção de ${catalog.label.toLowerCase()}`}
                    value={drafts[catalog.key]}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [catalog.key]: event.target.value,
                      }))
                    }
                  />
                  <button className="primary-button compact-button" type="submit">
                    Adicionar
                  </button>
                </form>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </>
  )
}
