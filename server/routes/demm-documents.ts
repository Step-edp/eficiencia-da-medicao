import type { Request, Response } from 'express'
import { query } from '../db.js'
import { writeAuditLog } from '../audit.js'
import { parseDemmPdf } from '../demm-pdf-parser.js'
import { analyzeDemmMeters, type DemmMeterAnalysis } from '../demm-meter-analysis.js'
import { validateDemmUploadMeters } from '../demm-upload-validation.js'
import {
  ENSAIAR_TRAIL_STEP,
  getNextStatusAfterEntrada,
} from '../lab-trail-status.js'

const MAX_PDF_BYTES = 15 * 1024 * 1024

type DemmDocumentRow = {
  id: string
  meter_schedule_id: string | null
  meter: string
  file_name: string
  file_data: Buffer
  extracted_meters: DemmMeterAnalysis[] | null
  document_number: string | null
  emission_date: string | null
  csd_id: string | null
  csd_name: string | null
  created_at: Date
  created_by_user_id: string | null
  created_by_registration: string | null
}

function mapDemmDocument(row: DemmDocumentRow) {
  const extractedMeters = row.extracted_meters ?? []
  return {
    id: row.id,
    meterScheduleId: row.meter_schedule_id,
    meter: row.meter,
    fileName: row.file_name,
    documentNumber: row.document_number,
    emissionDate: row.emission_date,
    csdId: row.csd_id,
    csdName: row.csd_name,
    extractedMeters,
    meterCount: extractedMeters.length,
    scheduledCount: extractedMeters.filter((item) => item.scheduled).length,
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

async function parseAndAnalyzeDemm(fileBuffer: Buffer) {
  const parsed = await parseDemmPdf(fileBuffer)
  const extractedMeters = await analyzeDemmMeters(parsed.meters)
  return {
    extractedMeters,
    documentNumber: parsed.documentNumber,
    emissionDate: parsed.emissionDate,
  }
}

export async function listDemmDocuments(_req: Request, res: Response) {
  const result = await query<Omit<DemmDocumentRow, 'file_data'> & { created_by_registration: string | null }>(
    `SELECT d.id, d.meter_schedule_id, d.meter, d.file_name, d.extracted_meters,
            d.document_number, d.emission_date, d.csd_id, c.name AS csd_name, d.created_at,
            d.created_by_user_id, u.registration AS created_by_registration
     FROM demm_documents d
     LEFT JOIN users u ON u.id = d.created_by_user_id
     LEFT JOIN csds c ON c.id = d.csd_id
     ORDER BY d.created_at DESC`,
  )

  res.json({
    documents: result.rows.map((row) =>
      mapDemmDocument({ ...row, file_data: Buffer.alloc(0) }),
    ),
  })
}

export async function getDemmMetersBase(_req: Request, res: Response) {
  const result = await query<Pick<DemmDocumentRow, 'id' | 'file_name' | 'extracted_meters'>>(
    `SELECT id, file_name, extracted_meters FROM demm_documents ORDER BY created_at DESC`,
  )

  const meterSources = new Map<string, string[]>()

  for (const row of result.rows) {
    for (const item of row.extracted_meters ?? []) {
      const sources = meterSources.get(item.meter) ?? []
      if (!sources.includes(row.file_name)) {
        sources.push(row.file_name)
      }
      meterSources.set(item.meter, sources)
    }
  }

  const uniqueMeters = [...meterSources.keys()]
  const analyzed = await analyzeDemmMeters(uniqueMeters)

  const meters = analyzed.map((item) => ({
    ...item,
    sourceFiles: meterSources.get(item.meter) ?? [],
  }))

  res.json({
    meters,
    total: meters.length,
    scheduledCount: meters.filter((item) => item.scheduled).length,
  })
}

export async function createDemmDocument(req: Request, res: Response) {
  const { meterScheduleId, fileName, fileBase64, csdId } = req.body as {
    meterScheduleId?: string
    fileName?: string
    fileBase64?: string
    csdId?: string
  }

  if (!fileName?.trim() || !fileBase64?.trim()) {
    res.status(400).json({ error: 'Envie o arquivo PDF da DEMM.' })
    return
  }

  const normalizedCsdId = csdId?.trim() ?? ''
  if (!normalizedCsdId) {
    res.status(400).json({ error: 'Selecione o CSD dessa DEMM.' })
    return
  }

  const csd = await query<{ id: string; name: string }>(
    `SELECT id, name FROM csds WHERE id = $1`,
    [normalizedCsdId],
  )
  if (!csd.rows[0]) {
    res.status(404).json({ error: 'CSD não encontrado.' })
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

  let linkedMeter = 'DEMM'
  let linkedScheduleId: string | null = null

  if (meterScheduleId?.trim()) {
    const schedule = await query<{ id: string; meter: string }>(
      `SELECT id, meter FROM meter_schedules WHERE id = $1`,
      [meterScheduleId.trim()],
    )

    if (!schedule.rows[0]) {
      res.status(404).json({ error: 'Medidor agendado não encontrado.' })
      return
    }

    linkedMeter = schedule.rows[0].meter
    linkedScheduleId = schedule.rows[0].id
  }

  let extractedMeters: DemmMeterAnalysis[] = []
  let documentNumber: string | null = null
  let emissionDate: string | null = null

  try {
    const parsed = await parseAndAnalyzeDemm(fileBuffer)
    extractedMeters = parsed.extractedMeters
    documentNumber = parsed.documentNumber
    emissionDate = parsed.emissionDate
  } catch (error) {
    console.error('Erro ao ler PDF da DEMM:', error)
    res.status(400).json({ error: 'Não foi possível ler o conteúdo do PDF da DEMM.' })
    return
  }

  const validation = await validateDemmUploadMeters(extractedMeters.map((item) => item.meter))
  if (!validation.ok) {
    res.status(409).json({
      error: validation.error,
      conflicts: validation.conflicts,
    })
    return
  }

  const id = `demm-${Date.now()}-${linkedMeter}`

  const insert = await query<Omit<DemmDocumentRow, 'created_by_registration' | 'csd_name'>>(
    `INSERT INTO demm_documents (
      id, meter_schedule_id, meter, file_name, file_data, extracted_meters,
      document_number, emission_date, csd_id, created_by_user_id
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
    RETURNING id, meter_schedule_id, meter, file_name, file_data, extracted_meters,
              document_number, emission_date, csd_id, created_at, created_by_user_id`,
    [
      id,
      linkedScheduleId,
      linkedMeter,
      fileName.trim(),
      fileBuffer,
      JSON.stringify(extractedMeters),
      documentNumber,
      emissionDate,
      csd.rows[0].id,
      req.user?.id ?? null,
    ],
  )

  const document = mapDemmDocument({
    ...insert.rows[0],
    csd_name: csd.rows[0].name,
    created_by_registration: req.user?.registration ?? null,
  })

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'demm_document',
    entityId: document.id,
    summary: `DEMM com ${extractedMeters.length} medidor(es) identificado(s)`,
    newData: {
      ...document,
      scheduledCount: extractedMeters.filter((item) => item.scheduled).length,
    },
  })

  const meterNumbers = extractedMeters.map((item) => item.meter)
  if (meterNumbers.length) {
    await query(
      `UPDATE meter_registry
       SET status = $1, trail_step = $2
       WHERE meter = ANY($3::text[]) AND status = 'Agendado'`,
      [getNextStatusAfterEntrada(), ENSAIAR_TRAIL_STEP, meterNumbers],
    )
  }

  res.status(201).json({
    document,
    analysis: {
      meters: extractedMeters,
      total: extractedMeters.length,
      scheduledCount: extractedMeters.filter((item) => item.scheduled).length,
    },
  })
}

export async function getDemmDocumentAnalysis(req: Request, res: Response) {
  const { id } = req.params

  const result = await query<Pick<DemmDocumentRow, 'id' | 'file_name' | 'file_data'>>(
    `SELECT id, file_name, file_data FROM demm_documents WHERE id = $1`,
    [id],
  )

  if (!result.rows[0]) {
    res.status(404).json({ error: 'DEMM não encontrada.' })
    return
  }

  let meters: DemmMeterAnalysis[] = []
  let documentNumber: string | null = null
  let emissionDate: string | null = null

  try {
    const parsed = await parseAndAnalyzeDemm(result.rows[0].file_data)
    meters = parsed.extractedMeters
    documentNumber = parsed.documentNumber
    emissionDate = parsed.emissionDate
    await query(
      `UPDATE demm_documents
       SET extracted_meters = $1::jsonb, document_number = $2, emission_date = $3
       WHERE id = $4`,
      [JSON.stringify(meters), documentNumber, emissionDate, id],
    )
  } catch {
    res.status(400).json({ error: 'Não foi possível analisar o PDF da DEMM.' })
    return
  }

  res.json({
    id: result.rows[0].id,
    fileName: result.rows[0].file_name,
    analysis: {
      meters,
      total: meters.length,
      scheduledCount: meters.filter((item) => item.scheduled).length,
    },
  })
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

export async function deleteDemmDocument(req: Request, res: Response) {
  const { id } = req.params

  const existing = await query<Omit<DemmDocumentRow, 'file_data'> & { created_by_registration: string | null }>(
    `SELECT d.id, d.meter_schedule_id, d.meter, d.file_name, d.extracted_meters,
            d.document_number, d.emission_date, d.csd_id, c.name AS csd_name, d.created_at,
            d.created_by_user_id, u.registration AS created_by_registration
     FROM demm_documents d
     LEFT JOIN users u ON u.id = d.created_by_user_id
     LEFT JOIN csds c ON c.id = d.csd_id
     WHERE d.id = $1`,
    [id],
  )

  if (!existing.rows[0]) {
    res.status(404).json({ error: 'DEMM não encontrada.' })
    return
  }

  const removed = mapDemmDocument({ ...existing.rows[0], file_data: Buffer.alloc(0) })

  await query(`DELETE FROM demm_documents WHERE id = $1`, [id])

  await writeAuditLog(req, {
    action: 'delete',
    entityType: 'demm_document',
    entityId: removed.id,
    summary: `DEMM ${removed.fileName} excluída`,
    oldData: removed,
  })

  res.json({ ok: true, id: removed.id, fileName: removed.fileName })
}

function startOfWeek(date: Date): Date {
  const result = new Date(date)
  const day = result.getDay()
  const diff = day === 0 ? -6 : 1 - day
  result.setDate(result.getDate() + diff)
  result.setHours(0, 0, 0, 0)
  return result
}

type CsdDemmPendenciaRow = {
  id: string
  name: string
  responsible_user_id: string | null
  responsible_name: string | null
  responsible_registration: string | null
  responsible_work_subtype: string | null
  submitted_this_week: boolean
}

export async function listCsdDemmPendencias(_req: Request, res: Response) {
  const weekStart = startOfWeek(new Date())

  const result = await query<CsdDemmPendenciaRow>(
    `SELECT c.id, c.name,
            c.responsible_user_id,
            u.name AS responsible_name,
            u.registration AS responsible_registration,
            u.work_subtype AS responsible_work_subtype,
            EXISTS (
              SELECT 1 FROM demm_documents d
              WHERE d.csd_id = c.id AND d.created_at >= $1
            ) AS submitted_this_week
     FROM csds c
     LEFT JOIN users u ON u.id = c.responsible_user_id
     ORDER BY c.name ASC`,
    [weekStart.toISOString()],
  )

  const csds = result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    responsibleUserId: row.responsible_user_id,
    responsibleName: row.responsible_name,
    responsibleRegistration: row.responsible_registration,
    responsibleWorkSubtype: row.responsible_work_subtype,
    submittedThisWeek: row.submitted_this_week,
  }))

  res.json({
    weekStart: weekStart.toISOString(),
    csds,
    pendingCount: csds.filter((csd) => !csd.submittedThisWeek).length,
  })
}
