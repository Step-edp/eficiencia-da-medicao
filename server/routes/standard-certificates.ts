import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { writeAuditLog } from '../audit.js'

const CERTIFICATE_TYPES = ['Padrão', 'Hipot'] as const

const MAX_PDF_CHARS = 20_000_000

type CertificateRow = {
  id: number
  asset_number: string
  serial: string
  model: string
  manufacturer: string
  accuracy_class: string
  certificate_number: string
  certificate_type: string
  calibrated_on: string | null
  valid_until: string
  pdf_name: string
  created_at: Date
}

function dateOnly(value: string | Date | null | undefined) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

function mapCertificate(row: CertificateRow) {
  return {
    id: row.id,
    assetNumber: row.asset_number,
    serial: row.serial,
    model: row.model,
    manufacturer: row.manufacturer,
    accuracyClass: row.accuracy_class,
    certificateNumber: row.certificate_number,
    certificateType: row.certificate_type,
    calibratedOn: dateOnly(row.calibrated_on),
    validUntil: dateOnly(row.valid_until),
    pdfName: row.pdf_name || '',
    createdAt: row.created_at.toISOString(),
  }
}

function textField(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function listStandardCertificates(_req: Request, res: Response) {
  const result = await query<CertificateRow>(
    `SELECT id, asset_number, serial, model, manufacturer, accuracy_class,
            certificate_number, certificate_type, calibrated_on::text AS calibrated_on,
            valid_until::text AS valid_until, pdf_name, created_at
     FROM standard_certificates
     ORDER BY created_at DESC, id DESC`,
  )
  res.json({ certificates: result.rows.map(mapCertificate) })
}

export async function createStandardCertificate(req: Request, res: Response) {
  const assetNumber = textField(req.body?.assetNumber)
  const serial = textField(req.body?.serial)
  const model = textField(req.body?.model)
  const manufacturer = textField(req.body?.manufacturer)
  const accuracyClass = textField(req.body?.accuracyClass)
  const certificateNumber = textField(req.body?.certificateNumber)
  const certificateType = textField(req.body?.certificateType)
  const calibratedOn = textField(req.body?.calibratedOn)
  const validUntil = textField(req.body?.validUntil)
  const pdf = textField(req.body?.pdf)
  const pdfName = textField(req.body?.pdfName) || 'certificado.pdf'

  if (!assetNumber || !serial || !model || !manufacturer || !accuracyClass || !certificateNumber) {
    res.status(400).json({ error: 'Preencha todos os campos do certificado.' })
    return
  }

  if (!CERTIFICATE_TYPES.includes(certificateType as (typeof CERTIFICATE_TYPES)[number])) {
    res.status(400).json({ error: 'Selecione o tipo Padrão ou Hipot.' })
    return
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(calibratedOn)) {
    res.status(400).json({ error: 'Informe a data de calibração.' })
    return
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    res.status(400).json({ error: 'Informe a validade do certificado.' })
    return
  }

  if (!pdf.startsWith('data:application/pdf') || pdf.length > MAX_PDF_CHARS) {
    res.status(400).json({ error: 'Importe um PDF de até 15 MB.' })
    return
  }

  const result = await query<CertificateRow>(
    `INSERT INTO standard_certificates (
       asset_number, serial, model, manufacturer, accuracy_class,
       certificate_number, certificate_type, calibrated_on, valid_until, pdf, pdf_name, created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10, $11, $12)
     RETURNING id, asset_number, serial, model, manufacturer, accuracy_class,
               certificate_number, certificate_type, calibrated_on::text AS calibrated_on,
               valid_until::text AS valid_until, pdf_name, created_at`,
    [
      assetNumber,
      serial,
      model,
      manufacturer,
      accuracyClass,
      certificateNumber,
      certificateType,
      calibratedOn,
      validUntil,
      pdf,
      pdfName,
      req.user?.id ?? null,
    ],
  )

  const created = mapCertificate(result.rows[0])
  await writeAuditLog(req, {
    action: 'create',
    entityType: 'standard_certificate',
    entityId: String(created.id),
    summary: `Certificado padrão ${created.certificateNumber}`,
    newData: { ...created, pdf: '[pdf anexado]' },
  })

  res.status(201).json({ certificate: created })
}

export async function getStandardCertificatePdf(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Identificador inválido.' })
    return
  }

  const result = await query<{ pdf: string; pdf_name: string }>(
    `SELECT pdf, pdf_name FROM standard_certificates WHERE id = $1`,
    [id],
  )
  const row = result.rows[0]
  if (!row?.pdf) {
    res.status(404).json({ error: 'PDF do certificado não encontrado.' })
    return
  }

  res.json({ pdf: row.pdf, pdfName: row.pdf_name || 'certificado.pdf' })
}

export async function deleteStandardCertificate(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Identificador inválido.' })
    return
  }

  const existing = await query<CertificateRow>(
    `SELECT id, asset_number, serial, model, manufacturer, accuracy_class,
            certificate_number, certificate_type, calibrated_on::text AS calibrated_on,
            valid_until::text AS valid_until, pdf_name, created_at
     FROM standard_certificates
     WHERE id = $1`,
    [id],
  )
  const row = existing.rows[0]
  if (!row) {
    res.status(404).json({ error: 'Certificado não encontrado.' })
    return
  }

  await query(`DELETE FROM standard_certificates WHERE id = $1`, [id])
  const removed = mapCertificate(row)
  await writeAuditLog(req, {
    action: 'delete',
    entityType: 'standard_certificate',
    entityId: String(id),
    summary: `Excluiu o certificado ${removed.certificateNumber}.`,
    oldData: removed,
  })
  res.json({ ok: true, id })
}

export const standardCertificateRoutes = {
  list: [requireAuth, listStandardCertificates],
  pdf: [requireAuth, getStandardCertificatePdf],
}
