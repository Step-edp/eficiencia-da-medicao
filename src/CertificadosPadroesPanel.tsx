import { FormEvent, useCallback, useEffect, useId, useState } from 'react'
import { api, ApiError, type StandardCertificateRecord } from './api'
import { LoginFeedback } from './LoginFeedback'
import { readAttachmentAsDataUrl } from './readAttachmentAsDataUrl'

function formatValidUntil(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

const emptyForm = {
  assetNumber: '',
  serial: '',
  model: '',
  manufacturer: '',
  accuracyClass: '',
  certificateNumber: '',
  validUntil: '',
  certificateType: '' as '' | 'Padrão' | 'Hipot',
  pdf: '',
  pdfName: '',
}

export function CertificadosPadroesPanel({ readOnly = false }: { readOnly?: boolean }) {
  const fileInputId = useId()
  const [certificates, setCertificates] = useState<StandardCertificateRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { certificates: rows } = await api.listStandardCertificates()
      setCertificates(rows)
    } catch (error) {
      setCertificates([])
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os certificados.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const resetForm = () => {
    setForm(emptyForm)
    setShowForm(false)
  }

  const updateField = (key: keyof typeof emptyForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (
      !form.assetNumber.trim() ||
      !form.serial.trim() ||
      !form.model.trim() ||
      !form.manufacturer.trim() ||
      !form.accuracyClass.trim() ||
      !form.certificateNumber.trim() ||
      !form.validUntil ||
      (form.certificateType !== 'Padrão' && form.certificateType !== 'Hipot') ||
      !form.pdf
    ) {
      setFeedback({
        type: 'error',
        message: 'Importe o PDF e preencha todos os campos.',
      })
      return
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      const { certificate } = await api.createStandardCertificate({
        assetNumber: form.assetNumber.trim(),
        serial: form.serial.trim(),
        model: form.model.trim(),
        manufacturer: form.manufacturer.trim(),
        accuracyClass: form.accuracyClass.trim(),
        certificateNumber: form.certificateNumber.trim(),
        certificateType: form.certificateType,
        validUntil: form.validUntil,
        pdf: form.pdf,
        pdfName: form.pdfName || 'certificado.pdf',
      })
      setCertificates((current) => [certificate, ...current])
      setFeedback({
        type: 'success',
        message: `Certificado ${certificate.certificateNumber} cadastrado.`,
      })
      resetForm()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError ? error.message : 'Não foi possível cadastrar o certificado.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const openPdf = async (certificate: StandardCertificateRecord) => {
    try {
      const { pdf, pdfName } = await api.getStandardCertificatePdf(certificate.id)
      const anchor = document.createElement('a')
      anchor.href = pdf
      anchor.target = '_blank'
      anchor.rel = 'noreferrer'
      anchor.download = pdfName || 'certificado.pdf'
      anchor.click()
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof ApiError ? error.message : 'Não foi possível abrir o PDF.',
      })
    }
  }

  return (
    <div className="certificados-padroes-panel">
      {readOnly ? null : (
        <div className="area-actions right-aligned-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              if (showForm) {
                resetForm()
                return
              }
              setShowForm(true)
              setFeedback(null)
            }}
          >
            {showForm ? 'Fechar formulário' : 'Cadastrar Certificado'}
          </button>
        </div>
      )}

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      {!readOnly && showForm ? (
        <form
          className="material-form-grid apresentacao-form"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="full-width">
            <span className="agenda-attachment-label">PDF do certificado</span>
            <div className="file-picker">
              <input
                id={fileInputId}
                className="file-picker-input"
                type="file"
                accept="application/pdf,.pdf"
                disabled={submitting}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) {
                    updateField('pdf', '')
                    updateField('pdfName', '')
                    return
                  }
                  const isPdf =
                    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
                  if (!isPdf) {
                    event.target.value = ''
                    setFeedback({ type: 'error', message: 'Importe um arquivo PDF.' })
                    return
                  }
                  void readAttachmentAsDataUrl(file, {
                    maxBytes: 15_000_000,
                    allowOfficeDocuments: true,
                  })
                    .then((dataUrl) => {
                      const pdf = dataUrl.startsWith('data:application/pdf')
                        ? dataUrl
                        : dataUrl.replace(/^data:[^,]*/, 'data:application/pdf')
                      setForm((current) => ({ ...current, pdf, pdfName: file.name }))
                      setFeedback(null)
                    })
                    .catch((error: unknown) => {
                      setForm((current) => ({ ...current, pdf: '', pdfName: '' }))
                      event.target.value = ''
                      setFeedback({
                        type: 'error',
                        message:
                          error instanceof Error
                            ? error.message
                            : 'Não foi possível carregar o PDF.',
                      })
                    })
                }}
              />
              <label htmlFor={fileInputId} className="file-picker-button">
                Importar PDF
              </label>
              <span className="file-picker-name">{form.pdfName || 'Nenhum PDF selecionado'}</span>
            </div>
          </div>

          <label>
            Patrimônio
            <input
              type="text"
              value={form.assetNumber}
              onChange={(event) => updateField('assetNumber', event.target.value)}
              required
              disabled={submitting}
            />
          </label>
          <label>
            Serial
            <input
              type="text"
              value={form.serial}
              onChange={(event) => updateField('serial', event.target.value)}
              required
              disabled={submitting}
            />
          </label>
          <label>
            Modelo
            <input
              type="text"
              value={form.model}
              onChange={(event) => updateField('model', event.target.value)}
              required
              disabled={submitting}
            />
          </label>
          <label>
            Fabricante
            <input
              type="text"
              value={form.manufacturer}
              onChange={(event) => updateField('manufacturer', event.target.value)}
              required
              disabled={submitting}
            />
          </label>
          <label>
            Classe de exatidão
            <input
              type="text"
              value={form.accuracyClass}
              onChange={(event) => updateField('accuracyClass', event.target.value)}
              required
              disabled={submitting}
            />
          </label>
          <label>
            Número do certificado
            <input
              type="text"
              value={form.certificateNumber}
              onChange={(event) => updateField('certificateNumber', event.target.value)}
              required
              disabled={submitting}
            />
          </label>
          <label>
            Validade do Certificado
            <input
              type="date"
              value={form.validUntil}
              onChange={(event) => updateField('validUntil', event.target.value)}
              required
              disabled={submitting}
            />
          </label>
          <fieldset className="radio-fieldset full-width">
            <legend>Tipo</legend>
            <div className="radio-group">
              {(['Padrão', 'Hipot'] as const).map((option) => (
                <label key={option} className="radio-option">
                  <input
                    type="radio"
                    name="certificate-type"
                    value={option}
                    checked={form.certificateType === option}
                    disabled={submitting}
                    onChange={() => updateField('certificateType', option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="agenda-form-actions full-width">
            <button type="button" className="secondary-button" disabled={submitting} onClick={resetForm}>
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? 'Salvando…' : 'Cadastrar certificado'}
            </button>
          </div>
        </form>
      ) : null}

      {showForm ? null : loading ? (
        <p className="entrada-panel-empty">Carregando certificados...</p>
      ) : certificates.length === 0 ? (
        <p className="entrada-panel-empty">Nenhum certificado cadastrado.</p>
      ) : (
        <div className="entrada-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Patrimônio</th>
                <th>Serial</th>
                <th>Modelo</th>
                <th>Fabricante</th>
                <th>Classe de exatidão</th>
                <th>Número do certificado</th>
                <th>Tipo</th>
                <th>Validade</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {certificates.map((certificate) => (
                <tr key={certificate.id}>
                  <td>{certificate.assetNumber}</td>
                  <td>{certificate.serial}</td>
                  <td>{certificate.model}</td>
                  <td>{certificate.manufacturer}</td>
                  <td>{certificate.accuracyClass}</td>
                  <td>{certificate.certificateNumber}</td>
                  <td>{certificate.certificateType}</td>
                  <td>{formatValidUntil(certificate.validUntil)}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary-button compact-button"
                      onClick={() => void openPdf(certificate)}
                    >
                      {certificate.pdfName || 'Abrir PDF'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
