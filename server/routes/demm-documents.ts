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
  const { meterScheduleId, fileName, fileBase64, csdId, targetWeekStart } = req.body as {
    meterScheduleId?: string
    fileName?: string
    fileBase64?: string
    csdId?: string
    targetWeekStart?: string
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

  const normalizedTargetWeekStart = targetWeekStart?.trim() ?? ''
  let targetWeekStartDate: Date | null = null
  if (normalizedTargetWeekStart) {
    targetWeekStartDate = parseDateKey(normalizedTargetWeekStart)
    if (!targetWeekStartDate) {
      res.status(400).json({ error: 'Semana retroativa inválida.' })
      return
    }
    const now = new Date()
    if (now <= fridayDeadline(targetWeekStartDate)) {
      res.status(400).json({
        error:
          'Só é possível importar DEMM retroativa para semanas com prazo (sexta-feira) já encerrado.',
      })
      return
    }

    const existingRetro = await query<{ id: string }>(
      `SELECT id FROM demm_documents
       WHERE csd_id = $1 AND target_week_start = $2::date
       LIMIT 1`,
      [normalizedCsdId, normalizedTargetWeekStart],
    )
    if (existingRetro.rows[0]) {
      res.status(409).json({
        error: 'Já existe DEMM retroativa registrada para este CSD nesta semana.',
      })
      return
    }
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
      document_number, emission_date, csd_id, target_week_start, created_by_user_id
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)
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
      targetWeekStartDate ? normalizedTargetWeekStart : null,
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

/** Prazo de entrega da DEMM: sexta-feira (fim do dia) da semana informada. */
function fridayDeadline(weekStart: Date): Date {
  const result = new Date(weekStart)
  result.setDate(result.getDate() + 4)
  result.setHours(23, 59, 59, 999)
  return result
}

/**
 * Data "YYYY-MM-DD" a partir dos componentes locais do servidor (não usar toISOString aqui:
 * o front-end reinterpreta ISO com "Z" no fuso do navegador, o que pode voltar a data um dia
 * (ex.: segunda 00:00 UTC vira domingo à noite em horário de Brasília).
 */
function dateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type DemmWeekStatus = 'entregue' | 'pendente' | 'nao_entregue' | 'retroativo'

function computeWeekStatus(
  weekStart: Date,
  deliveredOnTime: boolean,
  deliveredRetroactive: boolean,
  now: Date,
): DemmWeekStatus {
  if (deliveredOnTime) return 'entregue'
  if (deliveredRetroactive) return 'retroativo'
  return now > fridayDeadline(weekStart) ? 'nao_entregue' : 'pendente'
}

function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(year, month - 1, day)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null
  }
  parsed.setHours(0, 0, 0, 0)
  return parsed
}

type CsdDemmPendenciaRow = {
  id: string
  name: string
  responsible_user_id: string | null
  responsible_name: string | null
  responsible_registration: string | null
  responsible_work_subtype: string | null
  delivered_this_week: boolean
}

export async function listCsdDemmPendencias(_req: Request, res: Response) {
  const now = new Date()
  const weekStart = startOfWeek(now)
  const weekEnd = fridayDeadline(weekStart)

  const result = await query<CsdDemmPendenciaRow>(
    `SELECT c.id, c.name,
            c.responsible_user_id,
            u.name AS responsible_name,
            u.registration AS responsible_registration,
            u.work_subtype AS responsible_work_subtype,
            EXISTS (
              SELECT 1 FROM demm_documents d
              WHERE d.csd_id = c.id AND d.created_at >= $1 AND d.created_at <= $2
            ) AS delivered_this_week
     FROM csds c
     LEFT JOIN users u ON u.id = c.responsible_user_id
     ORDER BY c.name ASC`,
    [weekStart.toISOString(), weekEnd.toISOString()],
  )

  const csds = result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    responsibleUserId: row.responsible_user_id,
    responsibleName: row.responsible_name,
    responsibleRegistration: row.responsible_registration,
    responsibleWorkSubtype: row.responsible_work_subtype,
    status: computeWeekStatus(weekStart, row.delivered_this_week, false, now),
  }))

  res.json({
    weekStart: dateKey(weekStart),
    weekDeadline: dateKey(weekEnd),
    csds,
    pendingCount: csds.filter((csd) => csd.status !== 'entregue').length,
  })
}

const DEMM_HISTORY_WEEKS = 8

type CsdDemmHistoricoRow = {
  id: string
  name: string
  responsible_name: string | null
  responsible_registration: string | null
  responsible_work_subtype: string | null
  week_start: Date
  delivered_on_time: boolean
  delivered_retroactive: boolean
}

export async function getCsdDemmHistorico(_req: Request, res: Response) {
  const now = new Date()
  const currentWeekStart = startOfWeek(now)
  const firstWeekStart = new Date(currentWeekStart)
  firstWeekStart.setDate(firstWeekStart.getDate() - 7 * (DEMM_HISTORY_WEEKS - 1))

  const result = await query<CsdDemmHistoricoRow>(
    `SELECT c.id, c.name,
            u.name AS responsible_name,
            u.registration AS responsible_registration,
            u.work_subtype AS responsible_work_subtype,
            gs.week_start,
            EXISTS (
              SELECT 1 FROM demm_documents d
              WHERE d.csd_id = c.id
                AND d.created_at >= gs.week_start
                AND d.created_at <= gs.week_start + interval '4 days 23 hours 59 minutes 59 seconds'
                AND d.target_week_start IS NULL
            ) AS delivered_on_time,
            EXISTS (
              SELECT 1 FROM demm_documents d
              WHERE d.csd_id = c.id
                AND d.target_week_start = gs.week_start::date
            ) AS delivered_retroactive
     FROM csds c
     LEFT JOIN users u ON u.id = c.responsible_user_id
     CROSS JOIN generate_series($1::timestamptz, $2::timestamptz, interval '1 week') AS gs(week_start)
     ORDER BY c.name ASC, gs.week_start ASC`,
    [firstWeekStart.toISOString(), currentWeekStart.toISOString()],
  )

  const csdMap = new Map<
    string,
    {
      id: string
      name: string
      responsibleName: string | null
      responsibleRegistration: string | null
      responsibleWorkSubtype: string | null
      weeks: Array<{ weekStart: string; status: DemmWeekStatus }>
    }
  >()

  for (const row of result.rows) {
    if (!csdMap.has(row.id)) {
      csdMap.set(row.id, {
        id: row.id,
        name: row.name,
        responsibleName: row.responsible_name,
        responsibleRegistration: row.responsible_registration,
        responsibleWorkSubtype: row.responsible_work_subtype,
        weeks: [],
      })
    }
    csdMap.get(row.id)!.weeks.push({
      weekStart: dateKey(row.week_start),
      status: computeWeekStatus(
        row.week_start,
        row.delivered_on_time,
        row.delivered_retroactive,
        now,
      ),
    })
  }

  const weeks: Array<{ weekStart: string; weekDeadline: string }> = []
  for (let i = 0; i < DEMM_HISTORY_WEEKS; i += 1) {
    const week = new Date(firstWeekStart)
    week.setDate(week.getDate() + 7 * i)
    weeks.push({ weekStart: dateKey(week), weekDeadline: dateKey(fridayDeadline(week)) })
  }

  res.json({ weeks, csds: [...csdMap.values()] })
}

export type WeekMeterStatus = 'nao_agendado' | 'sem_documento_inspecao' | 'bloqueado' | 'liberado'

export async function listWeekMeters(_req: Request, res: Response) {
  const documents = await query<{
    file_name: string
    document_number: string | null
    extracted_meters: Array<{ meter: string }> | null
    csd_id: string | null
    csd_name: string | null
  }>(
    `SELECT d.file_name, d.document_number, d.extracted_meters, d.csd_id, c.name AS csd_name
     FROM demm_documents d
     LEFT JOIN csds c ON c.id = d.csd_id
     ORDER BY d.created_at ASC`,
  )

  const meterInfo = new Map<
    string,
    {
      csdId: string | null
      csdName: string | null
      demmDocumentNumber: string | null
      sourceFiles: string[]
    }
  >()

  for (const doc of documents.rows) {
    for (const item of doc.extracted_meters ?? []) {
      const existing = meterInfo.get(item.meter)
      if (existing) {
        if (!existing.sourceFiles.includes(doc.file_name)) {
          existing.sourceFiles.push(doc.file_name)
        }
      } else {
        meterInfo.set(item.meter, {
          csdId: doc.csd_id,
          csdName: doc.csd_name,
          demmDocumentNumber: doc.document_number,
          sourceFiles: [doc.file_name],
        })
      }
    }
  }

  const uniqueMeters = [...meterInfo.keys()]
  const analyzed = await analyzeDemmMeters(uniqueMeters)

  const scheduleIds = analyzed
    .filter((item): item is typeof item & { scheduleId: string } => Boolean(item.scheduleId))
    .map((item) => item.scheduleId)

  const inspectionRows = scheduleIds.length
    ? await query<{
        meter_schedule_id: string
        has_toi: boolean
        has_comunicado: boolean
        any_blocked: boolean
        block_reasons: string | null
      }>(
        `SELECT meter_schedule_id,
                bool_or(doc_type IN ('toi', 'ambos')) AS has_toi,
                bool_or(doc_type IN ('comunicado', 'ambos')) AS has_comunicado,
                bool_or(blocked) AS any_blocked,
                string_agg(DISTINCT block_reason, ' | ') FILTER (WHERE block_reason IS NOT NULL) AS block_reasons
         FROM meter_inspection_documents
         WHERE meter_schedule_id = ANY($1::text[])
         GROUP BY meter_schedule_id`,
        [scheduleIds],
      )
    : {
        rows: [] as Array<{
          meter_schedule_id: string
          has_toi: boolean
          has_comunicado: boolean
          any_blocked: boolean
          block_reasons: string | null
        }>,
      }
  const inspectionByScheduleId = new Map(
    inspectionRows.rows.map((row) => [row.meter_schedule_id, row]),
  )

  const meters = analyzed.map((item) => {
    const info = meterInfo.get(item.meter)
    const inspection = item.scheduleId ? inspectionByScheduleId.get(item.scheduleId) : undefined
    const complete = Boolean(inspection?.has_toi && inspection?.has_comunicado)
    let status: WeekMeterStatus
    if (!item.scheduled) {
      status = 'nao_agendado'
    } else if (!complete) {
      status = 'sem_documento_inspecao'
    } else if (inspection?.any_blocked) {
      status = 'bloqueado'
    } else {
      status = 'liberado'
    }
    return {
      meter: item.meter,
      csdId: info?.csdId ?? null,
      csdName: info?.csdName ?? null,
      demmDocumentNumber: info?.demmDocumentNumber ?? null,
      scheduleId: item.scheduleId,
      scheduledAtLabel: item.scheduledAtLabel,
      sourceFiles: info?.sourceFiles ?? [],
      status,
      blockReason: inspection?.block_reasons ?? null,
    }
  })

  res.json({ meters, total: meters.length })
}
