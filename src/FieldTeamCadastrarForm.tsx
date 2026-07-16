import { FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, type FieldPartnerOption } from './api'
import { FormFieldError } from './FormFieldError'
import {
  NUMERIC_FIELD_LIMITS,
  NumericFieldKey,
  sanitizeNumericInput,
  validateNumericField,
} from './numericFieldValidation'
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
    | 'collaborator1Name'
    | 'collaborator1Registration'
    | 'collaborator2Name'
    | 'collaborator2Registration'
    | 'teamReason',
    string
  >
>

type FieldTeamCadastrarFormProps = {
  requireToiTeam?: boolean
}

export function FieldTeamCadastrarForm({ requireToiTeam = false }: FieldTeamCadastrarFormProps) {
  const { options: csdOptions, loading: csdLoading } = useCsdsOptions()
  const [partners, setPartners] = useState<FieldPartnerOption[]>([])
  const [partnersLoading, setPartnersLoading] = useState(true)
  const [meter, setMeter] = useState('')
  const [installation, setInstallation] = useState('')
  const [toi, setToi] = useState('')
  const [note, setNote] = useState('')
  const [csd, setCsd] = useState('')
  const [partnerUserId, setPartnerUserId] = useState('')
  const [partnerQuery, setPartnerQuery] = useState('')
  const [partnerMenuOpen, setPartnerMenuOpen] = useState(false)
  const [schedulingNotes, setSchedulingNotes] = useState('')
  const [collaborator1Name, setCollaborator1Name] = useState('')
  const [collaborator1Registration, setCollaborator1Registration] = useState('')
  const [collaborator2Name, setCollaborator2Name] = useState('')
  const [collaborator2Registration, setCollaborator2Registration] = useState('')
  const [teamReason, setTeamReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [slotModal, setSlotModal] = useState<{
    meter: string
    slot: string
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

  const clearFieldError = (field: keyof FieldTeamFieldErrors) => {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const selectedPartner = partners.find((partner) => partner.id === partnerUserId) ?? null

  const partnerMatches = (() => {
    const query = partnerQuery.trim().toUpperCase()
    if (!query) return partners.slice(0, 8)
    return partners
      .filter((partner) => partner.registration.toUpperCase().includes(query))
      .slice(0, 12)
  })()

  const selectPartner = (partner: FieldPartnerOption) => {
    setPartnerUserId(partner.id)
    setPartnerQuery(partner.registration)
    setPartnerMenuOpen(false)
    clearFieldError('partner')
  }

  const resolvePartnerFromQuery = () => {
    const query = partnerQuery.trim().toUpperCase()
    if (!query) return null
    const exact = partners.find(
      (partner) => partner.registration.toUpperCase() === query,
    )
    if (exact) return exact
    if (partnerUserId) {
      return partners.find((partner) => partner.id === partnerUserId) ?? null
    }
    return null
  }

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

    const resolvedPartner = resolvePartnerFromQuery()
    if (!resolvedPartner) {
      nextErrors.partner =
        'Informe a matrícula de um usuário cadastrado. Se o parceiro não estiver na lista, solicite que ele faça o cadastro no portal.'
    } else {
      setPartnerUserId(resolvedPartner.id)
      setPartnerQuery(resolvedPartner.registration)
    }

    if (requireToiTeam) {
      if (!collaborator1Name.trim()) {
        nextErrors.collaborator1Name = 'Informe o nome do colaborador 1.'
      }
      if (!collaborator1Registration.trim()) {
        nextErrors.collaborator1Registration = 'Informe a matrícula do colaborador 1.'
      }
      if (!collaborator2Name.trim()) {
        nextErrors.collaborator2Name = 'Informe o nome do colaborador 2.'
      }
      if (!collaborator2Registration.trim()) {
        nextErrors.collaborator2Registration = 'Informe a matrícula do colaborador 2.'
      }
      if (!teamReason.trim()) {
        nextErrors.teamReason = 'Informe o motivo pelo qual está agendando pela equipe.'
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
        partnerUserId: resolvedPartner!.id,
        ...(requireToiTeam
          ? {
              toiCollaborator1Name: collaborator1Name.trim(),
              toiCollaborator1Registration: collaborator1Registration.trim(),
              toiCollaborator2Name: collaborator2Name.trim(),
              toiCollaborator2Registration: collaborator2Registration.trim(),
              toiTeamReason: teamReason.trim(),
            }
          : {}),
      })

      setSlotModal({
        meter: schedule.meter,
        slot: schedule.scheduledAtLabel,
      })
      setMeter('')
      setInstallation('')
      setToi('')
      setNote('')
      setCsd('')
      setPartnerUserId('')
      setPartnerQuery('')
      setPartnerMenuOpen(false)
      setSchedulingNotes('')
      setCollaborator1Name('')
      setCollaborator1Registration('')
      setCollaborator2Name('')
      setCollaborator2Registration('')
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
          <FormFieldError id="field-team-csd-error" message={fieldErrors.csd} />
        </label>

        <div className={`full-width partner-search${fieldErrors.partner ? ' has-field-error' : ''}`}>
          <RequiredLabel>Parceiro</RequiredLabel>
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
                    Nenhuma matrícula encontrada. Solicite que o parceiro faça o cadastro.
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
          <p id="field-team-partner-hint" className="field-hint">
            Pesquise pela matrícula do usuário cadastrado. Se o parceiro não estiver na
            lista, solicite que ele faça o cadastro no portal.
          </p>
          <FormFieldError id="field-team-partner-error" message={fieldErrors.partner} />
        </div>

        {requireToiTeam ? (
          <fieldset className="toi-team-fieldset full-width">
            <legend>Equipe que lavrou o TOI</legend>
            <div className="toi-team-grid">
              <label
                className={fieldErrors.collaborator1Name ? 'has-field-error' : undefined}
              >
                <RequiredLabel>Colaborador 1 (nome)</RequiredLabel>
                <input
                  type="text"
                  value={collaborator1Name}
                  onChange={(event) => {
                    setCollaborator1Name(event.target.value)
                    clearFieldError('collaborator1Name')
                  }}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldErrors.collaborator1Name)}
                />
                <FormFieldError message={fieldErrors.collaborator1Name} />
              </label>
              <label
                className={
                  fieldErrors.collaborator1Registration ? 'has-field-error' : undefined
                }
              >
                <RequiredLabel>Matrícula</RequiredLabel>
                <input
                  type="text"
                  value={collaborator1Registration}
                  onChange={(event) => {
                    setCollaborator1Registration(event.target.value)
                    clearFieldError('collaborator1Registration')
                  }}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldErrors.collaborator1Registration)}
                />
                <FormFieldError message={fieldErrors.collaborator1Registration} />
              </label>
              <label
                className={fieldErrors.collaborator2Name ? 'has-field-error' : undefined}
              >
                <RequiredLabel>Colaborador 2 (nome)</RequiredLabel>
                <input
                  type="text"
                  value={collaborator2Name}
                  onChange={(event) => {
                    setCollaborator2Name(event.target.value)
                    clearFieldError('collaborator2Name')
                  }}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldErrors.collaborator2Name)}
                />
                <FormFieldError message={fieldErrors.collaborator2Name} />
              </label>
              <label
                className={
                  fieldErrors.collaborator2Registration ? 'has-field-error' : undefined
                }
              >
                <RequiredLabel>Matrícula</RequiredLabel>
                <input
                  type="text"
                  value={collaborator2Registration}
                  onChange={(event) => {
                    setCollaborator2Registration(event.target.value)
                    clearFieldError('collaborator2Registration')
                  }}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldErrors.collaborator2Registration)}
                />
                <FormFieldError message={fieldErrors.collaborator2Registration} />
              </label>
              <label
                className={`full-width${fieldErrors.teamReason ? ' has-field-error' : ''}`}
              >
                <RequiredLabel>Motivo pelo qual está agendando pela equipe</RequiredLabel>
                <textarea
                  rows={3}
                  value={teamReason}
                  onChange={(event) => {
                    setTeamReason(event.target.value)
                    clearFieldError('teamReason')
                  }}
                  placeholder="Descreva o motivo do agendamento em nome da equipe"
                  aria-invalid={Boolean(fieldErrors.teamReason)}
                />
                <FormFieldError message={fieldErrors.teamReason} />
              </label>
            </div>
          </fieldset>
        ) : null}

        <label className="full-width">
          Observações de agendamento
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
                    {slotModal.slot}
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
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
