import { FormEvent, useCallback, useEffect, useId, useMemo, useState } from 'react'
import { api, ApiError, type StandardCertificateRecord } from './api'
import { LoginFeedback } from './LoginFeedback'
import { readAttachmentAsDataUrl } from './readAttachmentAsDataUrl'

function pdfBlobUrl(dataUrl: string) {
  const [header, base64 = ''] = dataUrl.split(',')
  const mime = header.match(/data:([^;]+)/)?.[1] || 'application/pdf'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}

function ReplaceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20 7H8M16 3l4 4-4 4M4 17h12M8 21l-4-4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20zM14.5 5l4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M2.5 12S6.5 6.5 12 6.5 21.5 12 21.5 12 17.5 17.5 12 17.5 2.5 12 2.5 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 4v10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8 11.5 12 15.5 16 11.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 19h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

function certificateStatus(validUntil: string) {
  const day = validUntil.slice(0, 10)
  if (!day) return null
  return day < todayInSaoPaulo() ? 'Vencido' : 'Válido'
}

function yearsBetween(start: string, end: string) {
  const startDay = start.slice(0, 10)
  const endDay = end.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay) || !/^\d{4}-\d{2}-\d{2}$/.test(endDay)) return '—'
  const [startYear, startMonth, startDate] = startDay.split('-').map(Number)
  const [endYear, endMonth, endDate] = endDay.split('-').map(Number)
  let years = endYear - startYear
  let months = endMonth - startMonth
  if (endDate < startDate) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }
  if (years < 0 || months < 0) return '—'
  const yearLabel = years === 1 ? '1 ano' : `${years} anos`
  if (months === 0) return yearLabel
  const monthLabel = months === 1 ? '1 mês' : `${months} meses`
  if (years === 0) return monthLabel
  return `${yearLabel} e ${monthLabel}`
}

function formatValidUntil(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

function subtractMonths(isoDate: string, months: number) {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day || months < 1) return ''
  const shifted = new Date(Date.UTC(year, month - 1 - months, 1))
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate()
  const result = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), Math.min(day, lastDay)))
  return result.toISOString().slice(0, 10)
}

function preventiveBlockDate(validUntil: string, months: number | null) {
  if (!months || !validUntil) return ''
  return subtractMonths(validUntil, months)
}

const PREVENTIVE_BLOCK_MONTHS = Array.from({ length: 36 }, (_, index) => index + 1)

const emptyForm = {
  assetNumber: '',
  serial: '',
  model: '',
  manufacturer: '',
  accuracyClass: '',
  certificateNumber: '',
  calibratedOn: '',
  validUntil: '',
  preventiveBlockMonths: '',
  certificateType: '' as '' | 'Padrão' | 'Hipot',
  pdf: '',
  pdfName: '',
}

const emptyReplaceForm = {
  certificateNumber: '',
  calibratedOn: '',
  validUntil: '',
  pdf: '',
  pdfName: '',
}

export function CertificadosPadroesPanel({
  readOnly = false,
  isAdmin = false,
}: {
  readOnly?: boolean
  isAdmin?: boolean
}) {
  const fileInputId = useId()
  const replaceFileInputId = useId()
  const [certificates, setCertificates] = useState<StandardCertificateRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [replacingId, setReplacingId] = useState<number | null>(null)
  const [replaceForm, setReplaceForm] = useState(emptyReplaceForm)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [searchFilter, setSearchFilter] = useState('')
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

  const filteredCertificates = useMemo(() => {
    const query = searchFilter.trim().toLocaleLowerCase('pt-BR')
    if (!query) return certificates
    return certificates.filter((certificate) => {
      const status = certificateStatus(certificate.validUntil) ?? ''
      const years = certificate.calibratedOn
        ? yearsBetween(certificate.calibratedOn, certificate.validUntil)
        : ''
      const haystack = [
        certificate.assetNumber,
        certificate.serial,
        certificate.model,
        certificate.manufacturer,
        certificate.accuracyClass,
        certificate.certificateNumber,
        certificate.certificateType,
        formatValidUntil(certificate.calibratedOn),
        formatValidUntil(certificate.validUntil),
        formatValidUntil(preventiveBlockDate(certificate.validUntil, certificate.preventiveBlockMonths)),
        certificate.preventiveBlockMonths
          ? `${certificate.preventiveBlockMonths} meses`
          : '',
        years,
        status,
      ]
        .join(' ')
        .toLocaleLowerCase('pt-BR')
      return haystack.includes(query)
    })
  }, [certificates, searchFilter])

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(false)
    setReplacingId(null)
    setReplaceForm({
      certificateNumber: '',
      calibratedOn: '',
      validUntil: '',
      pdf: '',
      pdfName: '',
    })
  }

  const startReplace = (certificate: StandardCertificateRecord) => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setReplacingId(certificate.id)
    setReplaceForm({
      certificateNumber: '',
      calibratedOn: '',
      validUntil: '',
      pdf: '',
      pdfName: '',
    })
    setFeedback(null)
  }

  const startEdit = (certificate: StandardCertificateRecord) => {
    setEditingId(certificate.id)
    setForm({
      assetNumber: certificate.assetNumber || certificate.serial,
      serial: certificate.assetNumber || certificate.serial,
      model: certificate.model,
      manufacturer: certificate.manufacturer,
      accuracyClass: certificate.accuracyClass,
      certificateNumber: certificate.certificateNumber,
      calibratedOn: certificate.calibratedOn.slice(0, 10),
      validUntil: certificate.validUntil.slice(0, 10),
      preventiveBlockMonths: certificate.preventiveBlockMonths
        ? String(certificate.preventiveBlockMonths)
        : '',
      certificateType: certificate.certificateType,
      pdf: '',
      pdfName: certificate.pdfName,
    })
    setReplacingId(null)
    setReplaceForm(emptyReplaceForm)
    setShowForm(true)
    setFeedback(null)
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
      !form.calibratedOn ||
      !form.validUntil ||
      (form.certificateType !== 'Padrão' && form.certificateType !== 'Hipot') ||
      (!editingId && !form.pdf)
    ) {
      setFeedback({
        type: 'error',
        message: 'Importe o PDF e preencha todos os campos.',
      })
      return
    }

    const serial = form.assetNumber.trim()
    const serialTaken = certificates.some(
      (item) =>
        item.id !== editingId &&
        (item.serial.trim().toLowerCase() === serial.toLowerCase() ||
          item.assetNumber.trim().toLowerCase() === serial.toLowerCase()),
    )
    if (serialTaken) {
      setFeedback({
        type: 'error',
        message: 'Este patrimônio/serial já possui cadastro. Substitua o certificado existente.',
      })
      return
    }

    const payload = {
      assetNumber: serial,
      serial,
      model: form.model.trim(),
      manufacturer: form.manufacturer.trim(),
      accuracyClass: form.accuracyClass.trim(),
      certificateNumber: form.certificateNumber.trim(),
      certificateType: form.certificateType,
      calibratedOn: form.calibratedOn,
      validUntil: form.validUntil,
      preventiveBlockMonths: form.preventiveBlockMonths ? Number(form.preventiveBlockMonths) : null,
      ...(form.pdf ? { pdf: form.pdf, pdfName: form.pdfName || 'certificado.pdf' } : {}),
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      const { certificate } = editingId
        ? await api.updateStandardCertificate(editingId, payload)
        : await api.createStandardCertificate({
            ...payload,
            pdf: form.pdf,
            pdfName: form.pdfName || 'certificado.pdf',
          })
      setCertificates((current) =>
        editingId
          ? current.map((item) => (item.id === certificate.id ? certificate : item))
          : [certificate, ...current],
      )
      setFeedback({
        type: 'success',
        message: editingId
          ? `Certificado ${certificate.certificateNumber} atualizado.`
          : `Certificado ${certificate.certificateNumber} cadastrado.`,
      })
      resetForm()
    } catch (error) {
      setFeedback({
        type: 'error',
            message:
          error instanceof ApiError
            ? error.message
            : editingId
              ? 'Não foi possível atualizar o certificado.'
              : 'Não foi possível cadastrar o certificado.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleReplace = async (event: FormEvent) => {
    event.preventDefault()
    if (!replacingId) return
    if (!replaceForm.pdf || !replaceForm.calibratedOn || !replaceForm.validUntil || !replaceForm.certificateNumber.trim()) {
      setFeedback({
        type: 'error',
        message: 'Importe o PDF e preencha número, data de calibração e validade.',
      })
      return
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      const { certificate } = await api.replaceStandardCertificate(replacingId, {
        certificateNumber: replaceForm.certificateNumber.trim(),
        calibratedOn: replaceForm.calibratedOn,
        validUntil: replaceForm.validUntil,
        pdf: replaceForm.pdf,
        pdfName: replaceForm.pdfName || 'certificado.pdf',
      })
      setCertificates((current) =>
        current.map((item) => (item.id === certificate.id ? certificate : item)),
      )
      setFeedback({
        type: 'success',
        message: `Certificado ${certificate.certificateNumber} substituído.`,
      })
      resetForm()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError ? error.message : 'Não foi possível substituir o certificado.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const loadPdf = async (certificate: StandardCertificateRecord) => {
    const { pdf, pdfName } = await api.getStandardCertificatePdf(certificate.id)
    return { pdf, pdfName: pdfName || 'certificado.pdf' }
  }

  const deleteCertificate = async (certificate: StandardCertificateRecord) => {
    const confirmed = window.confirm(
      `Excluir o certificado ${certificate.certificateNumber}?`,
    )
    if (!confirmed) return

    setDeletingId(certificate.id)
    setFeedback(null)
    try {
      await api.deleteStandardCertificate(certificate.id)
      setCertificates((current) => current.filter((item) => item.id !== certificate.id))
      setFeedback({
        type: 'success',
        message: `Certificado ${certificate.certificateNumber} excluído.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError ? error.message : 'Não foi possível excluir o certificado.',
      })
    } finally {
      setDeletingId(null)
    }
  }

  const viewPdf = async (certificate: StandardCertificateRecord) => {
    try {
      const { pdf } = await loadPdf(certificate)
      const url = pdfBlobUrl(pdf)
      window.open(url, '_blank', 'noopener')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof ApiError ? error.message : 'Não foi possível visualizar o PDF.',
      })
    }
  }

  const downloadPdf = async (certificate: StandardCertificateRecord) => {
    try {
      const { pdf, pdfName } = await loadPdf(certificate)
      const url = pdfBlobUrl(pdf)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = pdfName
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof ApiError ? error.message : 'Não foi possível baixar o PDF.',
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
              if (showForm || replacingId) {
                resetForm()
                return
              }
              setEditingId(null)
              setReplacingId(null)
              setForm(emptyForm)
              setShowForm(true)
              setFeedback(null)
            }}
          >
            {showForm || replacingId ? 'Fechar formulário' : 'Cadastrar Certificado'}
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
                key={editingId ?? 'new'}
                className="file-picker-input"
                type="file"
                accept="application/pdf,.pdf"
                disabled={submitting}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) {
                    const currentName = editingId
                      ? certificates.find((item) => item.id === editingId)?.pdfName || ''
                      : ''
                    setForm((current) => ({ ...current, pdf: '', pdfName: currentName }))
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
              <span className="file-picker-name">
                {form.pdf
                  ? form.pdfName
                  : editingId
                    ? form.pdfName || 'PDF atual mantido'
                    : 'Nenhum PDF selecionado'}
              </span>
            </div>
          </div>

          <label>
            Patrimônio • Serial
            <input
              type="text"
              value={form.assetNumber}
              onChange={(event) => {
                const value = event.target.value
                setForm((current) => ({ ...current, assetNumber: value, serial: value }))
              }}
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
            Data de Calibração
            <input
              type="date"
              value={form.calibratedOn}
              onChange={(event) => updateField('calibratedOn', event.target.value)}
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
          <label>
            Data de bloqueio preventivo
            <select
              value={form.preventiveBlockMonths}
              onChange={(event) => updateField('preventiveBlockMonths', event.target.value)}
              disabled={submitting}
            >
              <option value="">Selecione os meses</option>
              {PREVENTIVE_BLOCK_MONTHS.map((months) => (
                <option key={months} value={String(months)}>
                  {months === 1 ? '1 mês antes do vencimento' : `${months} meses antes do vencimento`}
                </option>
              ))}
            </select>
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
              {submitting ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Cadastrar certificado'}
            </button>
          </div>
        </form>
      ) : null}

      {!readOnly && replacingId ? (
        <form className="material-form-grid apresentacao-form" onSubmit={(event) => void handleReplace(event)}>
          <p className="full-width">
            Substituir certificado do patrimônio{' '}
            <strong>
              {certificates.find((item) => item.id === replacingId)?.assetNumber ||
                certificates.find((item) => item.id === replacingId)?.serial}
            </strong>
            . Os demais dados do equipamento permanecem.
          </p>
          <div className="full-width">
            <span className="agenda-attachment-label">PDF do certificado</span>
            <div className="file-picker">
              <input
                id={replaceFileInputId}
                key={replacingId}
                className="file-picker-input"
                type="file"
                accept="application/pdf,.pdf"
                disabled={submitting}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) {
                    setReplaceForm((current) => ({ ...current, pdf: '', pdfName: '' }))
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
                      setReplaceForm((current) => ({ ...current, pdf, pdfName: file.name }))
                      setFeedback(null)
                    })
                    .catch((error: unknown) => {
                      setReplaceForm((current) => ({ ...current, pdf: '', pdfName: '' }))
                      event.target.value = ''
                      setFeedback({
                        type: 'error',
                        message:
                          error instanceof Error ? error.message : 'Não foi possível carregar o PDF.',
                      })
                    })
                }}
              />
              <label htmlFor={replaceFileInputId} className="file-picker-button">
                Importar PDF
              </label>
              <span className="file-picker-name">{replaceForm.pdfName || 'Nenhum PDF selecionado'}</span>
            </div>
          </div>
          <label>
            Número do certificado
            <input
              type="text"
              value={replaceForm.certificateNumber}
              onChange={(event) =>
                setReplaceForm((current) => ({ ...current, certificateNumber: event.target.value }))
              }
              required
              disabled={submitting}
            />
          </label>
          <label>
            Data de Calibração
            <input
              type="date"
              value={replaceForm.calibratedOn}
              onChange={(event) =>
                setReplaceForm((current) => ({ ...current, calibratedOn: event.target.value }))
              }
              required
              disabled={submitting}
            />
          </label>
          <label>
            Validade do Certificado
            <input
              type="date"
              value={replaceForm.validUntil}
              onChange={(event) =>
                setReplaceForm((current) => ({ ...current, validUntil: event.target.value }))
              }
              required
              disabled={submitting}
            />
          </label>
          <div className="agenda-form-actions full-width">
            <button type="button" className="secondary-button" disabled={submitting} onClick={resetForm}>
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? 'Salvando…' : 'Substituir certificado'}
            </button>
          </div>
        </form>
      ) : null}

      {showForm ? null : loading ? (
        <p className="entrada-panel-empty">Carregando certificados...</p>
      ) : certificates.length === 0 ? (
        <p className="entrada-panel-empty">Nenhum certificado cadastrado.</p>
      ) : (
        <>
        <label className="certificate-search">
          Buscar
          <input
            type="search"
            value={searchFilter}
            onChange={(event) => setSearchFilter(event.target.value)}
            placeholder="Patrimônio, modelo, fabricante, número, tipo ou status"
          />
        </label>
        {filteredCertificates.length === 0 ? (
          <p className="entrada-panel-empty">Nenhum certificado encontrado com esses filtros.</p>
        ) : (
        <div className="entrada-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Patrimônio • Serial</th>
                <th>Modelo</th>
                <th>Fabricante</th>
                <th>Classe de exatidão</th>
                <th>Número do certificado</th>
                <th>Tipo</th>
                <th>Data de Calibração</th>
                <th>Validade</th>
                <th aria-label="Prazo em anos" />
                <th>Data de bloqueio preventivo</th>
                <th>Status</th>
                <th aria-label="PDF" />
              </tr>
            </thead>
            <tbody>
              {filteredCertificates.map((certificate) => (
                <tr key={certificate.id}>
                  <td>{certificate.assetNumber || certificate.serial}</td>
                  <td>{certificate.model}</td>
                  <td>{certificate.manufacturer}</td>
                  <td>{certificate.accuracyClass}</td>
                  <td>{certificate.certificateNumber}</td>
                  <td>{certificate.certificateType}</td>
                  <td>{certificate.calibratedOn ? formatValidUntil(certificate.calibratedOn) : '—'}</td>
                  <td>{formatValidUntil(certificate.validUntil)}</td>
                  <td className="certificate-years">
                    {certificate.calibratedOn
                      ? yearsBetween(certificate.calibratedOn, certificate.validUntil)
                      : '—'}
                  </td>
                  <td className="certificate-years">
                    {preventiveBlockDate(certificate.validUntil, certificate.preventiveBlockMonths)
                      ? formatValidUntil(
                          preventiveBlockDate(certificate.validUntil, certificate.preventiveBlockMonths),
                        )
                      : '—'}
                  </td>
                  <td>
                    {certificateStatus(certificate.validUntil) === 'Vencido' ? (
                      <span className="certificate-status-badge is-expired">Vencido</span>
                    ) : (
                      <span className="certificate-status-badge is-valid">Válido</span>
                    )}
                  </td>
                  <td>
                    <div className="table-row-actions">
                      {readOnly ? null : (
                        <button
                          type="button"
                          className="csds-icon-button"
                          onClick={() => startEdit(certificate)}
                          aria-label={`Editar certificado ${certificate.certificateNumber}`}
                          title="Editar"
                        >
                          <PencilIcon />
                        </button>
                      )}
                      <button
                        type="button"
                        className="csds-icon-button"
                        onClick={() => void viewPdf(certificate)}
                        aria-label={`Visualizar ${certificate.pdfName || 'PDF'}`}
                        title="Visualizar"
                      >
                        <EyeIcon />
                      </button>
                      <button
                        type="button"
                        className="csds-icon-button"
                        onClick={() => void downloadPdf(certificate)}
                        aria-label={`Baixar ${certificate.pdfName || 'PDF'}`}
                        title="Baixar"
                      >
                        <DownloadIcon />
                      </button>
                      {readOnly ? null : (
                        <button
                          type="button"
                          className="csds-icon-button"
                          onClick={() => startReplace(certificate)}
                          aria-label={`Substituir certificado ${certificate.certificateNumber}`}
                          title="Substituir certificado"
                        >
                          <ReplaceIcon />
                        </button>
                      )}
                      {isAdmin ? (
                        <button
                          type="button"
                          className="csds-icon-button is-danger"
                          onClick={() => void deleteCertificate(certificate)}
                          disabled={deletingId === certificate.id}
                          aria-label={`Excluir certificado ${certificate.certificateNumber}`}
                          title="Excluir"
                        >
                          <TrashIcon />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        </>
      )}
    </div>
  )
}
