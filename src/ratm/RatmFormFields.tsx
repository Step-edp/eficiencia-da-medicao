import { useState, type ChangeEvent, type ReactNode } from 'react'
import { api, ApiError } from '../api'
import type { RatmFormData } from './types'
import { IRREGULARITY_CODES, ITEM_LOOKUP_OPTIONS, TEST_BENCH_OPTIONS } from './types'

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

function formatScheduleDisplay(data: RatmFormData) {
  const label = (data.scheduleLabel ?? '').trim()
  if (label) return label
  if (!data.scheduleDate) return '—'
  const [year, month, day] = data.scheduleDate.split('-')
  if (!year || !month || !day) return '—'
  return `${day}/${month}/${year} às ${data.scheduleHour ?? '08'}:${data.scheduleMinute ?? '30'}`
}

function displayOrDash(value?: string | null) {
  const trimmed = value?.trim() ?? ''
  return trimmed || '—'
}

function RatmExpandableSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details className="ratm-expandable full-width" defaultOpen={defaultOpen}>
      <summary className="ratm-expandable-summary">
        <span className="ratm-expandable-title">{title}</span>
        <span className="ratm-expandable-chevron" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="ratm-expandable-body">{children}</div>
    </details>
  )
}

function emptyScheduleFields(): Partial<RatmFormData> {
  return {
    meter: '',
    meterStatus: '',
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

function optionChoiceTone(option: string): 'positive' | 'negative' | 'neutral' {
  const normalized = option.trim().toLowerCase()
  if (
    normalized === 'aprovado' ||
    normalized === 'sim' ||
    normalized === 'em ordem'
  ) {
    return 'positive'
  }
  if (
    normalized === 'reprovado' ||
    normalized === 'não' ||
    normalized === 'nao' ||
    normalized === 'violado' ||
    normalized === 'sem lacre'
  ) {
    return 'negative'
  }
  return 'neutral'
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
          const tone = optionChoiceTone(option)
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`ratm-choice-btn tone-${tone}${selected ? ' is-selected' : ''}`}
              onClick={() => onChange(option)}
            >
              {tone === 'positive' ? (
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
              ) : null}
              {tone === 'negative' ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : null}
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

  const irregularityDescription =
    IRREGULARITY_CODES[data.irregularityCode] ?? 'Selecione um código válido.'

  const fieldIrregularityDescription =
    IRREGULARITY_CODES[data.fieldIrregularityCode] ?? 'Selecione um código válido.'

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

      const partnerLabel = schedule.partnerName
        ? `${schedule.partnerName}${
            schedule.partnerRegistration ? ` (${schedule.partnerRegistration})` : ''
          }`
        : ''

      onChange({
        meter: schedule.meter,
        meterStatus: schedule.trailStep || 'Agendado',
        scheduleLabel: schedule.scheduledAtLabel || '',
        installation: schedule.installation || '',
        toi: schedule.toi || '',
        note: schedule.note || '',
        csd: schedule.csd || '',
        partnerLabel,
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

  return (
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
          </div>
        </label>

        <button className="scan-button align-right full-width" type="button" onClick={() => onScan('medidor')}>
          Digitalizar
        </button>

        {meterLookupError ? (
          <p className="field-error full-width" role="alert">
            {meterLookupError}
          </p>
        ) : null}

        <div className="ratm-readonly-field">
          <span className="ratm-readonly-label">Medidor</span>
          <p className="ratm-readonly-value">{displayOrDash(data.meter)}</p>
        </div>

        <RatmExpandableSection title="Informações de entrada" defaultOpen>
          {data.meterStatus ? (
            <p className="ratm-status-line">Status - {data.meterStatus}</p>
          ) : null}

          <div className="ratm-readonly-field">
            <span className="ratm-readonly-label">Data de agendamento</span>
            <p className="ratm-readonly-value">{formatScheduleDisplay(data)}</p>
          </div>

          <div className="ratm-schedule-details" aria-label="Informações do agendamento">
            <div className="ratm-readonly-field">
              <span className="ratm-readonly-label">Instalação</span>
              <p className="ratm-readonly-value">{displayOrDash(data.installation)}</p>
            </div>
            <div className="ratm-readonly-field">
              <span className="ratm-readonly-label">TOI</span>
              <p className="ratm-readonly-value">{displayOrDash(data.toi)}</p>
            </div>
            <div className="ratm-readonly-field">
              <span className="ratm-readonly-label">Nota</span>
              <p className="ratm-readonly-value">{displayOrDash(data.note)}</p>
            </div>
            <div className="ratm-readonly-field">
              <span className="ratm-readonly-label">CSD</span>
              <p className="ratm-readonly-value">{displayOrDash(data.csd)}</p>
            </div>
            <div className="ratm-readonly-field">
              <span className="ratm-readonly-label">Parceiro</span>
              <p className="ratm-readonly-value">{displayOrDash(data.partnerLabel)}</p>
            </div>
            <div className="ratm-readonly-field">
              <span className="ratm-readonly-label">Cliente presente</span>
              <p className="ratm-readonly-value">{displayOrDash(data.clientPresent)}</p>
            </div>
            <div className="ratm-readonly-field">
              <span className="ratm-readonly-label">Prazo de entrega</span>
              <p className="ratm-readonly-value">{displayOrDash(data.deliveryDeadlineLabel)}</p>
            </div>
            <div className="ratm-readonly-field full-width">
              <span className="ratm-readonly-label">Observações de agendamento</span>
              <p className="ratm-readonly-value">{displayOrDash(data.schedulingNotes)}</p>
            </div>
          </div>
        </RatmExpandableSection>

        <label className="full-width">
          Cliente
          <input
            type="text"
            value={data.client}
            onChange={(event) => onChange({ client: event.target.value })}
            placeholder="Edifício Independence"
          />
        </label>

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

        <RatmExpandableSection title="Lacre do Invólucro" defaultOpen>
          <div className="ratm-section-box-grid">
            <label className="full-width">
              Número do lacre
              <input
                type="text"
                value={data.enclosureSeal}
                onChange={(event) => onChange({ enclosureSeal: event.target.value })}
              />
            </label>

            <button
              className="scan-button align-right full-width"
              type="button"
              onClick={() => onScan('involucro')}
            >
              Digitalizar
            </button>

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

        <RatmExpandableSection title="Lacre 1" defaultOpen>
          <div className="ratm-section-box-grid">
            <label className="full-width">
              Número do lacre
              <input
                type="text"
                value={data.seal1}
                onChange={(event) => onChange({ seal1: event.target.value })}
              />
            </label>

            <button
              className="scan-button align-right full-width"
              type="button"
              onClick={() => onScan('lacre1')}
            >
              Digitalizar
            </button>

            <ClearableRadioGroup
              legend="Status lacre 1"
              name={`seal1-status-${index}`}
              value={data.seal1Status}
              options={['Violado', 'Sem lacre', 'Em ordem']}
              onChange={(value) => onChange({ seal1Status: value })}
            />
          </div>
        </RatmExpandableSection>

        <RatmExpandableSection title="Lacre 2" defaultOpen>
          <div className="ratm-section-box-grid">
            <label className="full-width">
              Número do lacre
              <input
                type="text"
                value={data.seal2}
                onChange={(event) => onChange({ seal2: event.target.value })}
              />
            </label>

            <button
              className="scan-button align-right full-width"
              type="button"
              onClick={() => onScan('lacre2')}
            >
              Digitalizar
            </button>

            <ClearableRadioGroup
              legend="Status lacre 2"
              name={`seal2-status-${index}`}
              value={data.seal2Status}
              options={['Violado', 'Sem lacre', 'Em ordem', 'N/A']}
              onChange={(value) => onChange({ seal2Status: value })}
            />
          </div>
        </RatmExpandableSection>

        <label className="full-width">
          Leitura medidor
          <input
            type="text"
            value={data.meterReading}
            onChange={(event) => onChange({ meterReading: event.target.value })}
          />
        </label>

        <ClearableRadioGroup
          legend=""
          name={`reading-preset-${index}`}
          value={data.meterReadingPreset}
          options={['N/A']}
          onChange={(value) => onChange({ meterReadingPreset: value })}
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
                  onChange={(event) => onChange({ [fieldKey]: event.target.value })}
                />
              </label>
              <ClearableRadioGroup
                legend=""
                name={`${fieldKey}-preset-${index}`}
                value={String(data[presetKey])}
                options={fieldKey === 'cnRc' ? ['-100', 'N/A'] : ['-100', 'N/A']}
                onChange={(value) => onChange({ [presetKey]: value })}
              />
            </div>
          )
        })}

        <ClearableRadioGroup
          legend="Marcha"
          name={`march-${index}`}
          value={data.march}
          options={['Aprovado', 'Reprovado', 'NA']}
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
          options={['N/A', 'A', 'B', 'C']}
          onChange={(value) => onChange({ interruptedPhaseOption: value })}
        />

        <label className="full-width">
          Cód. Irregularidade
          <select
            value={data.irregularityCode}
            onChange={(event) => onChange({ irregularityCode: event.target.value })}
          >
            {Object.keys(IRREGULARITY_CODES).map((code) => (
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
          Observações de Irregularidade
          <textarea
            rows={4}
            value={data.irregularityNotes}
            onChange={(event) => onChange({ irregularityNotes: event.target.value })}
          />
        </label>

        <label className="full-width">
          Localizar itens
          <select
            value={data.itemLookup}
            onChange={(event) => onChange({ itemLookup: event.target.value })}
          >
            <option value="">Localizar itens</option>
            {ITEM_LOOKUP_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <ClearableRadioGroup
          legend="Laudo de campo está correto?"
          name={`report-${index}`}
          value={data.fieldReportCorrect}
          options={['Sim', 'Não']}
          onChange={(value) => onChange({ fieldReportCorrect: value })}
        />

        <label className="full-width">
          Código da irregularidade em campo
          <select
            value={data.fieldIrregularityCode}
            onChange={(event) => onChange({ fieldIrregularityCode: event.target.value })}
          >
            {Object.keys(IRREGULARITY_CODES).map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
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

        <RatmExpandableSection title="Resultados de ensaio" defaultOpen>
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
  )
}
