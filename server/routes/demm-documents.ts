import type { Request, Response } from 'express'
import { query } from '../db.js'
import { writeAuditLog } from '../audit.js'

const MAX_PDF_BYTES = 15 * 1024 * 1024

type DemmDocumentRow = {
  id: string
  meter_schedule_id: string | null
  meter: string
  file_name: string
  file_data: Buffer
  created_at: Date
  created_by_user_id: string | null
  created_by_registration: string | null
}

function mapDemmDocument(row: DemmDocumentRow) {
  return {
    id: row.id,
    meterScheduleId: row.meter_schedule_id,
    meter: row.meter,
    fileName: row.file_name,
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
    createdByRegistration: row.created_by_registration,
  }
}

function decodePdfBase64(fileBase64: string): Buffer | null {
  const normalized = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64

  try {
    const buffer = Buffer.from(normalized, 'base64')
    if (!buffer.length) return null
    if (buffer.length > MAX_PDF_BYTES) return null
    if (buffer.subarray(0, 4).toString() !== '%PDF') return null
    return buffer
  } catch {
    return null
  }
}

export async function listDemmDocuments(_req: Request, res: Response) {
  const result = await query<Omit<DemmDocumentRow, 'file_data'>>(
    `SELECT d.id, d.meter_schedule_id, d.meter, d.file_name, d.created_at, d.created_by_user_id,
            u.registration AS created_by_registration
     FROM demm_documents d
     LEFT JOIN users u ON u.id = d.created_by_user_id
     ORDER BY d.created_at DESC`,
  )

  res.json({ documents: result.rows.map((row) => mapDemmDocument({ ...row, file_data: Buffer.alloc(0) })) })
}

export async function createDemmDocument(req: Request, res: Response) {
  const { meterScheduleId, fileName, fileBase64 } = req.body as {
    meterScheduleId?: string
    fileName?: string
    fileBase64?: string
  }

  if (!meterScheduleId?.trim()) {
    res.status(400).json({ error: 'Selecione o medidor para vincular a DEMM.' })
    return
  }

  if (!fileName?.trim() || !fileBase64?.trim()) {
    res.status(400).json({ error: 'Envie o arquivo PDF da DEMM.' })
    return
  }

  if (!fileName.trim().toLowerCase().endsWith('.pdf')) {
    res.status(400).json({ error: 'A DEMM deve ser um arquivo PDF.' })
    return
  }

  const fileBuffer = decodePdfBase64(fileBase64.trim())
  if (!fileBuffer) {
    res.status(400).json({ error: 'Arquivo PDF inválido ou maior que 15 MB.' })
    return
  }

  const schedule = await query<{ id: string; meter: string; trail_step: string }>(
    `SELECT id, meter, trail_step FROM meter_schedules WHERE id = $1`,
    [meterScheduleId.trim()],
  )

  if (!schedule.rows[0]) {
    res.status(404).json({ error: 'Medidor agendado não encontrado.' })
    return
  }

  const id = `demm-${Date.now()}-${schedule.rows[0].meter}`

  const insert = await query<Omit<DemmDocumentRow, 'created_by_registration'>>(
    `INSERT INTO demm_documents (id, meter_schedule_id, meter, file_name, file_data, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, meter_schedule_id, meter, file_name, file_data, created_at, created_by_user_id`,
    [
      id,
      schedule.rows[0].id,
      schedule.rows[0].meter,
      fileName.trim(),
      fileBuffer,
      req.user?.id ?? null,
    ],
  )

  const document = mapDemmDocument({
    ...insert.rows[0],
    created_by_registration: req.user?.registration ?? null,
  })

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'demm_document',
    entityId: document.id,
    summary: `DEMM do medidor ${document.meter}`,
    newData: document,
  })

  res.status(201).json({ document })
}

export async function downloadDemmDocument(req: Request, res: Response) {
  const { id } = req.params

  const result = await query<Pick<DemmDocumentRow, 'file_name' | 'file_data' | 'meter'>>(
    `SELECT file_name, file_data, meter FROM demm_documents WHERE id = $1`,
    [id],
  )

  if (!result.rows[0]) {
    res.status(404).json({ error: 'DEMM não encontrada.' })
    return
  }

  const { file_name, file_data, meter } = result.rows[0]
  const safeName = file_name.replace(/[^\w.\-() ]+/g, '_')

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="demm-${meter}-${safeName}"`)
  res.send(file_data)
}
