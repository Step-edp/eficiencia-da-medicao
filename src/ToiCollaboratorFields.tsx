import { useEffect, useState } from 'react'
import { api, type FieldPartnerOption } from './api'
import { FormFieldError } from './FormFieldError'
import { resolveRegisteredUser } from './resolveRegisteredUser'

function RequiredLabel({ children }: { children: string }) {
  return (
    <span className="required-label">
      <span className="required-mark" aria-hidden="true">
        *
      </span>
      {children}
    </span>
  )
}

export type ToiCollaboratorErrors = {
  collaborator1?: string
  collaborator2?: string
}

export function useToiCollaboratorOptions() {
  const [users, setUsers] = useState<FieldPartnerOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void api
      .listToiCollaborators()
      .then(({ users: rows }) => {
        if (!cancelled) setUsers(rows)
      })
      .catch(() => {
        if (!cancelled) setUsers([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { users, loading }
}

function matchUsers(queryValue: string, source: FieldPartnerOption[], excludeId?: string) {
  const query = queryValue.trim().toUpperCase()
  return source.filter((user) => {
    if (excludeId && user.id === excludeId) return false
    if (!query) return true
    const digits = query.replace(/\D/g, '')
    return (
      user.registration.toUpperCase().includes(query) ||
      user.name.toUpperCase().includes(query) ||
      user.label.toUpperCase().includes(query) ||
      (digits.length >= 3 && user.registration.replace(/\D/g, '').includes(digits))
    )
  })
}

function resolveUserFromQuery(
  queryValue: string,
  selectedId: string,
  source: FieldPartnerOption[],
) {
  return resolveRegisteredUser(queryValue, selectedId, source)
}

type CollaboratorSearchProps = {
  id: string
  label: string
  loading: boolean
  disabled?: boolean
  query: string
  selectedId: string
  selected: FieldPartnerOption | null
  matches: FieldPartnerOption[]
  menuOpen: boolean
  error?: string
  hintId: string
  onQueryChange: (value: string) => void
  onOpen: () => void
  onClose: () => void
  onSelect: (user: FieldPartnerOption) => void
}

function CollaboratorSearch({
  id,
  label,
  loading,
  disabled,
  query,
  selectedId,
  selected,
  matches,
  menuOpen,
  error,
  hintId,
  onQueryChange,
  onOpen,
  onClose,
  onSelect,
}: CollaboratorSearchProps) {
  const listId = `${id}-list`
  const errorId = `${id}-error`

  return (
    <div className={`full-width partner-search${error ? ' has-field-error' : ''}`}>
      <RequiredLabel>{label}</RequiredLabel>
      <div className="partner-search-control">
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={loading ? 'Carregando usuários...' : `Digite a matrícula do ${label.toLowerCase()}`}
          disabled={disabled}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={onOpen}
          onBlur={() => {
            window.setTimeout(onClose, 150)
          }}
          aria-invalid={Boolean(error)}
          aria-autocomplete="list"
          aria-expanded={menuOpen}
          aria-controls={listId}
          aria-describedby={`${hintId} ${errorId}`}
        />
        {menuOpen && !loading ? (
          <ul id={listId} className="partner-search-results" role="listbox">
            {matches.length ? (
              matches.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    className={
                      user.id === selectedId
                        ? 'partner-search-option is-selected'
                        : 'partner-search-option'
                    }
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => onSelect(user)}
                  >
                    <strong>{user.registration}</strong>
                    <span>{user.name}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="partner-search-empty">
                Nenhum usuário com perfil Lavratura de TOI encontrado.
              </li>
            )}
          </ul>
        ) : null}
      </div>
      {selected ? (
        <p className="partner-search-selected" role="status">
          Selecionado: {selected.registration} — {selected.name}
        </p>
      ) : null}
      <FormFieldError id={errorId} message={error} />
    </div>
  )
}

type ToiCollaboratorFieldsProps = {
  users: FieldPartnerOption[]
  loading: boolean
  disabled?: boolean
  errors?: ToiCollaboratorErrors
  onClearError?: (field: keyof ToiCollaboratorErrors) => void
  collaborator1UserId: string
  collaborator1Query: string
  collaborator2UserId: string
  collaborator2Query: string
  onCollaborator1Change: (userId: string, query: string) => void
  onCollaborator2Change: (userId: string, query: string) => void
}

export function ToiCollaboratorFields({
  users,
  loading,
  disabled,
  errors,
  onClearError,
  collaborator1UserId,
  collaborator1Query,
  collaborator2UserId,
  collaborator2Query,
  onCollaborator1Change,
  onCollaborator2Change,
}: ToiCollaboratorFieldsProps) {
  const [menu1Open, setMenu1Open] = useState(false)
  const [menu2Open, setMenu2Open] = useState(false)

  const selected1 = users.find((user) => user.id === collaborator1UserId) ?? null
  const selected2 = users.find((user) => user.id === collaborator2UserId) ?? null

  return (
    <fieldset className="toi-team-fieldset full-width">
      <legend>Equipe que lavrou o TOI</legend>
      <p id="toi-collaborators-hint" className="field-hint">
        Informe os colaboradores que fizeram o TOI. Se alguém não estiver na lista, solicite o
        cadastro no portal.
      </p>

      <CollaboratorSearch
        id="toi-collaborator1"
        label="Colaborador 1"
        loading={loading}
        disabled={disabled}
        query={collaborator1Query}
        selectedId={collaborator1UserId}
        selected={selected1}
        matches={matchUsers(collaborator1Query, users, collaborator2UserId)}
        menuOpen={menu1Open}
        error={errors?.collaborator1}
        hintId="toi-collaborators-hint"
        onQueryChange={(value) => {
          onCollaborator1Change('', value)
          onClearError?.('collaborator1')
          setMenu1Open(true)
        }}
        onOpen={() => setMenu1Open(true)}
        onClose={() => setMenu1Open(false)}
        onSelect={(user) => {
          onCollaborator1Change(user.id, user.registration)
          onClearError?.('collaborator1')
          setMenu1Open(false)
        }}
      />

      <CollaboratorSearch
        id="toi-collaborator2"
        label="Colaborador 2"
        loading={loading}
        disabled={disabled}
        query={collaborator2Query}
        selectedId={collaborator2UserId}
        selected={selected2}
        matches={matchUsers(collaborator2Query, users, collaborator1UserId)}
        menuOpen={menu2Open}
        error={errors?.collaborator2}
        hintId="toi-collaborators-hint"
        onQueryChange={(value) => {
          onCollaborator2Change('', value)
          onClearError?.('collaborator2')
          setMenu2Open(true)
        }}
        onOpen={() => setMenu2Open(true)}
        onClose={() => setMenu2Open(false)}
        onSelect={(user) => {
          onCollaborator2Change(user.id, user.registration)
          onClearError?.('collaborator2')
          setMenu2Open(false)
        }}
      />
    </fieldset>
  )
}

export function resolveToiCollaborators(
  query1: string,
  userId1: string,
  query2: string,
  userId2: string,
  users: FieldPartnerOption[],
):
  | { ok: true; collaborator1: FieldPartnerOption; collaborator2: FieldPartnerOption }
  | { ok: false; errors: ToiCollaboratorErrors } {
  const collaborator1 = resolveUserFromQuery(query1, userId1, users)
  const collaborator2 = resolveUserFromQuery(query2, userId2, users)
  const errors: ToiCollaboratorErrors = {}

  if (!collaborator1) {
    errors.collaborator1 =
      'Selecione o colaborador 1 entre os usuários com perfil Lavratura de TOI.'
  }
  if (!collaborator2) {
    errors.collaborator2 =
      'Selecione o colaborador 2 entre os usuários com perfil Lavratura de TOI.'
  }
  if (collaborator1 && collaborator2 && collaborator1.id === collaborator2.id) {
    errors.collaborator2 = 'Os colaboradores 1 e 2 devem ser usuários diferentes.'
  }

  if (errors.collaborator1 || errors.collaborator2 || !collaborator1 || !collaborator2) {
    return { ok: false, errors }
  }

  return { ok: true, collaborator1, collaborator2 }
}
