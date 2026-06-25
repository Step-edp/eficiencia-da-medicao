import type { ChangeEvent } from 'react'
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
  onClear?: () => void
  vertical?: boolean
}

function ClearableRadioGroup({
  legend,
  name,
  value,
  options,
  onChange,
  onClear,
  vertical = false,
}: RadioGroupProps) {
  return (
    <fieldset className="radio-fieldset full-width">
      <div className="radio-fieldset-header">
        <legend>{legend}</legend>
        {onClear ? (
          <button className="clear-field-button" type="button" onClick={onClear} title="Limpar">
            Limpar
          </button>
        ) : null}
      </div>
      <div className={`radio-group ${vertical ? 'radio-group-vertical' : ''}`}>
        {options.map((option) => (
          <label key={option} className="radio-option">
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
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
  const irregularityDescription =
    IRREGULARITY_CODES[data.irregularityCode] ?? 'Selecione um código válido.'

  const fieldIrregularityDescription =
    IRREGULARITY_CODES[data.fieldIrregularityCode] ?? 'Selecione um código válido.'

  const updatePhoto = (photoIndex: number, value: string) => {
    const photos = [...data.photos]
    photos[photoIndex] = value
    onChange({ photos })
  }

  const handleMeterSearch = () => {
    const meter = data.meterSearch.trim()
    if (!meter) {
      return
    }

    onChange({
      meter,
      meterStatus: 'Aprovado',
    })
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
              onChange={(event) => onChange({ meterSearch: event.target.value })}
              placeholder="Digite o Nº do medidor"
            />
            <button className="secondary-button search-button" type="button" onClick={handleMeterSearch}>
              Buscar
            </button>
          </div>
        </label>

        <button className="scan-button align-right full-width" type="button" onClick={() => onScan('medidor')}>
          Digitalizar
        </button>

        <label>
          Medidor
          <input
            type="text"
            value={data.meter}
            onChange={(event) => onChange({ meter: event.target.value })}
          />
        </label>

        {data.meterStatus ? (
          <p className="ratm-status-line full-width">Status - {data.meterStatus}</p>
        ) : null}

        <label className="full-width">
          Data de agendamento
          <div className="datetime-row">
            <input
              type="date"
              value={data.scheduleDate}
              onChange={(event) => onChange({ scheduleDate: event.target.value })}
            />
            <select
              value={data.scheduleHour}
              onChange={(event) => onChange({ scheduleHour: event.target.value })}
              aria-label="Hora"
            >
              {Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0')).map((hour) => (
                <option key={hour} value={hour}>
                  {hour}
                </option>
              ))}
            </select>
            <select
              value={data.scheduleMinute}
              onChange={(event) => onChange({ scheduleMinute: event.target.value })}
              aria-label="Minuto"
            >
              {Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0')).map((minute) => (
                <option key={minute} value={minute}>
                  :{minute}
                </option>
              ))}
            </select>
          </div>
        </label>

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
          onClear={() => onChange({ analysisRequest: '' })}
        />

        <ClearableRadioGroup
          legend="Cliente acompanhou"
          name={`accompanied-${index}`}
          value={data.clientAccompanied}
          options={['Sim', 'Não']}
          onChange={(value) => onChange({ clientAccompanied: value })}
          onClear={() => onChange({ clientAccompanied: '' })}
        />

        <ClearableRadioGroup
          legend="Ensaio Visual"
          name={`visual-${index}`}
          value={data.visualTest}
          options={['Aprovado', 'Reprovado']}
          onChange={(value) => onChange({ visualTest: value })}
          onClear={() => onChange({ visualTest: '' })}
          vertical
        />

        <ClearableRadioGroup
          legend="Dielétrico"
          name={`dielectric-${index}`}
          value={data.dielectric}
          options={['Aprovado', 'Reprovado']}
          onChange={(value) => onChange({ dielectric: value })}
          onClear={() => onChange({ dielectric: '' })}
          vertical
        />

        <label className="full-width">
          Lacre do Involucro
          <input
            type="text"
            value={data.enclosureSeal}
            onChange={(event) => onChange({ enclosureSeal: event.target.value })}
          />
        </label>

        <button className="scan-button align-right full-width" type="button" onClick={() => onScan('involucro')}>
          Digitalizar
        </button>

        <ClearableRadioGroup
          legend="Status invólucro"
          name={`enclosure-status-${index}`}
          value={data.enclosureStatus}
          options={['Em ordem', 'Violado', 'Sem lacre']}
          onChange={(value) => onChange({ enclosureStatus: value })}
          onClear={() => onChange({ enclosureStatus: '' })}
          vertical
        />

        <label className="full-width">
          Lacre 1
          <input type="text" value={data.seal1} onChange={(event) => onChange({ seal1: event.target.value })} />
        </label>

        <button className="scan-button align-right full-width" type="button" onClick={() => onScan('lacre1')}>
          Digitalizar
        </button>

        <ClearableRadioGroup
          legend="Status lacre 1"
          name={`seal1-status-${index}`}
          value={data.seal1Status}
          options={['Violado', 'Sem lacre', 'Em ordem']}
          onChange={(value) => onChange({ seal1Status: value })}
          onClear={() => onChange({ seal1Status: '' })}
          vertical
        />

        <label className="full-width">
          Lacre 2
          <input type="text" value={data.seal2} onChange={(event) => onChange({ seal2: event.target.value })} />
        </label>

        <button className="scan-button align-right full-width" type="button" onClick={() => onScan('lacre2')}>
          Digitalizar
        </button>

        <ClearableRadioGroup
          legend="Status lacre 2"
          name={`seal2-status-${index}`}
          value={data.seal2Status}
          options={['Violado', 'Sem lacre', 'Em ordem', 'N/A']}
          onChange={(value) => onChange({ seal2Status: value })}
          onClear={() => onChange({ seal2Status: '' })}
          vertical
        />

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
          onClear={() => onChange({ meterReadingPreset: '' })}
        />

        <ClearableRadioGroup
          legend="Status leitura"
          name={`reading-status-${index}`}
          value={data.meterReadingStatus}
          options={['Apagado', 'Sem leitura', 'Ilegível']}
          onChange={(value) => onChange({ meterReadingStatus: value })}
          onClear={() => onChange({ meterReadingStatus: '' })}
          vertical
        />

        <ClearableRadioGroup
          legend="Mesa de ensaio"
          name={`bench-${index}`}
          value={data.testBench}
          options={TEST_BENCH_OPTIONS}
          onChange={(value) => onChange({ testBench: value })}
          onClear={() => onChange({ testBench: '' })}
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
                onClear={() => onChange({ [presetKey]: '' })}
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
          onClear={() => onChange({ march: '' })}
          vertical
        />

        <ClearableRadioGroup
          legend="Registrador"
          name={`recorder-${index}`}
          value={data.recorder}
          options={['Aprovado', 'Reprovado']}
          onChange={(value) => onChange({ recorder: value })}
          onClear={() => onChange({ recorder: '' })}
          vertical
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
          onClear={() => onChange({ interruptedPhaseOption: '' })}
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
          onClear={() => onChange({ fieldReportCorrect: '' })}
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
          onClear={() => onChange({ nsType: '' })}
          vertical
        />

        <h3 className="ratm-section-title full-width">RESULTADOS DE ENSAIO</h3>

        <ClearableRadioGroup
          legend="Medidor quebrado/ furado"
          name={`broken-meter-${index}`}
          value={data.brokenMeter}
          options={['Sim', 'Não']}
          onChange={(value) => onChange({ brokenMeter: value })}
          onClear={() => onChange({ brokenMeter: '' })}
        />

        <ClearableRadioGroup
          legend="Display apagado/ não liga"
          name={`display-off-${index}`}
          value={data.displayOff}
          options={['Sim', 'Não']}
          onChange={(value) => onChange({ displayOff: value })}
          onClear={() => onChange({ displayOff: '' })}
        />

        <ClearableRadioGroup
          legend="Facilidade de acesso ao interior do medidor"
          name={`meter-interior-${index}`}
          value={data.meterInteriorAccess}
          options={['Sim', 'Não']}
          onChange={(value) => onChange({ meterInteriorAccess: value })}
          onClear={() => onChange({ meterInteriorAccess: '' })}
        />

        <ClearableRadioGroup
          legend="Bobina danificada"
          name={`damaged-coil-${index}`}
          value={data.damagedCoil}
          options={['Sim', 'Não']}
          onChange={(value) => onChange({ damagedCoil: value })}
          onClear={() => onChange({ damagedCoil: '' })}
        />

        <ClearableRadioGroup
          legend="Aparentemente em ordem"
          name={`apparently-order-${index}`}
          value={data.apparentlyInOrder}
          options={['Sim', 'Não']}
          onChange={(value) => onChange({ apparentlyInOrder: value })}
          onClear={() => onChange({ apparentlyInOrder: '' })}
        />

        <ClearableRadioGroup
          legend="Reprovado dielétrico"
          name={`dielectric-failed-${index}`}
          value={data.dielectricFailed}
          options={['Sim', 'Não']}
          onChange={(value) => onChange({ dielectricFailed: value })}
          onClear={() => onChange({ dielectricFailed: '' })}
        />

        <ClearableRadioGroup
          legend="Corpo estranho no interior do medidor"
          name={`foreign-body-${index}`}
          value={data.foreignBodyInMeter}
          options={['Sim', 'Não']}
          onChange={(value) => onChange({ foreignBodyInMeter: value })}
          onClear={() => onChange({ foreignBodyInMeter: '' })}
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
    </div>
  )
}
