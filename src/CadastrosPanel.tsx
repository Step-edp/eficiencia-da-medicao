import { FormEvent, useCallback, useEffect, useState } from 'react'
import {
  api,
  ApiError,
  type CatalogGroup,
  type CatalogKey,
} from './api'
import { CADASTRO_PROFILES, getCadastroProfile, groupCadastroProfilesByArea } from './profilesAccess'
import {
  DEFAULT_AREA_OPTIONS,
  DEFAULT_LOCALITIES,
  ENGINEER_HOME_SUBAREAS,
  ENGINEER_SUBTYPES,
  TECHNICIAN_SCOPES_BY_AREA,
} from './registrationOptions'

const FALLBACK_CATALOGS: CatalogGroup[] = [
  {
    key: 'cargo',
    label: 'Cargo',
    options: [
      { id: -1, catalogKey: 'cargo', value: 'Técnico', sortOrder: 0, label: 'Cargo' },
      { id: -2, catalogKey: 'cargo', value: 'Analista', sortOrder: 1, label: 'Cargo' },
      { id: -3, catalogKey: 'cargo', value: 'Engenheiro', sortOrder: 2, label: 'Cargo' },
      { id: -4, catalogKey: 'cargo', value: 'Gestor', sortOrder: 3, label: 'Cargo' },
      { id: -5, catalogKey: 'cargo', value: 'Estagiário', sortOrder: 4, label: 'Cargo' },
      {
        id: -6,
        catalogKey: 'cargo',
        value: 'Assistente Administrativo',
        sortOrder: 5,
        label: 'Cargo',
      },
    ],
  },
  {
    key: 'area',
    label: 'Área',
    options: DEFAULT_AREA_OPTIONS.map((value, index) => ({
      id: -(20 + index),
      catalogKey: 'area' as const,
      value,
      sortOrder: index,
      label: 'Área',
    })),
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
      { id: -11, catalogKey: 'terceira', value: 'BMB', sortOrder: 0, label: 'Empresa terceira' },
      { id: -12, catalogKey: 'terceira', value: 'Cosampa', sortOrder: 1, label: 'Empresa terceira' },
      { id: -13, catalogKey: 'terceira', value: 'Engeserv', sortOrder: 2, label: 'Empresa terceira' },
      { id: -14, catalogKey: 'terceira', value: 'ROTARY', sortOrder: 3, label: 'Empresa terceira' },
      { id: -15, catalogKey: 'terceira', value: 'TIVIT', sortOrder: 4, label: 'Empresa terceira' },
    ],
  },
  {
    key: 'localidade',
    label: 'Localidade',
    options: DEFAULT_LOCALITIES.map((value, index) => ({
      id: -(100 + index),
      catalogKey: 'localidade' as const,
      value,
      sortOrder: index,
      label: 'Localidade',
    })),
  },
  {
    key: 'escopo_csd',
    label: 'Escopo · CSD',
    options: TECHNICIAN_SCOPES_BY_AREA.CSD.map((value, index) => ({
      id: -(200 + index),
      catalogKey: 'escopo_csd' as const,
      value,
      sortOrder: index,
      label: 'Escopo · CSD',
    })),
  },
]

type CadastrosPanelProps = {
  isAdmin: boolean
}

export function CadastrosPanel({ isAdmin }: CadastrosPanelProps) {
  const [catalogs, setCatalogs] = useState<CatalogGroup[]>(FALLBACK_CATALOGS)
  const [loading, setLoading] = useState(true)
  const [selectedProfileId, setSelectedProfileId] = useState(CADASTRO_PROFILES[0]?.id ?? '')
  const profileGroups = groupCadastroProfilesByArea()
  const [drafts, setDrafts] = useState<Record<CatalogKey, string>>({
    cargo: '',
    area: '',
    tipo: '',
    terceira: '',
    localidade: '',
    escopo_csd: '',
  })
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const selectedProfile =
    getCadastroProfile(selectedProfileId) ?? CADASTRO_PROFILES[0]

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
              {profileGroups.map((group) => (
                <optgroup key={group.area} label={group.area}>
                  {group.profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </optgroup>
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
                {profileGroups.flatMap((group) =>
                  group.profiles.map((profile) => (
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
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <p>
        Abaixo ficam as listas usadas no cadastro e na aprovação. Empresa
        terceira, escopo e abrangência do engenheiro são definidos pelo
        responsável ao aprovar o cadastro pendente.
      </p>

      <section className="profiles-section" aria-labelledby="approval-options-title">
        <header className="profiles-section-header">
          <div>
            <h3 id="approval-options-title">Opções de aprovação</h3>
            <p>
              Escopo de Medição e abrangência do engenheiro. As atividades do
              Escopo · CSD são cadastradas na lista editável abaixo.
            </p>
          </div>
        </header>
        <div className="catalogs-grid">
          <section className="catalog-card">
            <header className="catalog-card-header">
              <h3>Escopo · Medição</h3>
            </header>
            <ul className="catalog-option-list">
              {TECHNICIAN_SCOPES_BY_AREA.Medição.map((option) => (
                <li key={option}>
                  <span>{option}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="catalog-card">
            <header className="catalog-card-header">
              <h3>Abrangência do engenheiro</h3>
            </header>
            <ul className="catalog-option-list">
              {ENGINEER_SUBTYPES.map((option) => (
                <li key={option}>
                  <span>{option}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="catalog-card">
            <header className="catalog-card-header">
              <h3>Subáreas / subcélulas (Responsável por sub-célula)</h3>
            </header>
            <ul className="catalog-option-list">
              {ENGINEER_HOME_SUBAREAS.map((option) => (
                <li key={option}>
                  <span>{option}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>

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

              <ul className="catalog-option-list">
                {catalog.options.length ? (
                  catalog.options.map((option) => (
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
                  ))
                ) : (
                  <li>
                    <span>Nenhuma opção cadastrada.</span>
                  </li>
                )}
              </ul>

              {isAdmin && catalog.key !== 'tipo' ? (
                <form
                  className="catalog-add-form"
                  onSubmit={(event) => void handleAdd(catalog.key, event)}
                >
                  <input
                    type="text"
                    placeholder={
                      catalog.key === 'escopo_csd'
                        ? 'Nova atividade do escopo CSD'
                        : `Nova opção de ${catalog.label.toLowerCase()}`
                    }
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
