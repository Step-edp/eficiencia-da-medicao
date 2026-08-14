import type { Request, Response } from 'express'
import { query } from '../db.js'
import { writeAuditLog } from '../audit.js'
import {
  classifyInspectionDocument,
  extractInspectionPdfText,
  parseInspectionText,
  type InspectionDocumentType,
} from '../inspection-document-parser.js'

const MAX_FILE_BYTES = 10 * 1024 * 1024

type InspectionDocumentRow = {
  id: string
  meter_schedule_id: string
  doc_type: InspectionDocumentType
  file_name: string
  file_data: Buffer
  extracted_meter: string | null
  extracted_lacre: string | null
  blocked: boolean
  block_reason: string | null
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

function isAllRepeatedDigits(value: string): boolean {
  return /^(\d)\1+$/.test(value)
}

function isSequentialDigits(value: string): boolean {
  if (!/^\d+$/.test(value) || value.length < 4) return false
  let ascending = true
  let descending = true
  for (let i = 1; i < value.length; i += 1) {
    const diff = Number(value[i]) - Number(value[i - 1])
    if (diff !== 1) ascending = false
    if (diff !== -1) descending = false
  }
  return ascending || descending
}

type InspectionEvaluation = { blocked: boolean; reason: string | null }

function evaluateInspectionDocument(
  lacre: string | null,
  meterEncontrado: string | null,
  expectedMeter: string,
): InspectionEvaluation {
  if (!lacre) {
    return { blocked: true, reason: 'Lacre do invólucro não informado no documento.' }
  }
  if (isAllRepeatedDigits(lacre)) {
    return { blocked: true, reason: `Lacre com dígitos repetidos (${lacre}).` }
  }
  if (isSequentialDigits(lacre)) {
    return { blocked: true, reason: `Lacre com numeração sequencial (${lacre}).` }
  }
  if (!meterEncontrado) {
    return {
      blocked: true,
      reason: 'Número do medidor encontrado não informado no documento.',
    }
  }
  if (meterEncontrado !== expectedMeter) {
    return {
      blocked: true,
      reason: `Medidor encontrado no documento (${meterEncontrado}) diverge do medidor agendado (${expectedMeter}).`,
    }
  }
  return { blocked: false, reason: null }
}

async function loadDocTypePresence(meterScheduleId: string) {
  const result = await query<{ doc_type: InspectionDocumentType }>(
    `SELECT doc_type FROM meter_inspection_documents WHERE meter_schedule_id = $1`,
    [meterScheduleId],
  )
  const types = new Set(result.rows.map((row) => row.doc_type))
  const hasToi = types.has('toi') || types.has('ambos')
  const hasComunicado = types.has('comunicado') || types.has('ambos')
  return { hasToi, hasComunicado, complete: hasToi && hasComunicado }
}

export async function uploadInspectionDocument(req: Request, res: Response) {
  const meterScheduleId = typeof req.params.id === 'string' ? req.params.id : ''
  const { fileName, fileBase64 } = req.body as { fileName?: string; fileBase64?: string }

  if (!fileName?.trim() || !fileBase64?.trim()) {
    res.status(400).json({ error: 'Envie o documento de inspeção.' })
    return
  }

  const schedule = await query<{ id: string; meter: string }>(
    `SELECT id, meter FROM meter_schedules WHERE id = $1`,
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

  if (fileBuffer.subarray(0, 4).toString() !== '%PDF') {
    res.status(400).json({ error: 'Envie um arquivo PDF.' })
    return
  }

  let text: string
  try {
    text = await extractInspectionPdfText(fileBuffer)
  } catch (error) {
    console.error('Erro ao ler PDF do documento de inspeção:', error)
    res.status(400).json({ error: 'Não foi possível ler o conteúdo do PDF.' })
    return
  }

  const docType = classifyInspectionDocument(text)
  if (docType === 'desconhecido') {
    res.status(400).json({
      error:
        'Documento não reconhecido. Anexe o Termo de Ocorrência e Inspeção (TOI) e/ou o Comunicado de Substituição de Medidor.',
    })
    return
  }

  let evaluation: InspectionEvaluation = { blocked: false, reason: null }
  let extractedMeter: string | null = null
  let extractedLacre: string | null = null

  if (docType === 'toi' || docType === 'ambos') {
    const parsed = parseInspectionText(text)
    extractedMeter = parsed.meterEncontrado
    extractedLacre = parsed.lacre
    evaluation = evaluateInspectionDocument(parsed.lacre, parsed.meterEncontrado, schedule.rows[0].meter)
  }

  const id = `inspdoc-${Date.now()}-${meterScheduleId}-${docType}`

  const insert = await query<Omit<InspectionDocumentRow, 'created_by_registration'>>(
    `INSERT INTO meter_inspection_documents (
      id, meter_schedule_id, doc_type, file_name, file_data,
      extracted_meter, extracted_lacre, blocked, block_reason, created_by_user_id
    )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (meter_schedule_id, doc_type) DO UPDATE SET
       file_name = EXCLUDED.file_name,
       file_data = EXCLUDED.file_data,
       extracted_meter = EXCLUDED.extracted_meter,
       extracted_lacre = EXCLUDED.extracted_lacre,
       blocked = EXCLUDED.blocked,
       block_reason = EXCLUDED.block_reason,
       created_at = NOW(),
       created_by_user_id = EXCLUDED.created_by_user_id
     RETURNING id, meter_schedule_id, doc_type, file_name, extracted_meter, extracted_lacre,
               blocked, block_reason, created_at, created_by_user_id`,
    [
      id,
      meterScheduleId,
      docType,
      fileName.trim(),
      fileBuffer,
      extractedMeter,
      extractedLacre,
      evaluation.blocked,
      evaluation.reason,
      req.user?.id ?? null,
    ],
  )

  const presence = await loadDocTypePresence(meterScheduleId)

  const document = {
    id: insert.rows[0].id,
    meterScheduleId: insert.rows[0].meter_schedule_id,
    docType: insert.rows[0].doc_type,
    fileName: insert.rows[0].file_name,
    extractedMeter: insert.rows[0].extracted_meter,
    extractedLacre: insert.rows[0].extracted_lacre,
    blocked: insert.rows[0].blocked,
    blockReason: insert.rows[0].block_reason,
    createdAt: insert.rows[0].created_at.toISOString(),
    createdByUserId: insert.rows[0].created_by_user_id,
    createdByRegistration: req.user?.registration ?? null,
    complete: presence.complete,
    hasToi: presence.hasToi,
    hasComunicado: presence.hasComunicado,
  }

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'meter_inspection_document',
    entityId: document.id,
    summary: `Documento de inspeção (${docType}) anexado ao agendamento ${meterScheduleId}${document.blocked ? ' (bloqueado)' : ''}`,
    newData: document,
    metadata: { meterScheduleId },
  })

  res.status(201).json({ document })
}

export async function downloadInspectionDocument(req: Request, res: Response) {
  const meterScheduleId = typeof req.params.id === 'string' ? req.params.id : ''
  const docType = typeof req.params.docType === 'string' ? req.params.docType : ''

  const result = await query<{ file_name: string; file_data: Buffer }>(
    `SELECT file_name, file_data FROM meter_inspection_documents
     WHERE meter_schedule_id = $1 AND doc_type = $2`,
    [meterScheduleId, docType],
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
  const docType = typeof req.params.docType === 'string' ? req.params.docType : ''

  const existing = await query<{ id: string; file_name: string }>(
    `SELECT id, file_name FROM meter_inspection_documents
     WHERE meter_schedule_id = $1 AND doc_type = $2`,
    [meterScheduleId, docType],
  )

  if (!existing.rows[0]) {
    res.status(404).json({ error: 'Documento de inspeção não encontrado.' })
    return
  }

  await query(`DELETE FROM meter_inspection_documents WHERE meter_schedule_id = $1 AND doc_type = $2`, [
    meterScheduleId,
    docType,
  ])

  await writeAuditLog(req, {
    action: 'delete',
    entityType: 'meter_inspection_document',
    entityId: existing.rows[0].id,
    summary: `Documento de inspeção (${docType}) removido do agendamento ${meterScheduleId}`,
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
  has_toi: boolean
  has_comunicado: boolean
}

export async function listInspectionPendencias(_req: Request, res: Response) {
  const result = await query<InspectionPendenciaRow>(
    `SELECT * FROM (
       SELECT ms.id, ms.meter, ms.installation, ms.csd, ms.scheduled_at, ms.trail_step,
              c.responsible_user_id,
              u.name AS responsible_name,
              u.registration AS responsible_registration,
              u.work_subtype AS responsible_work_subtype,
              EXISTS (
                SELECT 1 FROM meter_inspection_documents d
                WHERE d.meter_schedule_id = ms.id AND d.doc_type IN ('toi', 'ambos')
              ) AS has_toi,
              EXISTS (
                SELECT 1 FROM meter_inspection_documents d
                WHERE d.meter_schedule_id = ms.id AND d.doc_type IN ('comunicado', 'ambos')
              ) AS has_comunicado
       FROM meter_schedules ms
       LEFT JOIN csds c ON c.name = ms.csd
       LEFT JOIN users u ON u.id = c.responsible_user_id
     ) t
     WHERE NOT (has_toi AND has_comunicado)
     ORDER BY scheduled_at ASC`,
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
    missingToi: !row.has_toi,
    missingComunicado: !row.has_comunicado,
  }))

  res.json({ pendencias, pendingCount: pendencias.length })
}
