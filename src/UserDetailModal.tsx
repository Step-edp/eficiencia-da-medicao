import { FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
  getHomeSubareaProcessGroups,
  isEngineerAreaSubtype,
  isEngineerProcessSubtype,
  isEngineerSubcellSubtype,
  mapTakenSubcellAreas,
  normalizeEngineerSubtype,
  parseAccessProcess,
  TECHNICIAN_SCOPES_BY_AREA,
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
  password?: string
}

type UserDetailModalProps = {
  user: AppUser
  approvedUsers: AppUser[]
  orgCells: Array<{
    id: string
    responsibleUserId?: string | null
    responsibleName?: string | null
  }>
  terceiraOptions: string[]
  onClose: () => void
  onSaved: (user: AppUser) => void
  onDeleted?: (userId: string) => void
  onFeedback: (feedback: { type: 'success' | 'error'; message: string }) => void
  startInEditMode?: boolean
  showPassword?: boolean
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
  approvedUsers,
  orgCells,
  terceiraOptions,
  onClose,
  onSaved,
  onDeleted,
  onFeedback,
  startInEditMode = false,
  showPassword = false,
}: UserDetailModalProps) {
  const isAdminUser = user.role === 'admin'
  const canDelete = !isAdminUser
  const [editing, setEditing] = useState(startInEditMode)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [cargoOptions, setCargoOptions] = useState<string[]>([
    'Técnico',
    'Analista',
    'Engenheiro',
    'Gestor',
    'Estagiário',
    'Assistente Administrativo',
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
  const [workSubtype, setWorkSubtype] = useState(
    user.jobTitle === 'Engenheiro'
      ? normalizeEngineerSubtype(user.workSubtype)
      : (user.workSubtype ?? ''),
  )
  const [accessAreas, setAccessAreas] = useState<string[]>(user.accessAreas ?? [])
  const [accessProcesses, setAccessProcesses] = useState<string[]>(user.accessProcesses ?? [])
  const [selectedProcessAreas, setSelectedProcessAreas] = useState<string[]>(() =>
    [...new Set((user.accessProcesses ?? []).map((item) => parseAccessProcess(item)?.area).filter(Boolean))] as string[],
  )
  const [observation, setObservation] = useState(user.personalDescription ?? '')
  const [profilePhoto, setProfilePhoto] = useState(user.profilePhoto ?? '')
  const [profilePhotoName, setProfilePhotoName] = useState('')
  const [password, setPassword] = useState(user.password ?? '')
  const [csdScopeOptions, setCsdScopeOptions] = useState<string[]>([
    ...TECHNICIAN_SCOPES_BY_AREA.CSD,
  ])
  const photoInputId = `user-photo-${user.id}`

  useEffect(() => {
    void api
      .listCatalogOptions()
      .then(({ catalogs }) => {
        const byKey = Object.fromEntries(
          catalogs.map((catalog) => [catalog.key, catalog.options.map((item) => item.value)]),
        ) as Partial<
          Record<'cargo' | 'area' | 'tipo' | 'localidade' | 'escopo_csd', string[]>
        >

        if (byKey.cargo?.length) setCargoOptions(byKey.cargo)
        if (byKey.area?.length) setAreaOptions(byKey.area)
        if (byKey.tipo?.length) setTipoOptions(byKey.tipo)
        if (byKey.localidade?.length) setLocalityOptions(byKey.localidade)
        if (byKey.escopo_csd?.length) setCsdScopeOptions(byKey.escopo_csd)
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
    setWorkSubtype(
      user.jobTitle === 'Engenheiro'
        ? normalizeEngineerSubtype(user.workSubtype)
        : (user.workSubtype ?? ''),
    )
    setAccessAreas(user.accessAreas ?? [])
    setAccessProcesses(user.accessProcesses ?? [])
    setSelectedProcessAreas(
      [...new Set((user.accessProcesses ?? []).map((item) => parseAccessProcess(item)?.area).filter(Boolean))] as string[],
    )
    setObservation(user.personalDescription ?? '')
    setProfilePhoto(user.profilePhoto ?? '')
    setProfilePhotoName('')
    setPassword(user.password ?? '')
    setEditing(startInEditMode)
  }, [user, startInEditMode])

  const subtypeOptions = (() => {
    const base = [...subtypesForCargo(jobTitle, workArea, { csdScopes: csdScopeOptions })]
    if (
      jobTitle === 'Engenheiro' &&
      isEngineerProcessSubtype(workSubtype) &&
      !base.includes(workSubtype)
    ) {
      base.push(workSubtype)
    }
    if (workSubtype && !base.includes(workSubtype)) {
      base.push(workSubtype)
    }
    return base
  })()
  const needsCompany = employmentType === 'Terceira'
  const needsHomeSubareas = jobTitle === 'Engenheiro' && isEngineerSubcellSubtype(workSubtype)
  const isCellOwnerSubtype = jobTitle === 'Engenheiro' && isEngineerAreaSubtype(workSubtype)
  const needsSpecificProcesses =
    jobTitle === 'Engenheiro' && isEngineerProcessSubtype(workSubtype)
  const needsInternProcesses =
    jobTitle === 'Estagiário' && workArea.trim() === 'Medição'
  const needsProcessAssignment = needsSpecificProcesses || needsInternProcesses
  const takenSubcellAreas = mapTakenSubcellAreas(approvedUsers, user.id, {
    candidateId: user.id,
    candidateSubtype: workSubtype,
    orgCells: orgCells.map((cell) => ({
      id: cell.id,
      responsibleUserId: cell.responsibleUserId ?? null,
      responsibleName: cell.responsibleName ?? null,
    })),
  })
  const homeSubareaProcesses = getHomeSubareaProcessGroups()

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
    setWorkSubtype(
      user.jobTitle === 'Engenheiro'
        ? normalizeEngineerSubtype(user.workSubtype)
        : (user.workSubtype ?? ''),
    )
    setAccessAreas(user.accessAreas ?? [])
    setAccessProcesses(user.accessProcesses ?? [])
    setSelectedProcessAreas(
      [...new Set((user.accessProcesses ?? []).map((item) => parseAccessProcess(item)?.area).filter(Boolean))] as string[],
    )
    setObservation(user.personalDescription ?? '')
    setProfilePhoto(user.profilePhoto ?? '')
    setProfilePhotoName('')
    setPassword(user.password ?? '')
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

    if (!isAdminUser && needsHomeSubareas) {
      const conflict = accessAreas.find((area) => takenSubcellAreas.has(area))
      if (conflict) {
        onFeedback({
          type: 'error',
          message: `A subárea "${conflict}" já possui responsável: ${takenSubcellAreas.get(conflict)}.`,
        })
        return
      }
    }

    if (
      !isAdminUser &&
      needsSpecificProcesses &&
      (selectedProcessAreas.length === 0 || accessProcesses.length === 0)
    ) {
      onFeedback({
        type: 'error',
        message: 'Selecione a(s) subárea(s) e ao menos um processo específico dentro delas.',
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
          : needsProcessAssignment
            ? accessProcesses
            : [],
        personalDescription: observation.trim(),
        hobby: user.hobby ?? '',
        profilePhoto,
        ...(showPassword && password.trim() ? { password: password.trim() } : {}),
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

    setDeleting(true)
    try {
      await api.deleteUser(user.id)
      onDeleted?.(user.id)
      setConfirmDeleteOpen(false)
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
            <label className="register-name-field">
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

                {isCellOwnerSubtype ? (
                  <p className="approval-subareas-hint user-edit-full" role="note">
                    Como responsável pela célula, este engenheiro cobre todas as subáreas da
                    área e não pode ser responsável por subárea individual.
                  </p>
                ) : null}

                {needsHomeSubareas ? (
                  <fieldset className="approval-subareas user-edit-full">
                    <legend>Subáreas da home</legend>
                    <p className="approval-subareas-hint">
                      Cada subárea pode ter apenas um responsável por sub-célula.
                    </p>
                    <div className="approval-subareas-grid">
                      {ENGINEER_HOME_SUBAREAS.map((area) => {
                        const takenBy = takenSubcellAreas.get(area)
                        const isSelected = accessAreas.includes(area)
                        const isLocked = Boolean(takenBy) && !isSelected
                        return (
                          <label
                            key={area}
                            className={`approval-subarea-option${isLocked ? ' is-taken' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isLocked}
                              onChange={() => {
                                if (isLocked) return
                                toggleSubarea(area)
                              }}
                            />
                            <span>
                              {area}
                              {takenBy && !isSelected ? (
                                <small className="approval-subarea-taken">
                                  Já responsável: {takenBy}
                                </small>
                              ) : null}
                              {takenBy && isSelected ? (
                                <small className="approval-subarea-taken">
                                  Conflito com {takenBy} — desmarque para corrigir
                                </small>
                              ) : null}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                ) : null}

                {needsProcessAssignment ? (
                  <fieldset className="approval-subareas user-edit-full">
                    <legend>
                      {needsInternProcesses
                        ? 'Processos atribuídos ao estagiário'
                        : 'Processos específicos por subárea'}
                    </legend>
                    <p className="approval-subareas-hint">
                      {needsInternProcesses
                        ? 'Opcional. Selecione as subáreas e os processos que este estagiário verá em Seus processos na home.'
                        : 'Selecione as subáreas da home e, em cada uma, os processos específicos de responsabilidade deste engenheiro.'}
                    </p>
                    <div className="approval-subareas-grid">
                      {homeSubareaProcesses.map(({ area }) => (
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
                      const group = homeSubareaProcesses.find((item) => item.area === area)
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

            {showPassword ? (
              <label className="user-edit-full">
                Senha de acesso
                <input
                  type="text"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Senha do usuário"
                  autoComplete="off"
                />
              </label>
            ) : null}

            <label className="user-edit-full">
              Observação
              <textarea
                rows={3}
                value={observation}
                onChange={(event) => setObservation(event.target.value)}
                placeholder="Observações sobre o usuário (opcional)"
              />
            </label>

            <div className="register-photo-field user-edit-full">
              <span>Foto de perfil</span>
              <div className="file-picker">
                <input
                  id={photoInputId}
                  className="file-picker-input"
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
                        setProfilePhotoName(file.name)
                      }
                    }
                    reader.readAsDataURL(file)
                  }}
                />
                <label htmlFor={photoInputId} className="file-picker-button">
                  Escolher imagem
                </label>
                <span className="file-picker-name">
                  {profilePhotoName ||
                    (profilePhoto ? 'Imagem atual mantida' : 'Nenhuma imagem selecionada')}
                </span>
              </div>
              {profilePhoto ? (
                <span className="register-photo-preview">
                  <img src={profilePhoto} alt="Pré-visualização da foto de perfil" />
                </span>
              ) : null}
            </div>

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
              {showPassword ? (
                <div>
                  <dt>Senha</dt>
                  <dd className="user-password-value">
                    {user.password?.trim() ? user.password : 'Indisponível (cadastro antigo)'}
                  </dd>
                </div>
              ) : null}
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
              <div>
                <dt>Aprovado por</dt>
                <dd>
                  {user.approvedByName || user.approvedByRegistration
                    ? `${user.approvedByName || '—'}${
                        user.approvedByRegistration
                          ? ` (${user.approvedByRegistration})`
                          : ''
                      }`
                    : '—'}
                </dd>
              </div>
              {user.personalDescription?.trim() ? (
                <div className="user-detail-full">
                  <dt>Observação</dt>
                  <dd>{user.personalDescription}</dd>
                </div>
              ) : null}
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
                  onClick={() => setConfirmDeleteOpen(true)}
                >
                  Excluir usuário
                </button>
              ) : (
                <span className="user-detail-admin-note">Administrador: edição permitida, exclusão bloqueada.</span>
              )}
            </div>
          </>
        )}
      </div>
      {confirmDeleteOpen
        ? createPortal(
            <div
              className="ensaios-block-modal-overlay confirm-delete-overlay"
              role="presentation"
              onClick={() => {
                if (deleting) return
                setConfirmDeleteOpen(false)
              }}
            >
              <div
                className="ensaios-block-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="user-detail-delete-title"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 id="user-detail-delete-title">Excluir cadastro</h3>
                <p className="ensaios-unblock-message">
                  Excluir o cadastro de <strong>{user.name}</strong> ({user.registration})?
                  Esta ação não pode ser desfeita.
                </p>
                <div className="ensaios-block-modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={deleting}
                    onClick={() => setConfirmDeleteOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={deleting}
                    onClick={() => void handleDelete()}
                  >
                    {deleting ? 'Excluindo...' : 'Excluir'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
