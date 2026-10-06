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
  preventive_block_on: string | null
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
    preventiveBlockOn: dateOnly(row.preventive_block_on),
    pdfName: row.pdf_name || '',
    createdAt: row.created_at.toISOString(),
  }
}

function textField(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

const DUPLICATE_SERIAL_ERROR =
  'Este patrimônio/serial já possui cadastro. Substitua o certificado existente.'

async function findSerialOwner(serial: string, exceptId?: number) {
  const normalized = serial.trim().toLowerCase()
  if (!normalized) return null
  const result = await query<{ id: number }>(
    `SELECT id
     FROM standard_certificates
     WHERE (LOWER(TRIM(serial)) = $1 OR LOWER(TRIM(asset_number)) = $1)
       AND ($2::int IS NULL OR id <> $2)
     LIMIT 1`,
    [normalized, exceptId ?? null],
  )
  return result.rows[0]?.id ?? null
}

function readCertificateBody(body: Record<string, unknown> | undefined) {
  return {
    assetNumber: textField(body?.assetNumber),
    serial: textField(body?.serial),
    model: textField(body?.model),
    manufacturer: textField(body?.manufacturer),
    accuracyClass: textField(body?.accuracyClass),
    certificateNumber: textField(body?.certificateNumber),
    certificateType: textField(body?.certificateType),
    calibratedOn: textField(body?.calibratedOn),
    validUntil: textField(body?.validUntil),
    preventiveBlockOn: textField(body?.preventiveBlockOn),
    pdf: textField(body?.pdf),
    pdfName: textField(body?.pdfName) || 'certificado.pdf',
  }
}

function certificateFieldError(fields: ReturnType<typeof readCertificateBody>, requirePdf: boolean) {
  if (
    !fields.assetNumber ||
    !fields.serial ||
    !fields.model ||
    !fields.manufacturer ||
    !fields.accuracyClass ||
    !fields.certificateNumber
  ) {
    return 'Preencha todos os campos do certificado.'
  }
  if (!CERTIFICATE_TYPES.includes(fields.certificateType as (typeof CERTIFICATE_TYPES)[number])) {
    return 'Selecione o tipo Padrão ou Hipot.'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.calibratedOn)) {
    return 'Informe a data de calibração.'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.validUntil)) {
    return 'Informe a validade do certificado.'
  }
  if (fields.preventiveBlockOn && !/^\d{4}-\d{2}-\d{2}$/.test(fields.preventiveBlockOn)) {
    return 'Informe a data de bloqueio preventivo.'
  }
  if (requirePdf && (!fields.pdf.startsWith('data:application/pdf') || fields.pdf.length > MAX_PDF_CHARS)) {
    return 'Importe um PDF de até 15 MB.'
  }
  if (fields.pdf && (!fields.pdf.startsWith('data:application/pdf') || fields.pdf.length > MAX_PDF_CHARS)) {
    return 'Importe um PDF de até 15 MB.'
  }
  return ''
}

export async function listStandardCertificates(_req: Request, res: Response) {
  const result = await query<CertificateRow>(
    `SELECT id, asset_number, serial, model, manufacturer, accuracy_class,
            certificate_number, certificate_type, calibrated_on::text AS calibrated_on,
            valid_until::text AS valid_until, preventive_block_on::text AS preventive_block_on, pdf_name, created_at
     FROM standard_certificates
     ORDER BY created_at DESC, id DESC`,
  )
  res.json({ certificates: result.rows.map(mapCertificate) })
}

export async function createStandardCertificate(req: Request, res: Response) {
  const fields = readCertificateBody(req.body)
  const fieldError = certificateFieldError(fields, true)
  if (fieldError) {
    res.status(400).json({ error: fieldError })
    return
  }
  const {
    assetNumber,
    serial,
    model,
    manufacturer,
    accuracyClass,
    certificateNumber,
    certificateType,
    calibratedOn,
    validUntil,
    preventiveBlockOn,
    pdf,
    pdfName,
  } = fields

  if (await findSerialOwner(serial)) {
    res.status(409).json({ error: DUPLICATE_SERIAL_ERROR })
    return
  }

  const result = await query<CertificateRow>(
    `INSERT INTO standard_certificates (
       asset_number, serial, model, manufacturer, accuracy_class,
       certificate_number, certificate_type, calibrated_on, valid_until, preventive_block_on, pdf, pdf_name, created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10::date, $11, $12, $13)
     RETURNING id, asset_number, serial, model, manufacturer, accuracy_class,
               certificate_number, certificate_type, calibrated_on::text AS calibrated_on,
               valid_until::text AS valid_until, preventive_block_on::text AS preventive_block_on, pdf_name, created_at`,
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
      preventiveBlockOn || null,
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

export async function updateStandardCertificate(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Identificador inválido.' })
    return
  }

  const fields = readCertificateBody(req.body)
  const fieldError = certificateFieldError(fields, false)
  if (fieldError) {
    res.status(400).json({ error: fieldError })
    return
  }

  const existing = await query<{ id: number }>(
    `SELECT id FROM standard_certificates WHERE id = $1`,
    [id],
  )
  if (!existing.rows[0]) {
    res.status(404).json({ error: 'Certificado não encontrado.' })
    return
  }

  if (await findSerialOwner(fields.serial, id)) {
    res.status(409).json({ error: DUPLICATE_SERIAL_ERROR })
    return
  }

  const replacePdf = Boolean(fields.pdf)
  const result = await query<CertificateRow>(
    replacePdf
      ? `UPDATE standard_certificates
         SET asset_number = $2,
             serial = $3,
             model = $4,
             manufacturer = $5,
             accuracy_class = $6,
             certificate_number = $7,
             certificate_type = $8,
             calibrated_on = $9::date,
             valid_until = $10::date,
             preventive_block_on = $11::date,
             pdf = $12,
             pdf_name = $13
         WHERE id = $1
         RETURNING id, asset_number, serial, model, manufacturer, accuracy_class,
                   certificate_number, certificate_type, calibrated_on::text AS calibrated_on,
                   valid_until::text AS valid_until, preventive_block_on::text AS preventive_block_on, pdf_name, created_at`
      : `UPDATE standard_certificates
         SET asset_number = $2,
             serial = $3,
             model = $4,
             manufacturer = $5,
             accuracy_class = $6,
             certificate_number = $7,
             certificate_type = $8,
             calibrated_on = $9::date,
             valid_until = $10::date,
             preventive_block_on = $11::date
         WHERE id = $1
         RETURNING id, asset_number, serial, model, manufacturer, accuracy_class,
                   certificate_number, certificate_type, calibrated_on::text AS calibrated_on,
                   valid_until::text AS valid_until, preventive_block_on::text AS preventive_block_on, pdf_name, created_at`,
    replacePdf
      ? [
          id,
          fields.assetNumber,
          fields.serial,
          fields.model,
          fields.manufacturer,
          fields.accuracyClass,
          fields.certificateNumber,
          fields.certificateType,
          fields.calibratedOn,
          fields.validUntil,
          fields.preventiveBlockOn || null,
          fields.pdf,
          fields.pdfName,
        ]
      : [
          id,
          fields.assetNumber,
          fields.serial,
          fields.model,
          fields.manufacturer,
          fields.accuracyClass,
          fields.certificateNumber,
          fields.certificateType,
          fields.calibratedOn,
          fields.validUntil,
          fields.preventiveBlockOn || null,
        ],
  )

  const updated = mapCertificate(result.rows[0])
  await writeAuditLog(req, {
    action: 'update',
    entityType: 'standard_certificate',
    entityId: String(updated.id),
    summary: `Atualizou o certificado ${updated.certificateNumber}`,
    newData: { ...updated, pdf: replacePdf ? '[pdf anexado]' : '[pdf mantido]' },
  })
  res.json({ certificate: updated })
}

export async function replaceStandardCertificate(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Identificador inválido.' })
    return
  }

  const certificateNumber = textField(req.body?.certificateNumber)
  const calibratedOn = textField(req.body?.calibratedOn)
  const validUntil = textField(req.body?.validUntil)
  const pdf = textField(req.body?.pdf)
  const pdfName = textField(req.body?.pdfName) || 'certificado.pdf'

  if (!certificateNumber) {
    res.status(400).json({ error: 'Informe o número do certificado.' })
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

  const existing = await query<{ id: number }>(
    `SELECT id FROM standard_certificates WHERE id = $1`,
    [id],
  )
  if (!existing.rows[0]) {
    res.status(404).json({ error: 'Certificado não encontrado.' })
    return
  }

  const result = await query<CertificateRow>(
    `UPDATE standard_certificates
     SET certificate_number = $2,
         calibrated_on = $3::date,
         valid_until = $4::date,
         pdf = $5,
         pdf_name = $6
     WHERE id = $1
     RETURNING id, asset_number, serial, model, manufacturer, accuracy_class,
               certificate_number, certificate_type, calibrated_on::text AS calibrated_on,
               valid_until::text AS valid_until, preventive_block_on::text AS preventive_block_on, pdf_name, created_at`,
    [id, certificateNumber, calibratedOn, validUntil, pdf, pdfName],
  )

  const replaced = mapCertificate(result.rows[0])
  await writeAuditLog(req, {
    action: 'update',
    entityType: 'standard_certificate',
    entityId: String(replaced.id),
    summary: `Substituiu o certificado ${replaced.certificateNumber}`,
    newData: { ...replaced, pdf: '[pdf anexado]' },
  })
  res.json({ certificate: replaced })
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
            valid_until::text AS valid_until, preventive_block_on::text AS preventive_block_on, pdf_name, created_at
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
