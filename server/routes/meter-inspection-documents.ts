import type { Request, Response } from 'express'
import { query } from '../db.js'
import { writeAuditLog } from '../audit.js'

const MAX_FILE_BYTES = 10 * 1024 * 1024

type InspectionDocumentRow = {
  id: string
  meter_schedule_id: string
  file_name: string
  file_data: Buffer
  created_at: Date
  created_by_user_id: string | null
  created_by_registration: string | null
}

function decodeFileBase64(fileBase64: string): Buffer | null {
  const normalized = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64
  try {
    const buffer = Buffer.from(normalized, 'base64')
    if (!buffer.length || buffer.length > MAX_FILE_BYTES) return null
    return buffer
  } catch {
    return null
  }
}

export async function uploadInspectionDocument(req: Request, res: Response) {
  const meterScheduleId = typeof req.params.id === 'string' ? req.params.id : ''
  const { fileName, fileBase64 } = req.body as { fileName?: string; fileBase64?: string }

  if (!fileName?.trim() || !fileBase64?.trim()) {
    res.status(400).json({ error: 'Envie o documento de inspeção.' })
    return
  }

  const schedule = await query<{ id: string }>(
    `SELECT id FROM meter_schedules WHERE id = $1`,
    [meterScheduleId],
  )
  if (!schedule.rows[0]) {
    res.status(404).json({ error: 'Agendamento não encontrado.' })
    return
  }

  const fileBuffer = decodeFileBase64(fileBase64.trim())
  if (!fileBuffer) {
    res.status(400).json({ error: 'Arquivo inválido ou maior que 10 MB.' })
    return
  }

  const id = `inspdoc-${Date.now()}-${meterScheduleId}`

  const insert = await query<Omit<InspectionDocumentRow, 'created_by_registration'>>(
    `INSERT INTO meter_inspection_documents (id, meter_schedule_id, file_name, file_data, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (meter_schedule_id) DO UPDATE SET
       file_name = EXCLUDED.file_name,
       file_data = EXCLUDED.file_data,
       created_at = NOW(),
       created_by_user_id = EXCLUDED.created_by_user_id
     RETURNING id, meter_schedule_id, file_name, created_at, created_by_user_id`,
    [id, meterScheduleId, fileName.trim(), fileBuffer, req.user?.id ?? null],
  )

  const document = {
    id: insert.rows[0].id,
    meterScheduleId: insert.rows[0].meter_schedule_id,
    fileName: insert.rows[0].file_name,
    createdAt: insert.rows[0].created_at.toISOString(),
    createdByUserId: insert.rows[0].created_by_user_id,
    createdByRegistration: req.user?.registration ?? null,
  }

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'meter_inspection_document',
    entityId: document.id,
    summary: `Documento de inspeção anexado ao agendamento ${meterScheduleId}`,
    newData: document,
    metadata: { meterScheduleId },
  })

  res.status(201).json({ document })
}

export async function downloadInspectionDocument(req: Request, res: Response) {
  const meterScheduleId = typeof req.params.id === 'string' ? req.params.id : ''

  const result = await query<{ file_name: string; file_data: Buffer }>(
    `SELECT file_name, file_data FROM meter_inspection_documents WHERE meter_schedule_id = $1`,
    [meterScheduleId],
  )

  if (!result.rows[0]) {
    res.status(404).json({ error: 'Documento de inspeção não encontrado.' })
    return
  }

  const { file_name, file_data } = result.rows[0]
  const safeName = file_name.replace(/[^\w.\-() ]+/g, '_')

  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`)
  res.send(file_data)
}

export async function deleteInspectionDocument(req: Request, res: Response) {
  const meterScheduleId = typeof req.params.id === 'string' ? req.params.id : ''

  const existing = await query<{ id: string; file_name: string }>(
    `SELECT id, file_name FROM meter_inspection_documents WHERE meter_schedule_id = $1`,
    [meterScheduleId],
  )

  if (!existing.rows[0]) {
    res.status(404).json({ error: 'Documento de inspeção não encontrado.' })
    return
  }

  await query(`DELETE FROM meter_inspection_documents WHERE meter_schedule_id = $1`, [
    meterScheduleId,
  ])

  await writeAuditLog(req, {
    action: 'delete',
    entityType: 'meter_inspection_document',
    entityId: existing.rows[0].id,
    summary: `Documento de inspeção removido do agendamento ${meterScheduleId}`,
    metadata: { meterScheduleId },
  })

  res.json({ ok: true, meterScheduleId })
}

type InspectionPendenciaRow = {
  id: string
  meter: string
  installation: string
  csd: string
  scheduled_at: Date
  trail_step: string
  responsible_user_id: string | null
  responsible_name: string | null
  responsible_registration: string | null
  responsible_work_subtype: string | null
}

export async function listInspectionPendencias(_req: Request, res: Response) {
  const result = await query<InspectionPendenciaRow>(
    `SELECT ms.id, ms.meter, ms.installation, ms.csd, ms.scheduled_at, ms.trail_step,
            c.responsible_user_id,
            u.name AS responsible_name,
            u.registration AS responsible_registration,
            u.work_subtype AS responsible_work_subtype
     FROM meter_schedules ms
     LEFT JOIN csds c ON c.name = ms.csd
     LEFT JOIN users u ON u.id = c.responsible_user_id
     WHERE NOT EXISTS (
       SELECT 1 FROM meter_inspection_documents d WHERE d.meter_schedule_id = ms.id
     )
     ORDER BY ms.scheduled_at ASC`,
  )

  const pendencias = result.rows.map((row) => ({
    id: row.id,
    meter: row.meter,
    installation: row.installation,
    csd: row.csd,
    scheduledAt: row.scheduled_at.toISOString(),
    trailStep: row.trail_step,
    responsibleUserId: row.responsible_user_id,
    responsibleName: row.responsible_name,
    responsibleRegistration: row.responsible_registration,
    responsibleWorkSubtype: row.responsible_work_subtype,
  }))

  res.json({ pendencias, pendingCount: pendencias.length })
}
