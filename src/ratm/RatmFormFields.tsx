import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  api,
  ApiError,
  type EntryFieldMatch,
  type InspectionDocumentRecord,
} from '../api'
import { formatSchedulePartnerAndTeamLabel } from '../schedulePartnerLabel'
import {
  excludesCollaboratorChecks,
  getVisibleSchedulingTeamFieldKeys,
} from './entryFieldIndicators'
import {
  isMeterReadyForEnsaio,
  METER_NOT_RECEIVED_MESSAGE,
} from './meterEnsaioEligibility'
import type { EntryFieldCheck, EntryFieldChecks, RatmFormData } from './types'
import {
  createEmptyEntryFieldChecks,
  entryFieldChecksFromComparisons,
  IRREGULARITY_CODES,
  TEST_BENCH_OPTIONS,
} from './types'
import {
  isEntryInfoSectionComplete,
  isInitialTestsSectionComplete,
  isEnclosureSealSectionComplete,
  isSeal1SectionComplete,
  isSeal2SectionComplete,
  isMeasurementsSectionComplete,
  isTestResultsSectionComplete,
} from './ratmSectionCompletion'
import { RatmDocumentFab } from './RatmDocumentFab'

type RatmFormFieldsProps = {
  index: number
  total: number
  data: RatmFormData
  onChange: (patch: Partial<RatmFormData>) => void
  onScan: (field: string) => void
}

type RadioGroupProps = {
  legend: string
  name: string
  value: string
  options: string[]
  onChange: (value: string) => void
  vertical?: boolean
}

function codesForSelect(codes: Record<string, string>, current: string) {
  if (!current.trim() || current in codes) return codes
  return { ...codes, [current]: current }
}

function ScanButton({ field, onScan }: { field: string; onScan: (field: string) => void }) {
  return (
    <button
      className="scan-button"
      type="button"
      onClick={() => onScan(field)}
      aria-label="Digitalizar"
      title="Digitalizar"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 7V4h3M17 4h3v3M4 17v3h3M17 20h3v-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7 12h10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}

function displayOrDash(value?: string | null) {
  const trimmed = value?.trim() ?? ''
  return trimmed || '—'
}

function suggestedCheckFromMatch(matches: boolean | null | undefined): EntryFieldCheck {
  if (matches === true) return 'correct'
  if (matches === false) return 'incorrect'
  return ''
}

function EntryFieldVerifier({
  value,
  suggested,
  onChange,
}: {
  value: EntryFieldCheck
  suggested?: EntryFieldCheck
  onChange: (value: EntryFieldCheck) => void
}) {
  return (
    <span className="ratm-entry-verifier" role="group" aria-label="Verificação do campo">
      <button
        type="button"
        className={`ratm-entry-verifier-btn is-correct${value === 'correct' ? ' is-selected' : ''}${!value && suggested === 'correct' ? ' is-suggested' : ''}`}
        aria-pressed={value === 'correct'}
        aria-label="Marcar como correto"
        title={!value && suggested === 'correct' ? 'Sugerido: correto' : 'Correto'}
        onClick={() => onChange(value === 'correct' ? '' : 'correct')}
      >
        ✓
      </button>
      <button
        type="button"
        className={`ratm-entry-verifier-btn is-incorrect${value === 'incorrect' ? ' is-selected' : ''}${!value && suggested === 'incorrect' ? ' is-suggested' : ''}`}
        aria-pressed={value === 'incorrect'}
        aria-label="Marcar como incorreto"
        title={!value && suggested === 'incorrect' ? 'Sugerido: incorreto' : 'Incorreto'}
        onClick={() => onChange(value === 'incorrect' ? '' : 'incorrect')}
      >
        ✗
      </button>
    </span>
  )
}

type EntryComparisonFieldProps = {
  label: string
  match: EntryFieldMatch | null | undefined
  check: EntryFieldCheck
  onCheckChange: (value: EntryFieldCheck) => void
  fullWidth?: boolean
}

function EntryComparisonField({
  label,
  match,
  check,
  onCheckChange,
  fullWidth = false,
}: EntryComparisonFieldProps) {
  const suggested = suggestedCheckFromMatch(match?.matches)

  return (
    <div className={`ratm-readonly-field ratm-entry-comparison${fullWidth ? ' full-width' : ''}`}>
      <div className="ratm-readonly-field-header">
        <span className="ratm-readonly-label">{label}</span>
        <EntryFieldVerifier value={check} suggested={suggested} onChange={onCheckChange} />
      </div>
      <div className="ratm-entry-comparison-grid">
        <div className="ratm-entry-comparison-item">
          <span className="ratm-entry-comparison-label">No documento</span>
          <p className="ratm-readonly-value">{displayOrDash(match?.document)}</p>
        </div>
        <div className="ratm-entry-comparison-item">
          <span className="ratm-entry-comparison-label">Cadastrado</span>
          <p className="ratm-readonly-value">{displayOrDash(match?.registered)}</p>
        </div>
      </div>
    </div>
  )
}

function RatmExpandableSection({
  title,
  children,
  complete = false,
  accordionName,
}: {
  title: string
  children: ReactNode
  complete?: boolean
  accordionName: string
}) {
  return (
    <details
      className={`ratm-expandable full-width${complete ? ' is-complete' : ''}`}
      name={accordionName}
      onToggle={(event) => {
        const current = event.currentTarget
        if (!current.open) return
        const group = current.getAttribute('name')
        if (!group) return
        for (const other of document.querySelectorAll<HTMLDetailsElement>(
          `details[name="${CSS.escape(group)}"]`,
        )) {
          if (other !== current && other.open) other.open = false
        }
      }}
    >
      <summary className="ratm-expandable-summary">
        <span className="ratm-expandable-title">{title}</span>
        {complete ? (
          <span className="ratm-expandable-complete-badge">Completa</span>
        ) : null}
        <span className="ratm-expandable-chevron" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="ratm-expandable-body">{children}</div>
    </details>
  )
}

function pickPreferredInspectionDocument(
  documents: InspectionDocumentRecord[] | undefined,
  preferToi = false,
) {
  if (!documents?.length) return undefined
  if (preferToi) {
    return (
      documents.find((document) => document.docType === 'ambos') ??
      documents.find((document) => document.docType === 'toi') ??
      documents.find((document) => document.docType === 'comunicado')
    )
  }
  return (
    documents.find((document) => document.docType === 'ambos') ??
    documents.find((document) => document.docType === 'comunicado') ??
    documents.find((document) => document.docType === 'toi')
  )
}

function pickDocumentEnvelopeSeal(documents: InspectionDocumentRecord[] | undefined): string {
  const preferred = pickPreferredInspectionDocument(documents)
  return (
    preferred?.extractedLacre?.trim() ||
    documents?.find((document) => document.extractedLacre?.trim())?.extractedLacre?.trim() ||
    ''
  )
}

function looksLikeReciboClientName(value: string): boolean {
  const text = value.trim()
  if (!text) return false
  if (/[·•]\s*\d{2,3}[.\d/-]{8,}/.test(text)) return true
  if (/\s[-–—]\s*\d{2,3}(?:[.\s]?\d{3}){1,3}[./-]?\d{2}\b/.test(text)) return true
  const digits = text.replace(/\D/g, '')
  return (digits.length === 11 || digits.length === 14) && /[A-Za-zÀ-ÿ]{3,}/.test(text)
}

function pickDocumentClient(documents: InspectionDocumentRecord[] | undefined): string {
  const ordered = [
    pickPreferredInspectionDocument(documents, true),
    ...(documents ?? []),
  ].filter((document): document is InspectionDocumentRecord => Boolean(document))

  for (const document of ordered) {
    const value = document.extractedClient?.trim()
    if (value && !looksLikeReciboClientName(value)) return value
  }
  return ''
}

function coverSealStatusFromText(value: string, allowNotApplicable = false): string {
  const normalized = value.toLowerCase()
  if (/n[aã]o aplic/.test(normalized)) return allowNotApplicable ? 'Não aplicável' : ''
  if (/violado/.test(normalized)) return 'Violado'
  if (/sem lacre/.test(normalized)) return 'Sem lacre'
  if (/em ordem/.test(normalized)) return 'Em ordem'
  return ''
}

function splitCoverSeal(value: string, allowNotApplicable = false): { number: string; status: string } {
  const trimmed = value.trim()
  if (!trimmed) return { number: '', status: '' }
  const status = coverSealStatusFromText(trimmed, allowNotApplicable)
  const number = trimmed
    .replace(/[-–—:]?\s*(em ordem|violado|sem lacre|n[aã]o aplic[aá]vel)\s*$/i, '')
    .trim()
  if (number && !coverSealStatusFromText(number, allowNotApplicable)) {
    return { number, status }
  }
  return { number: status ? '' : trimmed, status }
}

function pickDocumentCoverSeals(documents: InspectionDocumentRecord[] | undefined): {
  seal1: string
  seal1Status: string
  seal2: string
  seal2Status: string
} {
  const preferred = pickPreferredInspectionDocument(documents, true)
  const raw1 =
    preferred?.extractedCoverSeal?.trim() ||
    documents?.find((document) => document.extractedCoverSeal?.trim())?.extractedCoverSeal?.trim() ||
    ''
  const raw2 =
    preferred?.extractedCoverSeal2?.trim() ||
    documents?.find((document) => document.extractedCoverSeal2?.trim())?.extractedCoverSeal2?.trim() ||
    ''
  const first = splitCoverSeal(raw1, false)
  const second = splitCoverSeal(raw2, true)
  return {
    seal1: first.number,
    seal1Status: first.status,
    seal2: second.number,
    seal2Status: second.status,
  }
}

function emptyScheduleFields(): Partial<RatmFormData> {
  return {
    meter: '',
    meterStatus: '',
    demmDocumentId: null,
    registryStatus: '',
    scheduleId: '',
    scheduleSource: '',
    entryComparisons: null,
    entryFieldChecks: createEmptyEntryFieldChecks(),
    scheduleDate: '',
    scheduleHour: '08',
    scheduleMinute: '30',
    scheduleLabel: '',
    installation: '',
    toi: '',
    note: '',
    csd: '',
    partnerLabel: '',
    clientPresent: '',
    schedulingNotes: '',
    deliveryDeadlineLabel: '',
    client: '',
    enclosureSeal: '',
    seal1: '',
    seal1Status: '',
    seal2: '',
    seal2Status: '',
  }
}

function schedulePartsFromIso(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return { scheduleDate: '', scheduleHour: '08', scheduleMinute: '30' }
  }
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    scheduleDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    scheduleHour: pad(date.getHours()),
    scheduleMinute: pad(date.getMinutes()),
  }
}

function ClearableRadioGroup({
  legend,
  name,
  value,
  options,
  onChange,
  vertical = false,
}: RadioGroupProps) {
  return (
    <fieldset className="radio-fieldset ratm-choice-fieldset full-width">
      {legend ? <legend>{legend}</legend> : null}
      <div
        className={`ratm-choice-group${vertical ? ' is-vertical' : ''}`}
        role="radiogroup"
        aria-label={legend || name}
      >
        {options.map((option) => {
          const selected = value === option
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`ratm-choice-btn${selected ? ' is-selected' : ''}`}
              onClick={() => onChange(option)}
            >
              <span className="ratm-choice-dot" aria-hidden="true" />
              <span>{option}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

type YesNoIconQuestionProps = {
  label: string
  value: string
  justification: string
  onChange: (value: string) => void
  onJustificationChange: (value: string) => void
}

function YesNoIconQuestion({
  label,
  value,
  justification,
  onChange,
  onJustificationChange,
}: YesNoIconQuestionProps) {
  return (
    <div className="ratm-yesno-question full-width">
      <div className="ratm-yesno-row">
        <span className="ratm-yesno-label">{label}</span>
        <div className="ratm-yesno-actions" role="group" aria-label={label}>
          <button
            type="button"
            className={`ratm-yesno-btn is-no${value === 'nao' ? ' is-active' : ''}`}
            aria-pressed={value === 'nao'}
            aria-label={`${label}: Não`}
            title="Não"
            onClick={() => onChange('nao')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className={`ratm-yesno-btn is-yes${value === 'sim' ? ' is-active' : ''}`}
            aria-pressed={value === 'sim'}
            aria-label={`${label}: Sim`}
            title="Sim"
            onClick={() => {
              onChange('sim')
              onJustificationChange('')
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      {value === 'nao' ? (
        <label className="ratm-yesno-justification">
          Justificativa
          <span className="ratm-yesno-justification-autosize">
            <span className="ratm-yesno-justification-mirror" aria-hidden="true">
              {justification || 'Descreva a justificativa'}
            </span>
            <input
              type="text"
              value={justification}
              onChange={(event) => onJustificationChange(event.target.value)}
              placeholder="Descreva a justificativa"
            />
          </span>
        </label>
      ) : null}
    </div>
  )
}

type PhotoUploadProps = {
  label: string
  value: string
  onChange: (value: string) => void
}

function PhotoUpload({ label, value, onChange }: PhotoUploadProps) {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      onChange(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.readAsDataURL(file)
  }

  return (
    <label className="full-width photo-upload-field">
      {label}
      <div className="photo-upload-area">
        {value ? (
          <img className="photo-preview" src={value} alt={label} />
        ) : null}
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          aria-label={label}
        />
        <span className="photo-upload-hint">Toque ou clique para adicionar uma imagem</span>
      </div>
    </label>
  )
}

export function RatmFormFields({ index, total, data, onChange, onScan }: RatmFormFieldsProps) {
  const [searchingMeter, setSearchingMeter] = useState(false)
  const [meterLookupError, setMeterLookupError] = useState('')
  const [irregularityCodes, setIrregularityCodes] =
    useState<Record<string, string>>(IRREGULARITY_CODES)
  const [irregularityDescriptions, setIrregularityDescriptions] = useState<Record<string, string>>(
    {},
  )
  const accordionName = `ratm-sections-${index}`

  useEffect(() => {
    let cancelled = false
    void api
      .listIrregularityCodes()
      .then((response) => {
        if (cancelled || !response.codes.length) return
        const nextNames: Record<string, string> = {}
        const nextDescriptions: Record<string, string> = {}
        for (const row of response.codes) {
          nextNames[row.code] = row.name || row.description
          nextDescriptions[row.code] = row.description || row.name
        }
        setIrregularityCodes(nextNames)
        setIrregularityDescriptions(nextDescriptions)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const descriptionForCode = (code: string) => {
    if (!code.trim()) return ''
    return irregularityDescriptions[code] || irregularityCodes[code] || ''
  }

  const irregularityDescription =
    irregularityCodes[data.irregularityCode] ?? 'Selecione um código válido.'
  const irregularityCatalogDescription = descriptionForCode(data.irregularityCode)

  const fieldIrregularityDescription =
    irregularityCodes[data.fieldIrregularityCode] ?? 'Selecione um código válido.'

  useEffect(() => {
    const nextNotes = descriptionForCode(data.irregularityCode)
    if (data.irregularityNotes === nextNotes) return
    if (!data.irregularityCode.trim() && !data.irregularityNotes.trim()) return
    if (data.irregularityCode.trim() && !nextNotes) return
    onChange({ irregularityNotes: nextNotes })
  }, [data.irregularityCode, irregularityDescriptions, irregularityCodes])

  const entryInfoComplete = isEntryInfoSectionComplete(data)
  const initialTestsComplete = isInitialTestsSectionComplete(data)
  const enclosureSealComplete = isEnclosureSealSectionComplete(data)
  const seal1Complete = isSeal1SectionComplete(data)
  const seal2Complete = isSeal2SectionComplete(data)
  const measurementsComplete = isMeasurementsSectionComplete(data)
  const testResultsComplete = isTestResultsSectionComplete(data)
  const skipCollaboratorChecks = excludesCollaboratorChecks(data)
  const visibleSchedulingTeamFields = getVisibleSchedulingTeamFieldKeys(data)

  const schedulingTeamFieldLabels: Record<
    (typeof visibleSchedulingTeamFields)[number],
    string
  > = {
    partner: 'Parceiro',
    collaborator1: 'Colaborador 1',
    collaborator2: 'Colaborador 2',
  }

  const updateEntryFieldCheck = (
    key: keyof EntryFieldChecks,
    value: EntryFieldCheck,
  ) => {
    onChange({
      entryFieldChecks: {
        ...data.entryFieldChecks,
        [key]: value,
      },
    })
  }

  const updatePhoto = (photoIndex: number, value: string) => {
    const photos = [...data.photos]
    photos[photoIndex] = value
    onChange({ photos })
  }

  const handleMeterSearch = async () => {
    const meter = data.meterSearch.trim()
    if (!meter) {
      setMeterLookupError('Informe o número do medidor.')
      return
    }

    setSearchingMeter(true)
    setMeterLookupError('')

    try {
      const { schedules } = await api.listMeterSchedules(undefined, { meter })
      const schedule = schedules[0]
      if (!schedule) {
        onChange(emptyScheduleFields())
        setMeterLookupError(`Nenhum agendamento encontrado para o medidor ${meter}.`)
        return
      }

      if (!isMeterReadyForEnsaio(schedule)) {
        onChange(emptyScheduleFields())
        setMeterLookupError(METER_NOT_RECEIVED_MESSAGE)
        return
      }

      const partnerLabel = formatSchedulePartnerAndTeamLabel(schedule)
      const comparisonPromise = api.getScheduleEntryComparisons(schedule.id).catch(() => null)

      let extractedLacre = ''
      let extractedClient = ''
      let coverSeals = {
        seal1: '',
        seal1Status: '',
        seal2: '',
        seal2Status: '',
      }
      try {
        const documentsResponse = await api.listInspectionDocuments(schedule.id)
        extractedLacre = pickDocumentEnvelopeSeal(documentsResponse.documents)
        extractedClient = pickDocumentClient(documentsResponse.documents)
        coverSeals = pickDocumentCoverSeals(documentsResponse.documents)
        if (!coverSeals.seal1 && !coverSeals.seal1Status) {
          const campo = documentsResponse.conference?.campoCoverSeal?.trim() || ''
          const fromCampo = splitCoverSeal(campo, false)
          coverSeals.seal1 = fromCampo.number
          coverSeals.seal1Status = fromCampo.status
        }
        if (!coverSeals.seal2 && !coverSeals.seal2Status) {
          const campo2 = documentsResponse.conference?.campoCoverSeal2?.trim() || ''
          const fromCampo2 = splitCoverSeal(campo2, true)
          coverSeals.seal2 = fromCampo2.number
          coverSeals.seal2Status = fromCampo2.status
        }
      } catch {
        extractedLacre = ''
      }

      onChange({
        meter: schedule.meter,
        meterStatus: schedule.trailStep || 'Agendado',
        demmDocumentId: schedule.demmDocumentId,
        registryStatus: schedule.registryStatus || '',
        scheduleId: schedule.id,
        scheduleSource: schedule.source || '',
        entryComparisons: null,
        entryFieldChecks: createEmptyEntryFieldChecks(),
        scheduleLabel: schedule.scheduledAtLabel || '',
        installation: schedule.installation || '',
        toi: schedule.toi || '',
        note: schedule.note || '',
        csd: schedule.csd || '',
        partnerLabel,
        client: extractedClient,
        enclosureSeal: extractedLacre || schedule.envelopeSeal || '',
        seal1: coverSeals.seal1,
        seal1Status: coverSeals.seal1Status,
        seal2: coverSeals.seal2,
        seal2Status: coverSeals.seal2Status,
        clientPresent:
          schedule.clientPresent === 'sim'
            ? 'Sim'
            : schedule.clientPresent === 'nao'
              ? 'Não'
              : '',
        schedulingNotes: schedule.schedulingNotes || '',
        deliveryDeadlineLabel: schedule.deliveryDeadlineLabel || '',
        ...schedulePartsFromIso(schedule.scheduledAt),
      })

      const comparisonResponse = await comparisonPromise
      if (comparisonResponse) {
        const comparisonLacre = comparisonResponse.extractedLacre?.trim() || ''
        onChange({
          entryComparisons: comparisonResponse.comparisons,
          entryFieldChecks: entryFieldChecksFromComparisons(comparisonResponse.comparisons),
          ...(comparisonResponse.extractedClient?.trim()
            ? { client: comparisonResponse.extractedClient.trim() }
            : extractedClient
              ? { client: extractedClient }
              : {}),
          enclosureSeal: extractedLacre || comparisonLacre || schedule.envelopeSeal || '',
        })
      }
    } catch (error) {
      setMeterLookupError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível buscar o agendamento do medidor.',
      )
    } finally {
      setSearchingMeter(false)
    }
  }

  useEffect(() => {
    if (!data.meterSearch.trim() || data.scheduleId) return
    void handleMeterSearch()
    // Busca automática só na abertura com medidor já preenchido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
    <div className="ratm-form-panel">
      <div className="ratm-form-header">
        <span className="ratm-form-counter">
          RATM {index + 1} de {total}
        </span>
      </div>

      <div className="form-grid ratm-form-grid">
        <label className="full-width">
          Digite o Nº do medidor
          <div className="search-input-row">
            <input
              type="text"
              value={data.meterSearch}
              onChange={(event) => {
                onChange({ meterSearch: event.target.value })
                setMeterLookupError('')
              }}
              placeholder="Digite o Nº do medidor"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleMeterSearch()
                }
              }}
            />
            <button
              className="secondary-button search-button"
              type="button"
              onClick={() => void handleMeterSearch()}
              disabled={searchingMeter}
            >
              {searchingMeter ? 'Buscando…' : 'Buscar'}
            </button>
            <ScanButton field="medidor" onScan={onScan} />
          </div>
        </label>

        {meterLookupError ? (
          <p className="field-error full-width" role="alert">
            {meterLookupError}
          </p>
        ) : null}

        <RatmExpandableSection
          title="Informações de entrada"
          accordionName={accordionName}
          complete={entryInfoComplete}
        >
          {data.meterStatus ? (
            <p className="ratm-status-line">Status - {data.meterStatus}</p>
          ) : null}

          <EntryComparisonField
            label="Data de agendamento"
            match={data.entryComparisons?.scheduleDate}
            check={data.entryFieldChecks.scheduleDate}
            onCheckChange={(value) => updateEntryFieldCheck('scheduleDate', value)}
            fullWidth
          />

          <div className="ratm-schedule-details" aria-label="Informações do agendamento">
            <div className="ratm-readonly-field full-width">
              <span className="ratm-readonly-label">Medidor</span>
              <p className="ratm-readonly-value">{displayOrDash(data.meter)}</p>
            </div>
            <label className="full-width">
              Cliente
              <input
                type="text"
                value={data.client}
                onChange={(event) => onChange({ client: event.target.value })}
                placeholder="Titular da unidade consumidora"
              />
            </label>
            <EntryComparisonField
              label="Instalação"
              match={data.entryComparisons?.installation}
              check={data.entryFieldChecks.installation}
              onCheckChange={(value) => updateEntryFieldCheck('installation', value)}
            />
            <EntryComparisonField
              label="TOI"
              match={data.entryComparisons?.toi}
              check={data.entryFieldChecks.toi}
              onCheckChange={(value) => updateEntryFieldCheck('toi', value)}
            />
            <EntryComparisonField
              label="Nota"
              match={data.entryComparisons?.note}
              check={data.entryFieldChecks.note}
              onCheckChange={(value) => updateEntryFieldCheck('note', value)}
            />
            <EntryComparisonField
              label="CSD"
              match={data.entryComparisons?.csd}
              check={data.entryFieldChecks.csd}
              onCheckChange={(value) => updateEntryFieldCheck('csd', value)}
            />
            {skipCollaboratorChecks ? (
              <div className="ratm-readonly-field full-width">
                <span className="ratm-readonly-label">Parceiro / Colaboradores</span>
                <p className="ratm-readonly-value ratm-entry-exempt-note">
                  Importação em massa — verificação de colaboradores não se aplica e não
                  entra nos indicadores de erro.
                </p>
              </div>
            ) : (
              visibleSchedulingTeamFields.map((fieldKey) => (
                <EntryComparisonField
                  key={fieldKey}
                  label={schedulingTeamFieldLabels[fieldKey]}
                  match={data.entryComparisons?.[fieldKey]}
                  check={data.entryFieldChecks[fieldKey]}
                  onCheckChange={(value) => updateEntryFieldCheck(fieldKey, value)}
                />
              ))
            )}
            <EntryComparisonField
              label="Prazo de entrega"
              match={data.entryComparisons?.deliveryDeadline}
              check={data.entryFieldChecks.deliveryDeadline}
              onCheckChange={(value) => updateEntryFieldCheck('deliveryDeadline', value)}
            />
            <EntryComparisonField
              label="Observações"
              match={data.entryComparisons?.schedulingNotes}
              check={data.entryFieldChecks.schedulingNotes}
              onCheckChange={(value) => updateEntryFieldCheck('schedulingNotes', value)}
              fullWidth
            />
          </div>
        </RatmExpandableSection>

        <RatmExpandableSection
          title="Testes iniciais"
          accordionName={accordionName}
          complete={initialTestsComplete}
        >
          <div className="ratm-section-box-grid">
            <ClearableRadioGroup
              legend="Análise a pedido"
              name={`analysis-${index}`}
              value={data.analysisRequest}
              options={['EDP', 'Cliente']}
              onChange={(value) => onChange({ analysisRequest: value })}
            />

            <ClearableRadioGroup
              legend="Cliente acompanhou"
              name={`accompanied-${index}`}
              value={data.clientAccompanied}
              options={['Sim', 'Não']}
              onChange={(value) => onChange({ clientAccompanied: value })}
            />

            <ClearableRadioGroup
              legend="Ensaio Visual"
              name={`visual-${index}`}
              value={data.visualTest}
              options={['Aprovado', 'Reprovado']}
              onChange={(value) => onChange({ visualTest: value })}
            />

            <ClearableRadioGroup
              legend="Dielétrico"
              name={`dielectric-${index}`}
              value={data.dielectric}
              options={['Aprovado', 'Reprovado']}
              onChange={(value) => onChange({ dielectric: value })}
            />
          </div>
        </RatmExpandableSection>

        <RatmExpandableSection
          title="Lacre do Invólucro"
          accordionName={accordionName}
          complete={enclosureSealComplete}
        >
          <div className="ratm-section-box-grid">
            <label className="full-width">
              Número do lacre
              <div className="search-input-row">
                <input
                  type="text"
                  value={data.enclosureSeal}
                  onChange={(event) => onChange({ enclosureSeal: event.target.value })}
                />
                <ScanButton field="involucro" onScan={onScan} />
              </div>
            </label>

            <YesNoIconQuestion
              label="Lacre igual TOI"
              value={data.sealMatchesToi}
              justification={data.sealMatchesToiJustification}
              onChange={(value) => onChange({ sealMatchesToi: value })}
              onJustificationChange={(value) =>
                onChange({ sealMatchesToiJustification: value })
              }
            />

            <YesNoIconQuestion
              label="Lacre igual as imagens de campo?"
              value={data.sealMatchesFieldImages}
              justification={data.sealMatchesFieldImagesJustification}
              onChange={(value) => onChange({ sealMatchesFieldImages: value })}
              onJustificationChange={(value) =>
                onChange({ sealMatchesFieldImagesJustification: value })
              }
            />

            <ClearableRadioGroup
              legend="Status invólucro"
              name={`enclosure-status-${index}`}
              value={data.enclosureStatus}
              options={['Em ordem', 'Violado', 'Sem lacre']}
              onChange={(value) => onChange({ enclosureStatus: value })}
            />
          </div>
        </RatmExpandableSection>

        <RatmExpandableSection
          title="Lacre da tampa do medidor 1"
          accordionName={accordionName}
          complete={seal1Complete}
        >
          <div className="ratm-section-box-grid">
            <label className="full-width">
              Número do lacre
              <div className="search-input-row">
                <input
                  type="text"
                  value={data.seal1}
                  onChange={(event) => onChange({ seal1: event.target.value })}
                />
                <ScanButton field="lacre1" onScan={onScan} />
              </div>
            </label>

            <ClearableRadioGroup
              legend="Status lacre da tampa do medidor 1"
              name={`seal1-status-${index}`}
              value={data.seal1Status}
              options={['Violado', 'Sem lacre', 'Em ordem']}
              onChange={(value) => onChange({ seal1Status: value })}
            />
          </div>
        </RatmExpandableSection>

        <RatmExpandableSection
          title="Lacre da tampa do medidor 2"
          accordionName={accordionName}
          complete={seal2Complete}
        >
          <div className="ratm-section-box-grid">
            <label className="full-width">
              Número do lacre
              <div className="search-input-row">
                <input
                  type="text"
                  value={data.seal2}
                  onChange={(event) => onChange({ seal2: event.target.value })}
                />
                <ScanButton field="lacre2" onScan={onScan} />
              </div>
            </label>

            <ClearableRadioGroup
              legend="Status lacre da tampa do medidor 2"
              name={`seal2-status-${index}`}
              value={data.seal2Status}
              options={['Violado', 'Sem lacre', 'Em ordem', 'Não aplicável']}
              onChange={(value) => onChange({ seal2Status: value })}
            />
          </div>
        </RatmExpandableSection>

        <label className="full-width">
          Leitura medidor
          <input
            type="text"
            value={data.meterReading}
            onChange={(event) =>
              onChange({
                meterReading: event.target.value,
                meterReadingPreset: '',
              })
            }
          />
        </label>

        <ClearableRadioGroup
          legend=""
          name={`reading-preset-${index}`}
          value={data.meterReadingPreset}
          options={['Não aplicável']}
          onChange={(value) =>
            onChange({
              meterReadingPreset: value,
              meterReading: value,
            })
          }
        />

        <ClearableRadioGroup
          legend="Status leitura"
          name={`reading-status-${index}`}
          value={data.meterReadingStatus}
          options={['Apagado', 'Sem leitura', 'Ilegível']}
          onChange={(value) => onChange({ meterReadingStatus: value })}
        />

        <ClearableRadioGroup
          legend="Mesa de ensaio"
          name={`bench-${index}`}
          value={data.testBench}
          options={TEST_BENCH_OPTIONS}
          onChange={(value) => onChange({ testBench: value })}
          vertical
        />

        <RatmExpandableSection
          title="Medições (CN, CI, CP)"
          accordionName={accordionName}
          complete={measurementsComplete}
        >
          <div className="ratm-section-box-grid">
            {(['cn', 'ci', 'cp', 'cnRi', 'cnRc'] as const).map((fieldKey) => {
              const labels: Record<typeof fieldKey, string> = {
                cn: 'CN',
                ci: 'CI',
                cp: 'CP',
                cnRi: 'CN_R_I',
                cnRc: 'CN_R_C',
              }
              const presetKey = `${fieldKey}Preset` as keyof RatmFormData

              return (
                <div key={fieldKey} className="full-width numeric-field-block">
                  <label>
                    {labels[fieldKey]}
                    <input
                      type="text"
                      value={data[fieldKey]}
                      onChange={(event) =>
                        onChange({
                          [fieldKey]: event.target.value,
                          [presetKey]: '',
                        })
                      }
                    />
                  </label>
                  <ClearableRadioGroup
                    legend=""
                    name={`${fieldKey}-preset-${index}`}
                    value={String(data[presetKey])}
                    options={['-100', 'Não aplicável']}
                    onChange={(value) =>
                      onChange({
                        [presetKey]: value,
                        [fieldKey]: value,
                      })
                    }
                  />
                </div>
              )
            })}
          </div>
        </RatmExpandableSection>

        <ClearableRadioGroup
          legend="Marcha"
          name={`march-${index}`}
          value={data.march}
          options={['Aprovado', 'Reprovado', 'Não aplicável']}
          onChange={(value) => onChange({ march: value })}
        />

        <ClearableRadioGroup
          legend="Registrador"
          name={`recorder-${index}`}
          value={data.recorder}
          options={['Aprovado', 'Reprovado']}
          onChange={(value) => onChange({ recorder: value })}
        />

        <label className="full-width">
          Fase Interrompida
          <input
            type="text"
            value={data.interruptedPhase}
            onChange={(event) => onChange({ interruptedPhase: event.target.value })}
          />
        </label>

        <ClearableRadioGroup
          legend=""
          name={`phase-option-${index}`}
          value={data.interruptedPhaseOption}
          options={['Não aplicável', 'A', 'B', 'C']}
          onChange={(value) => onChange({ interruptedPhaseOption: value })}
        />

        <label className="full-width">
          Cód. Irregularidade
          <select
            value={data.irregularityCode}
            onChange={(event) => {
              const irregularityCode = event.target.value
              onChange({
                irregularityCode,
                irregularityNotes: descriptionForCode(irregularityCode),
              })
            }}
          >
            {Object.keys(codesForSelect(irregularityCodes, data.irregularityCode)).map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        <label className="full-width">
          Descrição Irregularidade
          <input type="text" value={irregularityDescription} readOnly />
        </label>

        <label className="full-width">
          Descrição
          <textarea
            rows={4}
            value={irregularityCatalogDescription || data.irregularityNotes}
            readOnly
          />
        </label>

        <ClearableRadioGroup
          legend="Laudo de campo está correto?"
          name={`report-${index}`}
          value={data.fieldReportCorrect}
          options={['Sim', 'Não', 'Parcial']}
          onChange={(value) => onChange({ fieldReportCorrect: value })}
        />

        <label className="full-width">
          Código da irregularidade em campo
          <select
            value={data.fieldIrregularityCode}
            onChange={(event) => onChange({ fieldIrregularityCode: event.target.value })}
          >
            {Object.keys(codesForSelect(irregularityCodes, data.fieldIrregularityCode)).map(
              (code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ),
            )}
          </select>
        </label>

        <label className="full-width">
          Descrição da irregularidade em campo
          <input type="text" value={fieldIrregularityDescription} readOnly />
        </label>

        <label className="full-width">
          Observações para Laboratório
          <textarea
            rows={4}
            value={data.laboratoryNotes}
            onChange={(event) => onChange({ laboratoryNotes: event.target.value })}
          />
        </label>

        <label className="full-width">
          Inspeção de campo realizada por:
          <input
            type="text"
            value={data.fieldInspectionBy}
            onChange={(event) => onChange({ fieldInspectionBy: event.target.value })}
            placeholder="Maurício 6757 / Célio 6153"
          />
        </label>

        <ClearableRadioGroup
          legend="Tipo NS"
          name={`ns-type-${index}`}
          value={data.nsType}
          options={['Consumo irregular (CI)', 'Falha na medição (FM)']}
          onChange={(value) => onChange({ nsType: value })}
          vertical
        />

        <RatmExpandableSection
          title="Resultados de ensaio"
          accordionName={accordionName}
          complete={testResultsComplete}
        >
          <div className="ratm-section-box-grid">
            <ClearableRadioGroup
              legend="Medidor quebrado/ furado"
              name={`broken-meter-${index}`}
              value={data.brokenMeter}
              options={['Sim', 'Não']}
              onChange={(value) => onChange({ brokenMeter: value })}
            />

            <ClearableRadioGroup
              legend="Display apagado/ não liga"
              name={`display-off-${index}`}
              value={data.displayOff}
              options={['Sim', 'Não']}
              onChange={(value) => onChange({ displayOff: value })}
            />

            <ClearableRadioGroup
              legend="Facilidade de acesso ao interior do medidor"
              name={`meter-interior-${index}`}
              value={data.meterInteriorAccess}
              options={['Sim', 'Não']}
              onChange={(value) => onChange({ meterInteriorAccess: value })}
            />

            <ClearableRadioGroup
              legend="Bobina danificada"
              name={`damaged-coil-${index}`}
              value={data.damagedCoil}
              options={['Sim', 'Não']}
              onChange={(value) => onChange({ damagedCoil: value })}
            />

            <ClearableRadioGroup
              legend="Aparentemente em ordem"
              name={`apparently-order-${index}`}
              value={data.apparentlyInOrder}
              options={['Sim', 'Não']}
              onChange={(value) => onChange({ apparentlyInOrder: value })}
            />

            <ClearableRadioGroup
              legend="Reprovado dielétrico"
              name={`dielectric-failed-${index}`}
              value={data.dielectricFailed}
              options={['Sim', 'Não']}
              onChange={(value) => onChange({ dielectricFailed: value })}
            />

            <ClearableRadioGroup
              legend="Corpo estranho no interior do medidor"
              name={`foreign-body-${index}`}
              value={data.foreignBodyInMeter}
              options={['Sim', 'Não']}
              onChange={(value) => onChange({ foreignBodyInMeter: value })}
            />

            {data.photos.map((photo, photoIndex) => (
              <PhotoUpload
                key={photoIndex}
                label={`Foto ${photoIndex + 1}`}
                value={photo}
                onChange={(value) => updatePhoto(photoIndex, value)}
              />
            ))}
          </div>
        </RatmExpandableSection>
      </div>
    </div>
    {data.scheduleId ? <RatmDocumentFab scheduleId={data.scheduleId} meter={data.meter} /> : null}
    </>
  )
}
