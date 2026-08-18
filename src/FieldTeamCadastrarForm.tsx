import { FormEvent, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, type FieldPartnerOption } from './api'
import { FormFieldError } from './FormFieldError'
import {
  NUMERIC_FIELD_LIMITS,
  NumericFieldKey,
  sanitizeNumericInput,
  validateNumericField,
} from './numericFieldValidation'
import { readImageAsDataUrl } from './readImageAsDataUrl'
import { useCsdsOptions } from './useCsdsOptions'

type RequiredLabelProps = {
  children: string
}

function RequiredLabel({ children }: RequiredLabelProps) {
  return (
    <span className="required-label">
      <span className="required-mark" aria-hidden="true">
        *
      </span>
      {children}
    </span>
  )
}

type FieldTeamFieldErrors = Partial<
  Record<
    | NumericFieldKey
    | 'csd'
    | 'partner'
    | 'envelopePhoto'
    | 'envelopeSeal'
    | 'collaborator1'
    | 'collaborator2'
    | 'teamReason',
    string
  >
>

type FieldTeamCadastrarFormProps = {
  requireToiTeam?: boolean
}

export function FieldTeamCadastrarForm({ requireToiTeam = false }: FieldTeamCadastrarFormProps) {
  const envelopePhotoInputId = useId()
  const { options: csdOptions, loading: csdLoading, error: csdError } = useCsdsOptions()
  const [partners, setPartners] = useState<FieldPartnerOption[]>([])
  const [toiCollaborators, setToiCollaborators] = useState<FieldPartnerOption[]>([])
  const [partnersLoading, setPartnersLoading] = useState(true)
  const [toiCollaboratorsLoading, setToiCollaboratorsLoading] = useState(false)
  const [meter, setMeter] = useState('')
  const [installation, setInstallation] = useState('')
  const [toi, setToi] = useState('')
  const [note, setNote] = useState('')
  const [envelopePhoto, setEnvelopePhoto] = useState('')
  const [envelopePhotoName, setEnvelopePhotoName] = useState('')
  const [envelopeSeal, setEnvelopeSeal] = useState('')
  const [csd, setCsd] = useState('')
  const [partnerUserId, setPartnerUserId] = useState('')
  const [partnerQuery, setPartnerQuery] = useState('')
  const [partnerMenuOpen, setPartnerMenuOpen] = useState(false)
  const [schedulingNotes, setSchedulingNotes] = useState('')
  const [collaborator1UserId, setCollaborator1UserId] = useState('')
  const [collaborator1Query, setCollaborator1Query] = useState('')
  const [collaborator1MenuOpen, setCollaborator1MenuOpen] = useState(false)
  const [collaborator2UserId, setCollaborator2UserId] = useState('')
  const [collaborator2Query, setCollaborator2Query] = useState('')
  const [collaborator2MenuOpen, setCollaborator2MenuOpen] = useState(false)
  const [teamReason, setTeamReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [slotModal, setSlotModal] = useState<{
    meter: string
    slot: string
    deliveryDeadline: string
  } | null>(null)
  const [copiedSlot, setCopiedSlot] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldTeamFieldErrors>({})
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    setPartnersLoading(true)
    void api
      .listFieldPartners()
      .then(({ partners: rows }) => {
        if (!cancelled) setPartners(rows)
      })
      .catch(() => {
        if (!cancelled) setPartners([])
      })
      .finally(() => {
        if (!cancelled) setPartnersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!requireToiTeam) {
      setToiCollaborators([])
      setToiCollaboratorsLoading(false)
      return
    }
    let cancelled = false
    setToiCollaboratorsLoading(true)
    void api
      .listToiCollaborators()
      .then(({ users }) => {
        if (!cancelled) setToiCollaborators(users)
      })
      .catch(() => {
        if (!cancelled) setToiCollaborators([])
      })
      .finally(() => {
        if (!cancelled) setToiCollaboratorsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [requireToiTeam])

  const clearFieldError = (field: keyof FieldTeamFieldErrors) => {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const selectedPartner = partners.find((partner) => partner.id === partnerUserId) ?? null
  const selectedCollaborator1 =
    toiCollaborators.find((user) => user.id === collaborator1UserId) ?? null
  const selectedCollaborator2 =
    toiCollaborators.find((user) => user.id === collaborator2UserId) ?? null

  const matchUsersByRegistration = (
    queryValue: string,
    source: FieldPartnerOption[],
    options?: { showAllWhenEmpty?: boolean },
  ) => {
    const query = queryValue.trim().toUpperCase()
    if (!query) {
      return options?.showAllWhenEmpty ? source : source.slice(0, 8)
    }
    return source
      .filter((partner) => partner.registration.toUpperCase().includes(query))
      .slice(0, 12)
  }

  const partnerMatches = matchUsersByRegistration(partnerQuery, partners, {
    showAllWhenEmpty: true,
  })
  const collaborator1Matches = matchUsersByRegistration(
    collaborator1Query,
    toiCollaborators,
  ).filter((user) => user.id !== collaborator2UserId)
  const collaborator2Matches = matchUsersByRegistration(
    collaborator2Query,
    toiCollaborators,
  ).filter((user) => user.id !== collaborator1UserId)

  const selectPartner = (partner: FieldPartnerOption) => {
    setPartnerUserId(partner.id)
    setPartnerQuery(partner.registration)
    setPartnerMenuOpen(false)
    clearFieldError('partner')
  }

  const selectCollaborator1 = (user: FieldPartnerOption) => {
    setCollaborator1UserId(user.id)
    setCollaborator1Query(user.registration)
    setCollaborator1MenuOpen(false)
    clearFieldError('collaborator1')
  }

  const selectCollaborator2 = (user: FieldPartnerOption) => {
    setCollaborator2UserId(user.id)
    setCollaborator2Query(user.registration)
    setCollaborator2MenuOpen(false)
    clearFieldError('collaborator2')
  }

  const resolveUserFromQuery = (
    queryValue: string,
    selectedId: string,
    source: FieldPartnerOption[],
  ) => {
    const query = queryValue.trim().toUpperCase()
    if (!query) return null
    const exact = source.find(
      (partner) => partner.registration.toUpperCase() === query,
    )
    if (exact) return exact
    if (selectedId) {
      return source.find((partner) => partner.id === selectedId) ?? null
    }
    return null
  }

  const resolvePartnerFromQuery = () =>
    resolveUserFromQuery(partnerQuery, partnerUserId, partners)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFeedback(null)
    setSlotModal(null)

    const nextErrors: FieldTeamFieldErrors = {}

    for (const [value, field] of [
      [meter, 'medidor'],
      [installation, 'instalacao'],
      [toi, 'toi'],
      [note, 'nota'],
    ] as const) {
      const error = validateNumericField(value, field, true)
      if (error) nextErrors[field] = error
    }

    if (!csd) {
      nextErrors.csd = 'Selecione um CSD.'
    }

    if (!envelopePhoto.trim()) {
      nextErrors.envelopePhoto =
        'Anexe a foto do número do invólucro, com o medidor visível dentro dele.'
    }

    if (!envelopeSeal.trim()) {
      nextErrors.envelopeSeal = 'Informe o número do invólucro.'
    }

    const resolvedPartner = requireToiTeam ? null : resolvePartnerFromQuery()
    if (!requireToiTeam) {
      if (!resolvedPartner) {
        nextErrors.partner =
          'Selecione um usuário com perfil Lavratura de TOI. Se o parceiro não estiver na lista, solicite que ele faça o cadastro no portal.'
      } else {
        setPartnerUserId(resolvedPartner.id)
        setPartnerQuery(resolvedPartner.registration)
      }
    }

    let resolvedCollaborator1: FieldPartnerOption | null = null
    let resolvedCollaborator2: FieldPartnerOption | null = null
    if (requireToiTeam) {
      resolvedCollaborator1 = resolveUserFromQuery(
        collaborator1Query,
        collaborator1UserId,
        toiCollaborators,
      )
      resolvedCollaborator2 = resolveUserFromQuery(
        collaborator2Query,
        collaborator2UserId,
        toiCollaborators,
      )
      if (!resolvedCollaborator1) {
        nextErrors.collaborator1 =
          'Selecione o colaborador 1 entre os usuários com perfil Lavratura de TOI.'
      } else {
        setCollaborator1UserId(resolvedCollaborator1.id)
        setCollaborator1Query(resolvedCollaborator1.registration)
      }
      if (!resolvedCollaborator2) {
        nextErrors.collaborator2 =
          'Selecione o colaborador 2 entre os usuários com perfil Lavratura de TOI.'
      } else {
        setCollaborator2UserId(resolvedCollaborator2.id)
        setCollaborator2Query(resolvedCollaborator2.registration)
      }
      if (
        resolvedCollaborator1 &&
        resolvedCollaborator2 &&
        resolvedCollaborator1.id === resolvedCollaborator2.id
      ) {
        nextErrors.collaborator2 = 'Os colaboradores 1 e 2 devem ser usuários diferentes.'
      }
      const trimmedTeamReason = teamReason.trim()
      if (trimmedTeamReason.length < 5) {
        nextErrors.teamReason =
          'Informe o motivo pelo qual está agendando pela equipe (mínimo de 5 caracteres).'
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      return
    }

    setFieldErrors({})
    setSubmitting(true)

    try {
      const { schedule } = await api.createMeterSchedule({
        meter,
        installation,
        toi,
        note,
        csd,
        clientPresent: 'nao',
        schedulingNotes,
        ...(requireToiTeam
          ? {
              toiCollaborator1Name: resolvedCollaborator1!.name,
              toiCollaborator1Registration: resolvedCollaborator1!.registration,
              toiCollaborator2Name: resolvedCollaborator2!.name,
              toiCollaborator2Registration: resolvedCollaborator2!.registration,
              toiTeamReason: teamReason.trim(),
            }
          : {
              partnerUserId: resolvedPartner!.id,
            }),
        envelopePhoto,
        envelopeSeal: envelopeSeal.trim(),
      })

      setSlotModal({
        meter: schedule.meter,
        slot: schedule.scheduledAtLabel,
        deliveryDeadline: schedule.deliveryDeadlineLabel || '',
      })
      setMeter('')
      setInstallation('')
      setToi('')
      setNote('')
      setEnvelopePhoto('')
      setEnvelopePhotoName('')
      setEnvelopeSeal('')
      setCsd('')
      setPartnerUserId('')
      setPartnerQuery('')
      setPartnerMenuOpen(false)
      setSchedulingNotes('')
      setCollaborator1UserId('')
      setCollaborator1Query('')
      setCollaborator1MenuOpen(false)
      setCollaborator2UserId('')
      setCollaborator2Query('')
      setCollaborator2MenuOpen(false)
      setTeamReason('')
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível calcular a próxima data disponível.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const closeSlotModal = () => {
    setSlotModal(null)
    setCopiedSlot(false)
  }

  const copySlotDate = async () => {
    if (!slotModal) return

    try {
      await navigator.clipboard.writeText(slotModal.slot)
      setCopiedSlot(true)
      window.setTimeout(() => setCopiedSlot(false), 2000)
    } catch {
      setFeedback({
        type: 'error',
        message: 'Não foi possível copiar a data.',
      })
    }
  }

  return (
    <>
      <div className="schedule-form-header">
        <div>
          <p className="schedule-form-kicker">Agendamento</p>
          <p className="schedule-form-subtitle">Laboratório de Medição</p>
        </div>
      </div>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      <form className="form-grid schedule-form-grid" onSubmit={(event) => void handleSubmit(event)}>
        <label className={fieldErrors.medidor ? 'has-field-error' : undefined}>
          <RequiredLabel>Medidor</RequiredLabel>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={meter}
            onChange={(event) => {
              setMeter(sanitizeNumericInput(event.target.value, NUMERIC_FIELD_LIMITS.medidor))
              clearFieldError('medidor')
            }}
            maxLength={NUMERIC_FIELD_LIMITS.medidor}
            aria-invalid={Boolean(fieldErrors.medidor)}
            aria-describedby={fieldErrors.medidor ? 'field-team-medidor-error' : undefined}
            required
          />
          <FormFieldError id="field-team-medidor-error" message={fieldErrors.medidor} />
        </label>

        <label className={fieldErrors.instalacao ? 'has-field-error' : undefined}>
          <RequiredLabel>Instalação</RequiredLabel>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={installation}
            onChange={(event) => {
              setInstallation(
                sanitizeNumericInput(event.target.value, NUMERIC_FIELD_LIMITS.instalacao),
              )
              clearFieldError('instalacao')
            }}
            maxLength={NUMERIC_FIELD_LIMITS.instalacao}
            aria-invalid={Boolean(fieldErrors.instalacao)}
            aria-describedby={
              fieldErrors.instalacao ? 'field-team-instalacao-error' : undefined
            }
            required
          />
          <FormFieldError id="field-team-instalacao-error" message={fieldErrors.instalacao} />
        </label>

        <label className={fieldErrors.toi ? 'has-field-error' : undefined}>
          <RequiredLabel>TOI</RequiredLabel>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={toi}
            onChange={(event) => {
              setToi(sanitizeNumericInput(event.target.value, NUMERIC_FIELD_LIMITS.toi))
              clearFieldError('toi')
            }}
            maxLength={NUMERIC_FIELD_LIMITS.toi}
            aria-invalid={Boolean(fieldErrors.toi)}
            aria-describedby={fieldErrors.toi ? 'field-team-toi-error' : undefined}
            required
          />
          <FormFieldError id="field-team-toi-error" message={fieldErrors.toi} />
        </label>

        <label className={fieldErrors.nota ? 'has-field-error' : undefined}>
          <RequiredLabel>Nota</RequiredLabel>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={note}
            onChange={(event) => {
              setNote(sanitizeNumericInput(event.target.value, NUMERIC_FIELD_LIMITS.nota))
              clearFieldError('nota')
            }}
            maxLength={NUMERIC_FIELD_LIMITS.nota}
            aria-invalid={Boolean(fieldErrors.nota)}
            aria-describedby={fieldErrors.nota ? 'field-team-nota-error' : undefined}
            required
          />
          <FormFieldError id="field-team-nota-error" message={fieldErrors.nota} />
        </label>

        <div
          className={`full-width envelope-photo-field${
            fieldErrors.envelopeSeal || fieldErrors.envelopePhoto ? ' has-field-error' : ''
          }`}
        >
          <div className="partner-search-label-row">
            <RequiredLabel>Número do Invólucro</RequiredLabel>
          </div>
          <label className={`full-width${fieldErrors.envelopeSeal ? ' has-field-error' : ''}`}>
            <span className="sr-only">Número do invólucro</span>
            <input
              type="text"
              value={envelopeSeal}
              onChange={(event) => {
                setEnvelopeSeal(event.target.value)
                clearFieldError('envelopeSeal')
              }}
              placeholder="Digite o número do lacre do invólucro"
              aria-invalid={Boolean(fieldErrors.envelopeSeal)}
              aria-describedby="field-team-envelope-seal-error"
              required
            />
            <FormFieldError id="field-team-envelope-seal-error" message={fieldErrors.envelopeSeal} />
          </label>
          <div className="file-picker">
            <input
              id={envelopePhotoInputId}
              className="file-picker-input"
              type="file"
              accept="image/*"
              capture="environment"
              required={!envelopePhoto}
              aria-invalid={Boolean(fieldErrors.envelopePhoto)}
              aria-describedby="field-team-envelope-error"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) {
                  setEnvelopePhoto('')
                  setEnvelopePhotoName('')
                  return
                }
                void readImageAsDataUrl(file)
                  .then((dataUrl) => {
                    setEnvelopePhoto(dataUrl)
                    setEnvelopePhotoName(file.name)
                    clearFieldError('envelopePhoto')
                    setFeedback(null)
                  })
                  .catch((error: unknown) => {
                    setEnvelopePhoto('')
                    setEnvelopePhotoName('')
                    event.target.value = ''
                    setFeedback({
                      type: 'error',
                      message:
                        error instanceof Error
                          ? error.message
                          : 'Não foi possível carregar a foto do invólucro.',
                    })
                  })
              }}
            />
            <label htmlFor={envelopePhotoInputId} className="file-picker-button">
              Tirar / escolher foto
            </label>
            <span className="file-picker-name">
              {envelopePhotoName || 'Nenhuma imagem selecionada'}
            </span>
          </div>
          {envelopePhoto ? (
            <span className="envelope-photo-preview">
              <img src={envelopePhoto} alt="Pré-visualização da foto do invólucro" />
            </span>
          ) : null}
          <FormFieldError
            id="field-team-envelope-error"
            message={fieldErrors.envelopePhoto}
          />
        </div>

        <label className={`full-width${fieldErrors.csd ? ' has-field-error' : ''}`}>
          <RequiredLabel>CSD</RequiredLabel>
          <select
            value={csd}
            onChange={(event) => {
              setCsd(event.target.value)
              clearFieldError('csd')
            }}
            aria-invalid={Boolean(fieldErrors.csd)}
            aria-describedby={fieldErrors.csd ? 'field-team-csd-error' : undefined}
            required
          >
            <option value="">{csdLoading ? 'Carregando CSDs...' : 'Localizar itens'}</option>
            {csdOptions.map((option) => (
              <option key={option.id} value={option.label}>
                {option.label}
              </option>
            ))}
          </select>
          <FormFieldError id="field-team-csd-error" message={fieldErrors.csd ?? csdError ?? undefined} />
        </label>

        {!requireToiTeam ? (
          <div className={`full-width partner-search${fieldErrors.partner ? ' has-field-error' : ''}`}>
            <RequiredLabel>Parceiro</RequiredLabel>
            <p id="field-team-partner-hint" className="field-hint">
              Se ainda não possuir cadastro, é necessário que ele faça isso antes.
            </p>
            <div className="partner-search-control">
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                value={partnerQuery}
                placeholder={
                  partnersLoading
                    ? 'Carregando usuários...'
                    : 'Digite a matrícula do parceiro'
                }
                onChange={(event) => {
                  const value = event.target.value
                  setPartnerQuery(value)
                  setPartnerUserId('')
                  setPartnerMenuOpen(true)
                  clearFieldError('partner')
                }}
                onFocus={() => setPartnerMenuOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setPartnerMenuOpen(false), 150)
                }}
                aria-invalid={Boolean(fieldErrors.partner)}
                aria-autocomplete="list"
                aria-expanded={partnerMenuOpen}
                aria-controls="field-team-partner-list"
                aria-describedby="field-team-partner-hint field-team-partner-error"
                required
              />
              {partnerMenuOpen && !partnersLoading ? (
                <ul
                  id="field-team-partner-list"
                  className="partner-search-results"
                  role="listbox"
                >
                  {partnerMatches.length ? (
                    partnerMatches.map((partner) => (
                      <li key={partner.id}>
                        <button
                          type="button"
                          className={
                            partner.id === partnerUserId
                              ? 'partner-search-option is-selected'
                              : 'partner-search-option'
                          }
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectPartner(partner)}
                        >
                          <strong>{partner.registration}</strong>
                          <span>{partner.name}</span>
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="partner-search-empty">
                      Nenhum usuário com perfil Lavratura de TOI encontrado. Solicite o cadastro
                      no portal.
                    </li>
                  )}
                </ul>
              ) : null}
            </div>
            {selectedPartner ? (
              <p className="partner-search-selected" role="status">
                Selecionado: {selectedPartner.registration} — {selectedPartner.name}
              </p>
            ) : null}
            <FormFieldError id="field-team-partner-error" message={fieldErrors.partner} />
          </div>
        ) : null}

        {requireToiTeam ? (
          <fieldset className="toi-team-fieldset full-width">
            <legend>Equipe que lavrou o TOI</legend>
            <p id="field-team-toi-hint" className="field-hint">
              Se o colaborador não estiver na lista, solicite que ele faça o cadastro no
              portal.
            </p>

            <div
              className={`full-width partner-search${
                fieldErrors.collaborator1 ? ' has-field-error' : ''
              }`}
            >
              <RequiredLabel>Colaborador 1</RequiredLabel>
              <div className="partner-search-control">
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={collaborator1Query}
                  placeholder={
                    toiCollaboratorsLoading
                      ? 'Carregando usuários...'
                      : 'Digite a matrícula do colaborador 1'
                  }
                  onChange={(event) => {
                    setCollaborator1Query(event.target.value)
                    setCollaborator1UserId('')
                    setCollaborator1MenuOpen(true)
                    clearFieldError('collaborator1')
                  }}
                  onFocus={() => setCollaborator1MenuOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setCollaborator1MenuOpen(false), 150)
                  }}
                  aria-invalid={Boolean(fieldErrors.collaborator1)}
                  aria-autocomplete="list"
                  aria-expanded={collaborator1MenuOpen}
                  aria-controls="field-team-collaborator1-list"
                  aria-describedby="field-team-toi-hint field-team-collaborator1-error"
                />
                {collaborator1MenuOpen && !toiCollaboratorsLoading ? (
                  <ul
                    id="field-team-collaborator1-list"
                    className="partner-search-results"
                    role="listbox"
                  >
                    {collaborator1Matches.length ? (
                      collaborator1Matches.map((user) => (
                        <li key={user.id}>
                          <button
                            type="button"
                            className={
                              user.id === collaborator1UserId
                                ? 'partner-search-option is-selected'
                                : 'partner-search-option'
                            }
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectCollaborator1(user)}
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
              {selectedCollaborator1 ? (
                <p className="partner-search-selected" role="status">
                  Selecionado: {selectedCollaborator1.registration} —{' '}
                  {selectedCollaborator1.name}
                </p>
              ) : null}
              <FormFieldError
                id="field-team-collaborator1-error"
                message={fieldErrors.collaborator1}
              />
            </div>

            <div
              className={`full-width partner-search${
                fieldErrors.collaborator2 ? ' has-field-error' : ''
              }`}
            >
              <RequiredLabel>Colaborador 2</RequiredLabel>
              <div className="partner-search-control">
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={collaborator2Query}
                  placeholder={
                    toiCollaboratorsLoading
                      ? 'Carregando usuários...'
                      : 'Digite a matrícula do colaborador 2'
                  }
                  onChange={(event) => {
                    setCollaborator2Query(event.target.value)
                    setCollaborator2UserId('')
                    setCollaborator2MenuOpen(true)
                    clearFieldError('collaborator2')
                  }}
                  onFocus={() => setCollaborator2MenuOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setCollaborator2MenuOpen(false), 150)
                  }}
                  aria-invalid={Boolean(fieldErrors.collaborator2)}
                  aria-autocomplete="list"
                  aria-expanded={collaborator2MenuOpen}
                  aria-controls="field-team-collaborator2-list"
                  aria-describedby="field-team-toi-hint field-team-collaborator2-error"
                />
                {collaborator2MenuOpen && !toiCollaboratorsLoading ? (
                  <ul
                    id="field-team-collaborator2-list"
                    className="partner-search-results"
                    role="listbox"
                  >
                    {collaborator2Matches.length ? (
                      collaborator2Matches.map((user) => (
                        <li key={user.id}>
                          <button
                            type="button"
                            className={
                              user.id === collaborator2UserId
                                ? 'partner-search-option is-selected'
                                : 'partner-search-option'
                            }
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectCollaborator2(user)}
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
              {selectedCollaborator2 ? (
                <p className="partner-search-selected" role="status">
                  Selecionado: {selectedCollaborator2.registration} —{' '}
                  {selectedCollaborator2.name}
                </p>
              ) : null}
              <FormFieldError
                id="field-team-collaborator2-error"
                message={fieldErrors.collaborator2}
              />
            </div>

            <label className="full-width">
              <RequiredLabel>
                Motivo pelo qual está agendando pela equipe
              </RequiredLabel>
              <textarea
                rows={3}
                value={teamReason}
                required
                minLength={5}
                onChange={(event) => {
                  setTeamReason(event.target.value)
                  clearFieldError('teamReason')
                }}
                placeholder="Descreva o motivo do agendamento em nome da equipe"
              />
              <FormFieldError
                id="field-team-team-reason-error"
                message={fieldErrors.teamReason}
              />
            </label>
          </fieldset>
        ) : null}

        <label className="full-width">
          Observações
          <textarea
            rows={3}
            value={schedulingNotes}
            onChange={(event) => setSchedulingNotes(event.target.value)}
          />
        </label>

        <button className="reserve-button full-width" type="submit" disabled={submitting}>
          {submitting ? 'Salvando...' : 'Salvar agendamento'}
        </button>
      </form>

      {slotModal
        ? createPortal(
            <div
              className="ensaios-block-modal-overlay"
              role="presentation"
              onClick={closeSlotModal}
            >
              <div
                className="ensaios-block-modal schedule-slot-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="schedule-slot-date-label"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="icon-button schedule-slot-modal-close"
                  onClick={closeSlotModal}
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
                <p className="schedule-slot-modal-message">
                  Medidor {slotModal.meter} reservado com sucesso.
                </p>
                <div className="schedule-slot-date-row">
                  <p id="schedule-slot-date-label" className="available-slot-value">
                    Ensaio: {slotModal.slot}
                  </p>
                  <button
                    type="button"
                    className="icon-button schedule-slot-copy-button"
                    onClick={() => void copySlotDate()}
                    aria-label={copiedSlot ? 'Copiado' : 'Copiar data'}
                    title={copiedSlot ? 'Copiado!' : 'Copiar data'}
                  >
                    {copiedSlot ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M5 12l4 4L19 6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect
                          x="9"
                          y="9"
                          width="11"
                          height="11"
                          rx="2"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <path
                          d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                {slotModal.deliveryDeadline ? (
                  <p className="schedule-slot-deadline-note">
                    Prazo de entrega (última sexta antes do ensaio):{' '}
                    <strong>{slotModal.deliveryDeadline}</strong>. Após essa data o
                    medidor consta como atrasado.
                  </p>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
