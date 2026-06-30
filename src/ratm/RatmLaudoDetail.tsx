import { IRREGULARITY_CODES } from './types'
import type { RatmLaudo } from './laudos'

type RatmLaudoDetailProps = {
  laudo: RatmLaudo
  onClose: () => void
}

type DetailFieldProps = {
  label: string
  value: string
}

function DetailField({ label, value }: DetailFieldProps) {
  return (
    <div className="laudo-detail-field">
      <span>{label}</span>
      <strong>{value.trim() || '—'}</strong>
    </div>
  )
}

export function RatmLaudoDetail({ laudo, onClose }: RatmLaudoDetailProps) {
  const form = laudo.formData
  const scheduleDate = form.scheduleDate
    ? `${form.scheduleDate.split('-').reverse().join('/')} ${form.scheduleHour}:${form.scheduleMinute}`
    : ''

  return (
    <div className="laudo-modal-overlay" role="presentation" onClick={onClose}>
      <section
        className="laudo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`laudo-title-${laudo.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="laudo-modal-header">
          <div>
            <p className="section-tag">Laudo de RATM</p>
            <h3 id={`laudo-title-${laudo.id}`}>Laudo RATM {laudo.ratmNumber}</h3>
          </div>
          <button className="secondary-button compact-button" type="button" onClick={onClose}>
            Fechar
          </button>
        </header>

        <div className="laudo-detail-grid">
          <DetailField label="Medidor" value={form.meter} />
          <DetailField label="Status do medidor" value={form.meterStatus} />
          <DetailField label="Cliente" value={form.client} />
          <DetailField label="Data de agendamento" value={scheduleDate} />
          <DetailField label="Análise a pedido" value={form.analysisRequest} />
          <DetailField label="Cliente acompanhou" value={form.clientAccompanied} />
          <DetailField label="Ensaio visual" value={form.visualTest} />
          <DetailField label="Dielétrico" value={form.dielectric} />
          <DetailField label="Lacre do invólucro" value={form.enclosureSeal} />
          <DetailField label="Status invólucro" value={form.enclosureStatus} />
          <DetailField label="Lacre 1" value={form.seal1} />
          <DetailField label="Status lacre 1" value={form.seal1Status} />
          <DetailField label="Lacre 2" value={form.seal2} />
          <DetailField label="Status lacre 2" value={form.seal2Status} />
          <DetailField label="Leitura medidor" value={form.meterReading} />
          <DetailField label="Status leitura" value={form.meterReadingStatus} />
          <DetailField label="Mesa de ensaio" value={form.testBench} />
          <DetailField label="CN" value={form.cn} />
          <DetailField label="CI" value={form.ci} />
          <DetailField label="CP" value={form.cp} />
          <DetailField label="Marcha" value={form.march} />
          <DetailField label="Registrador" value={form.recorder} />
          <DetailField
            label="Código de irregularidade"
            value={`${form.irregularityCode} - ${IRREGULARITY_CODES[form.irregularityCode] ?? ''}`.trim()}
          />
          <DetailField label="Observações de irregularidade" value={form.irregularityNotes} />
          <DetailField label="Laudo de campo correto?" value={form.fieldReportCorrect} />
          <DetailField
            label="Irregularidade em campo"
            value={`${form.fieldIrregularityCode} - ${IRREGULARITY_CODES[form.fieldIrregularityCode] ?? ''}`.trim()}
          />
          <DetailField label="Observações para laboratório" value={form.laboratoryNotes} />
          <DetailField label="Inspeção de campo por" value={form.fieldInspectionBy} />
          <DetailField label="Tipo NS" value={form.nsType} />
          <DetailField label="Medidor quebrado/furado" value={form.brokenMeter} />
          <DetailField label="Display apagado/não liga" value={form.displayOff} />
          <DetailField
            label="Facilidade de acesso ao interior"
            value={form.meterInteriorAccess}
          />
          <DetailField label="Bobina danificada" value={form.damagedCoil} />
          <DetailField label="Aparentemente em ordem" value={form.apparentlyInOrder} />
          <DetailField label="Reprovado dielétrico" value={form.dielectricFailed} />
          <DetailField
            label="Corpo estranho no interior"
            value={form.foreignBodyInMeter}
          />
          <DetailField
            label="Gerado em"
            value={new Date(laudo.createdAt).toLocaleString('pt-BR')}
          />
          <DetailField label="Status do laudo" value={laudo.status} />
        </div>

        {form.photos.some(Boolean) ? (
          <div className="laudo-photo-grid">
            {form.photos.map((photo, index) =>
              photo ? (
                <figure key={index} className="laudo-photo-item">
                  <figcaption>Foto {index + 1}</figcaption>
                  <img src={photo} alt={`Foto ${index + 1} do laudo RATM ${laudo.ratmNumber}`} />
                </figure>
              ) : null,
            )}
          </div>
        ) : null}
      </section>
    </div>
  )
}
