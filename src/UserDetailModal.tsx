import { FormEvent, useEffect, useState } from 'react'
import {
  api,
  ApiError,
  type AppUser,
} from './api'
import { roleLabel } from './profilesAccess'
import {
  buildRequestedProfile,
  DEFAULT_AREA_OPTIONS,
  DEFAULT_LOCALITIES,
  EDP_SCOPE_OPTIONS,
  encodeAccessProcess,
  ENGINEER_HOME_SUBAREAS,
  getCrossAreaProcesses,
  parseAccessProcess,
  subtypesForCargo,
} from './registrationOptions'

export type UserUpdatePayload = {
  name: string
  registration: string
  email: string
  whatsapp: string
  birthDate: string
  cpf: string
  jobTitle: string
  workArea: string
  employmentType: string
  edpUnit: string
  locality: string
  thirdPartyCompany: string
  workSubtype: string
  accessAreas: string[]
  accessProcesses: string[]
  personalDescription: string
  hobby: string
  profilePhoto: string
}

type UserDetailModalProps = {
  user: AppUser
  terceiraOptions: string[]
  onClose: () => void
  onSaved: (user: AppUser) => void
  onDeleted?: (userId: string) => void
  onFeedback: (feedback: { type: 'success' | 'error'; message: string }) => void
  startInEditMode?: boolean
}

function statusLabel(status: AppUser['approvalStatus']) {
  return status === 'approved' ? 'Aprovado' : 'Pendente'
}

function formatValue(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : '—'
}

export function UserDetailModal({
  user,
  terceiraOptions,
  onClose,
  onSaved,
  onDeleted,
  onFeedback,
  startInEditMode = false,
}: UserDetailModalProps) {
  const isAdminUser = user.role === 'admin'
  const canDelete = !isAdminUser
  const [editing, setEditing] = useState(startInEditMode)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [cargoOptions, setCargoOptions] = useState<string[]>([
    'Técnico',
    'Analista',
    'Engenheiro',
    'Gestor',
  ])
  const [areaOptions, setAreaOptions] = useState<string[]>([...DEFAULT_AREA_OPTIONS])
  const [tipoOptions, setTipoOptions] = useState<string[]>(['Própria', 'Terceira'])
  const [localityOptions, setLocalityOptions] = useState<string[]>([...DEFAULT_LOCALITIES])

  const [name, setName] = useState(user.name)
  const [registration, setRegistration] = useState(user.registration)
  const [email, setEmail] = useState(user.email)
  const [whatsapp, setWhatsapp] = useState(user.whatsapp ?? '')
  const [birthDate, setBirthDate] = useState(user.birthDate ?? '')
  const [cpf, setCpf] = useState(user.cpf ?? '')
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? '')
  const [workArea, setWorkArea] = useState(user.workArea ?? '')
  const [employmentType, setEmploymentType] = useState(user.employmentType ?? '')
  const [edpUnit, setEdpUnit] = useState(user.edpUnit ?? '')
  const [locality, setLocality] = useState(user.locality ?? '')
  const [thirdPartyCompany, setThirdPartyCompany] = useState(user.thirdPartyCompany ?? '')
  const [workSubtype, setWorkSubtype] = useState(user.workSubtype ?? '')
  const [accessAreas, setAccessAreas] = useState<string[]>(user.accessAreas ?? [])
  const [accessProcesses, setAccessProcesses] = useState<string[]>(user.accessProcesses ?? [])
  const [selectedProcessAreas, setSelectedProcessAreas] = useState<string[]>(() =>
    [...new Set((user.accessProcesses ?? []).map((item) => parseAccessProcess(item)?.area).filter(Boolean))] as string[],
  )
  const [personalDescription, setPersonalDescription] = useState(user.personalDescription ?? '')
  const [hobby, setHobby] = useState(user.hobby ?? '')
  const [profilePhoto, setProfilePhoto] = useState(user.profilePhoto ?? '')

  useEffect(() => {
    void api
      .listCatalogOptions()
      .then(({ catalogs }) => {
        const byKey = Object.fromEntries(
          catalogs.map((catalog) => [catalog.key, catalog.options.map((item) => item.value)]),
        ) as Partial<Record<'cargo' | 'area' | 'tipo' | 'localidade', string[]>>

        if (byKey.cargo?.length) setCargoOptions(byKey.cargo)
        if (byKey.area?.length) setAreaOptions(byKey.area)
        if (byKey.tipo?.length) setTipoOptions(byKey.tipo)
        if (byKey.localidade?.length) setLocalityOptions(byKey.localidade)
      })
      .catch(() => {
        // Mantém fallbacks locais.
      })
  }, [])

  useEffect(() => {
    setName(user.name)
    setRegistration(user.registration)
    setEmail(user.email)
    setWhatsapp(user.whatsapp ?? '')
    setBirthDate(user.birthDate ?? '')
    setCpf(user.cpf ?? '')
    setJobTitle(user.jobTitle ?? '')
    setWorkArea(user.workArea ?? '')
    setEmploymentType(user.employmentType ?? '')
    setEdpUnit(user.edpUnit ?? '')
    setLocality(user.locality ?? '')
    setThirdPartyCompany(user.thirdPartyCompany ?? '')
    setWorkSubtype(user.workSubtype ?? '')
    setAccessAreas(user.accessAreas ?? [])
    setAccessProcesses(user.accessProcesses ?? [])
    setSelectedProcessAreas(
      [...new Set((user.accessProcesses ?? []).map((item) => parseAccessProcess(item)?.area).filter(Boolean))] as string[],
    )
    setPersonalDescription(user.personalDescription ?? '')
    setHobby(user.hobby ?? '')
    setProfilePhoto(user.profilePhoto ?? '')
    setEditing(startInEditMode)
  }, [user, startInEditMode])

  const subtypeOptions = subtypesForCargo(jobTitle, workArea)
  const needsCompany = employmentType === 'Terceira'
  const needsHomeSubareas = jobTitle === 'Engenheiro' && workSubtype === 'Sub-área'
  const needsSpecificProcesses = jobTitle === 'Engenheiro' && workSubtype === 'Processos específicos'
  const crossAreaProcesses = getCrossAreaProcesses(workArea)

  const resetDraft = () => {
    setName(user.name)
    setRegistration(user.registration)
    setEmail(user.email)
    setWhatsapp(user.whatsapp ?? '')
    setBirthDate(user.birthDate ?? '')
    setCpf(user.cpf ?? '')
    setJobTitle(user.jobTitle ?? '')
    setWorkArea(user.workArea ?? '')
    setEmploymentType(user.employmentType ?? '')
    setEdpUnit(user.edpUnit ?? '')
    setLocality(user.locality ?? '')
    setThirdPartyCompany(user.thirdPartyCompany ?? '')
    setWorkSubtype(user.workSubtype ?? '')
    setAccessAreas(user.accessAreas ?? [])
    setAccessProcesses(user.accessProcesses ?? [])
    setSelectedProcessAreas(
      [...new Set((user.accessProcesses ?? []).map((item) => parseAccessProcess(item)?.area).filter(Boolean))] as string[],
    )
    setPersonalDescription(user.personalDescription ?? '')
    setHobby(user.hobby ?? '')
    setProfilePhoto(user.profilePhoto ?? '')
  }

  const toggleSubarea = (area: string) => {
    setAccessAreas((current) =>
      current.includes(area)
        ? current.filter((item) => item !== area)
        : [...current, area],
    )
  }

  const toggleProcessArea = (area: string) => {
    setSelectedProcessAreas((current) => {
      if (current.includes(area)) {
        setAccessProcesses((processes) =>
          processes.filter((encoded) => !encoded.startsWith(`${area}::`)),
        )
        return current.filter((item) => item !== area)
      }
      return [...current, area]
    })
  }

  const toggleProcess = (area: string, process: string) => {
    const encoded = encodeAccessProcess(area, process)
    setAccessProcesses((current) =>
      current.includes(encoded)
        ? current.filter((item) => item !== encoded)
        : [...current, encoded],
    )
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()

    if (isAdminUser) {
      if (!name.trim() || !registration.trim() || !email.trim()) {
        onFeedback({
          type: 'error',
          message: 'Nome, matrícula e e-mail são obrigatórios.',
        })
        return
      }
    } else if (
      !name.trim() ||
      !registration.trim() ||
      !email.trim() ||
      !jobTitle.trim() ||
      !workArea ||
      !employmentType ||
      !edpUnit ||
      !locality ||
      !cpf.trim() ||
      !whatsapp.trim() ||
      !birthDate
    ) {
      onFeedback({
        type: 'error',
        message: 'Preencha todos os campos obrigatórios antes de salvar.',
      })
      return
    }

    if (!isAdminUser && needsCompany && !thirdPartyCompany) {
      onFeedback({ type: 'error', message: 'Selecione a empresa terceira.' })
      return
    }

    if (!isAdminUser && subtypeOptions.length > 0 && !workSubtype) {
      onFeedback({
        type: 'error',
        message:
          jobTitle === 'Engenheiro'
            ? 'Selecione a abrangência do engenheiro.'
            : 'Selecione o escopo.',
      })
      return
    }

    if (!isAdminUser && needsHomeSubareas && accessAreas.length === 0) {
      onFeedback({
        type: 'error',
        message: 'Selecione ao menos uma subárea da home.',
      })
      return
    }

    if (
      !isAdminUser &&
      needsSpecificProcesses &&
      (selectedProcessAreas.length === 0 || accessProcesses.length === 0)
    ) {
      onFeedback({
        type: 'error',
        message: 'Selecione a(s) área(s) e ao menos um processo específico de outra área.',
      })
      return
    }

    setSaving(true)
    try {
      const { user: updated } = await api.updateUser(user.id, {
        name: name.trim(),
        registration: registration.trim(),
        email: email.trim(),
        whatsapp: whatsapp.trim(),
        birthDate,
        cpf: cpf.trim(),
        jobTitle: isAdminUser ? (user.jobTitle ?? '') : jobTitle.trim(),
        workArea: isAdminUser ? (user.workArea ?? '') : workArea,
        employmentType: isAdminUser ? (user.employmentType ?? '') : employmentType,
        edpUnit: isAdminUser ? (user.edpUnit ?? '') : edpUnit,
        locality: isAdminUser ? (user.locality ?? '') : locality,
        thirdPartyCompany: isAdminUser
          ? (user.thirdPartyCompany ?? '')
          : needsCompany
            ? thirdPartyCompany
            : '',
        workSubtype: isAdminUser
          ? (user.workSubtype ?? '')
          : subtypeOptions.length > 0
            ? workSubtype
            : '',
        accessAreas: isAdminUser
          ? (user.accessAreas ?? [])
          : needsHomeSubareas
            ? accessAreas
            : [],
        accessProcesses: isAdminUser
          ? (user.accessProcesses ?? [])
          : needsSpecificProcesses
            ? accessProcesses
            : [],
        personalDescription: personalDescription.trim(),
        hobby: hobby.trim(),
        profilePhoto,
      })
      onSaved(updated)
      setEditing(false)
      onFeedback({ type: 'success', message: 'Informações do usuário atualizadas.' })
    } catch (error) {
      onFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível salvar as alterações.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!canDelete || deleting) return

    const confirmed = window.confirm(
      `Excluir o usuário "${user.name}" (${user.registration})? Esta ação não pode ser desfeita.`,
    )
    if (!confirmed) return

    setDeleting(true)
    try {
      await api.deleteUser(user.id)
      onDeleted?.(user.id)
      onClose()
      onFeedback({ type: 'success', message: 'Usuário excluído.' })
    } catch (error) {
      onFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível excluir o usuário.',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className="ensaios-block-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="ensaios-block-modal user-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-button schedule-slot-modal-close"
          onClick={onClose}
          aria-label="Fechar"
          title="Fechar"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <h3 id="user-detail-title">{editing ? 'Editar usuário' : user.name}</h3>
        <p className="user-detail-subtitle">
          {roleLabel(user.role)} · {statusLabel(user.approvalStatus)}
        </p>

        {profilePhoto ? (
          <img
            className="profile-photo-detail"
            src={profilePhoto}
            alt={`Foto de ${user.name}`}
          />
        ) : null}

        {editing ? (
          <form className="form-grid register-grid user-edit-grid" onSubmit={handleSave} noValidate>
            <label>
              Nome completo
              <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Matrícula
              <input
                type="text"
                value={registration}
                onChange={(event) => setRegistration(event.target.value)}
              />
            </label>
            <label>
              E-mail
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              WhatsApp
              <input
                type="tel"
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
              />
            </label>
            <label>
              Data de nascimento
              <input
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </label>
            <label>
              CPF
              <input type="text" value={cpf} onChange={(event) => setCpf(event.target.value)} />
            </label>

            {!isAdminUser ? (
              <>
                <label>
                  Tipo
                  <select
                    value={employmentType}
                    onChange={(event) => {
                      setEmploymentType(event.target.value)
                      if (event.target.value !== 'Terceira') setThirdPartyCompany('')
                    }}
                  >
                    <option value="">Selecione</option>
                    {tipoOptions.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Abrangência EDP
                  <select value={edpUnit} onChange={(event) => setEdpUnit(event.target.value)}>
                    <option value="">Selecione</option>
                    {EDP_SCOPE_OPTIONS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Área
                  <select
                    value={workArea}
                    onChange={(event) => {
                      setWorkArea(event.target.value)
                      setWorkSubtype('')
                      setAccessAreas([])
                      setAccessProcesses([])
                      setSelectedProcessAreas([])
                    }}
                  >
                    <option value="">Selecione</option>
                    {areaOptions.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cargo
                  <select
                    value={jobTitle}
                    onChange={(event) => {
                      setJobTitle(event.target.value)
                      setWorkSubtype('')
                      setAccessAreas([])
                      setAccessProcesses([])
                      setSelectedProcessAreas([])
                    }}
                  >
                    <option value="">Selecione</option>
                    {cargoOptions.map((cargo) => (
                      <option key={cargo} value={cargo}>
                        {cargo}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Localidade
                  <select value={locality} onChange={(event) => setLocality(event.target.value)}>
                    <option value="">Selecione</option>
                    {localityOptions.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </label>

                {needsCompany ? (
                  <label>
                    Empresa terceira
                    <select
                      value={thirdPartyCompany}
                      onChange={(event) => setThirdPartyCompany(event.target.value)}
                    >
                      <option value="">Selecione</option>
                      {terceiraOptions.map((company) => (
                        <option key={company} value={company}>
                          {company}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {subtypeOptions.length > 0 ? (
                  <label>
                    {jobTitle === 'Engenheiro' ? 'Abrangência do engenheiro' : 'Escopo'}
                    <select
                      value={workSubtype}
                      onChange={(event) => {
                        setWorkSubtype(event.target.value)
                        setAccessAreas([])
                        setAccessProcesses([])
                        setSelectedProcessAreas([])
                      }}
                    >
                      <option value="">Selecione</option>
                      {subtypeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {needsHomeSubareas ? (
                  <fieldset className="approval-subareas user-edit-full">
                    <legend>Subáreas da home</legend>
                    <div className="approval-subareas-grid">
                      {ENGINEER_HOME_SUBAREAS.map((area) => (
                        <label key={area} className="approval-subarea-option">
                          <input
                            type="checkbox"
                            checked={accessAreas.includes(area)}
                            onChange={() => toggleSubarea(area)}
                          />
                          <span>{area}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {needsSpecificProcesses ? (
                  <fieldset className="approval-subareas user-edit-full">
                    <legend>Áreas e processos específicos</legend>
                    <p className="approval-subareas-hint">
                      A área {workArea || 'própria'} já inclui todos os processos. Selecione outras
                      áreas e os processos de responsabilidade cruzada.
                    </p>
                    <div className="approval-subareas-grid">
                      {crossAreaProcesses.map(({ area }) => (
                        <label key={area} className="approval-subarea-option">
                          <input
                            type="checkbox"
                            checked={selectedProcessAreas.includes(area)}
                            onChange={() => toggleProcessArea(area)}
                          />
                          <span>{area}</span>
                        </label>
                      ))}
                    </div>
                    {selectedProcessAreas.map((area) => {
                      const group = crossAreaProcesses.find((item) => item.area === area)
                      if (!group) return null
                      return (
                        <div key={area} className="approval-process-group">
                          <p className="approval-process-group-title">Processos de {area}</p>
                          <div className="approval-subareas-grid">
                            {group.processes.map((process) => {
                              const encoded = encodeAccessProcess(area, process)
                              return (
                                <label key={encoded} className="approval-subarea-option">
                                  <input
                                    type="checkbox"
                                    checked={accessProcesses.includes(encoded)}
                                    onChange={() => toggleProcess(area, process)}
                                  />
                                  <span>{process}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </fieldset>
                ) : null}
              </>
            ) : (
              <p className="user-detail-admin-note user-edit-full">
                O administrador pode ter dados pessoais e de login alterados, mas o perfil
                administrativo não pode ser alterado nem excluído.
              </p>
            )}

            <label className="user-edit-full">
              Descrição pessoal
              <textarea
                rows={3}
                value={personalDescription}
                onChange={(event) => setPersonalDescription(event.target.value)}
              />
            </label>
            <label className="user-edit-full">
              Hobby
              <input type="text" value={hobby} onChange={(event) => setHobby(event.target.value)} />
            </label>

            <label className="register-photo-field user-edit-full">
              Foto de perfil
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  if (!file.type.startsWith('image/') || file.size > 2_000_000) {
                    onFeedback({
                      type: 'error',
                      message: 'Envie uma imagem válida com até 2 MB.',
                    })
                    event.target.value = ''
                    return
                  }
                  const reader = new FileReader()
                  reader.onload = () => {
                    if (typeof reader.result === 'string') {
                      setProfilePhoto(reader.result)
                    }
                  }
                  reader.readAsDataURL(file)
                }}
              />
            </label>

            <div className="user-detail-actions">
              <button
                type="button"
                className="secondary-button compact-button"
                disabled={saving}
                onClick={() => {
                  resetDraft()
                  setEditing(false)
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="primary-button compact-button"
                disabled={saving}
              >
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <dl className="user-detail-grid">
              <div>
                <dt>Matrícula</dt>
                <dd>{formatValue(user.registration)}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd>{formatValue(user.email)}</dd>
              </div>
              <div>
                <dt>WhatsApp</dt>
                <dd>{formatValue(user.whatsapp)}</dd>
              </div>
              <div>
                <dt>Cargo</dt>
                <dd>{formatValue(user.jobTitle)}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>{formatValue(user.employmentType)}</dd>
              </div>
              <div>
                <dt>Abrangência</dt>
                <dd>{formatValue(user.edpUnit)}</dd>
              </div>
              {user.employmentType === 'Terceira' ? (
                <div>
                  <dt>Empresa terceira</dt>
                  <dd>{formatValue(user.thirdPartyCompany)}</dd>
                </div>
              ) : null}
              <div>
                <dt>CPF</dt>
                <dd>{formatValue(user.cpf)}</dd>
              </div>
              <div>
                <dt>Data de nascimento</dt>
                <dd>{formatValue(user.birthDate)}</dd>
              </div>
              <div>
                <dt>Perfil</dt>
                <dd>
                  {buildRequestedProfile(
                    user.jobTitle,
                    user.workSubtype ?? '',
                    user.workArea ?? '',
                    user.accessAreas?.length ? user.accessAreas.join(', ') : undefined,
                    user.accessProcesses?.length
                      ? user.accessProcesses
                          .map((item) => {
                            const parsed = parseAccessProcess(item)
                            return parsed ? `${parsed.area}: ${parsed.process}` : item
                          })
                          .join(', ')
                      : undefined,
                    user.employmentType === 'Terceira' ? user.thirdPartyCompany : undefined,
                    user.edpUnit,
                    user.locality,
                  ) || roleLabel(user.role)}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{statusLabel(user.approvalStatus)}</dd>
              </div>
              <div>
                <dt>Área</dt>
                <dd>{formatValue(user.workArea)}</dd>
              </div>
              <div>
                <dt>{user.jobTitle === 'Engenheiro' ? 'Abrangência' : 'Escopo'}</dt>
                <dd>{formatValue(user.workSubtype)}</dd>
              </div>
              {user.accessAreas?.length ? (
                <div>
                  <dt>Subáreas da home</dt>
                  <dd>{user.accessAreas.join(', ')}</dd>
                </div>
              ) : null}
              {user.accessProcesses?.length ? (
                <div className="user-detail-full">
                  <dt>Processos específicos</dt>
                  <dd>
                    {user.accessProcesses
                      .map((item) => {
                        const parsed = parseAccessProcess(item)
                        return parsed ? `${parsed.area}: ${parsed.process}` : item
                      })
                      .join('; ')}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Localidade</dt>
                <dd>{formatValue(user.locality)}</dd>
              </div>
              <div>
                <dt>Data do cadastro</dt>
                <dd>{new Date(user.requestedAt).toLocaleString('pt-BR')}</dd>
              </div>
              <div>
                <dt>Data da aprovação</dt>
                <dd>
                  {user.approvedAt
                    ? new Date(user.approvedAt).toLocaleString('pt-BR')
                    : '—'}
                </dd>
              </div>
              <div className="user-detail-full">
                <dt>Descrição pessoal</dt>
                <dd>{formatValue(user.personalDescription)}</dd>
              </div>
              <div className="user-detail-full">
                <dt>Hobby</dt>
                <dd>{formatValue(user.hobby)}</dd>
              </div>
            </dl>

            <div className="user-detail-actions">
              <button
                type="button"
                className="primary-button compact-button"
                onClick={() => setEditing(true)}
              >
                Editar informações
              </button>
              {canDelete ? (
                <button
                  type="button"
                  className="danger-button compact-button"
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                >
                  {deleting ? 'Excluindo...' : 'Excluir usuário'}
                </button>
              ) : (
                <span className="user-detail-admin-note">Administrador: edição permitida, exclusão bloqueada.</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
