import type { Request, Response } from 'express'
import { query } from '../db.js'
import { writeAuditLog } from '../audit.js'
import { parseDemmPdf } from '../demm-pdf-parser.js'
import { analyzeDemmMeters, type DemmMeterAnalysis } from '../demm-meter-analysis.js'
import { loadInspectionSummariesByNorm, type InspectionSummary } from './meter-inspection-documents.js'
import { normalizeScheduleMeter } from '../numeric-field-validation.js'
import { validateDemmUploadMeters } from '../demm-upload-validation.js'
import {
  ENTRADA_TRAIL_STEP,
  ENSAIAR_TRAIL_STEP,
  getNextStatusAfterEntrada,
  hasMeterEntradaGiven,
} from '../lab-trail-status.js'
import {
  isMeterDeliveryLate,
  lastFridayBeforeAssay,
  toCalendarDate,
} from '../delivery-deadline.js'

const MAX_PDF_BYTES = 15 * 1024 * 1024

function calendarDaysBetween(from: Date, to: Date): number {
  const start = toCalendarDate(from).getTime()
  const end = toCalendarDate(to).getTime()
  return Math.max(0, Math.round((end - start) / (24 * 60 * 60 * 1000)))
}

/** SLA: dias entre o agendamento no sistema e a entrada no laboratório (DEMM). */
function computeEntradaSlaDays(agendadoEm: Date, entradaNoLaboratorioEm: Date) {
  return calendarDaysBetween(agendadoEm, entradaNoLaboratorioEm)
}

function normalizeCsdKey(value: string) {
  return value.trim().toUpperCase()
}

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

  const allMeters = [
    ...new Set(
      result.rows.flatMap((row) => (row.extracted_meters ?? []).map((item) => item.meter)),
    ),
  ]
  const statusByMeter = await buildMeterWeekStatusMap(allMeters)

  res.json({
    documents: result.rows.map((row) => {
      const mapped = mapDemmDocument({ ...row, file_data: Buffer.alloc(0) })
      const meterNumbers = (row.extracted_meters ?? []).map((item) => item.meter)
      const liberadoCount = meterNumbers.filter(
        (meter) => statusByMeter.get(meter) === 'liberado',
      ).length
      const bulkEntryReady =
        meterNumbers.length > 0 && liberadoCount === meterNumbers.length

      return {
        ...mapped,
        bulkEntryReady,
        liberadoCount,
      }
    }),
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
  const importedByLab =
    Boolean(targetWeekStartDate) || (await isLabDemmImporter(req.user?.id ?? null))

  const insert = await query<Omit<DemmDocumentRow, 'created_by_registration' | 'csd_name'>>(
    `INSERT INTO demm_documents (
      id, meter_schedule_id, meter, file_name, file_data, extracted_meters,
      document_number, emission_date, csd_id, target_week_start, imported_by_lab, created_by_user_id
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)
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
      importedByLab,
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

async function isLabDemmImporter(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false

  const result = await query<{ role: string; work_area: string; work_subtype: string }>(
    `SELECT role, work_area, work_subtype FROM users WHERE id = $1`,
    [userId],
  )
  const row = result.rows[0]
  if (!row) return false
  if (row.role === 'admin') return true

  const area = row.work_area?.trim() ?? ''
  const subtype = row.work_subtype?.trim() ?? ''
  return area === 'Medição' && subtype === 'Laboratório de Medição'
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
  responsible_user_id: string | null
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
            c.responsible_user_id,
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
                AND d.imported_by_lab = false
            ) AS delivered_on_time,
            EXISTS (
              SELECT 1 FROM demm_documents d
              WHERE d.csd_id = c.id
                AND (
                  d.target_week_start = gs.week_start::date
                  OR (
                    d.imported_by_lab = true
                    AND d.created_at >= gs.week_start
                    AND d.created_at <= gs.week_start + interval '4 days 23 hours 59 minutes 59 seconds'
                  )
                )
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
      responsibleUserId: string | null
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
        responsibleUserId: row.responsible_user_id,
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

type WeekMeterInspection = {
  has_toi: boolean
  has_comunicado: boolean
  any_blocked: boolean
  block_reasons: string | null
}

function toWeekMeterInspection(
  summary: InspectionSummary | undefined,
): WeekMeterInspection | undefined {
  if (!summary) return undefined
  return {
    has_toi: summary.hasToi,
    has_comunicado: summary.hasComunicado,
    any_blocked: summary.anyBlocked,
    block_reasons: summary.blockReasons,
  }
}

function computeWeekMeterStatus(
  scheduled: boolean,
  inspection: WeekMeterInspection | undefined,
): WeekMeterStatus {
  const complete = Boolean(inspection?.has_toi && inspection?.has_comunicado)
  if (!scheduled) {
    return 'nao_agendado'
  }
  if (!complete) {
    return 'sem_documento_inspecao'
  }
  if (inspection?.any_blocked) {
    return 'bloqueado'
  }
  return 'liberado'
}

function meterAwaitingEntrada(
  registryStatus: string | null | undefined,
  scheduleTrailStep: string | null | undefined,
): boolean {
  if (registryStatus && hasMeterEntradaGiven(registryStatus)) {
    return false
  }
  if (scheduleTrailStep && scheduleTrailStep.trim() !== ENTRADA_TRAIL_STEP) {
    return false
  }
  return true
}

async function buildMeterWeekStatusMap(meters: string[]): Promise<Map<string, WeekMeterStatus>> {
  const uniqueMeters = [...new Set(meters.map((meter) => meter.trim()).filter(Boolean))]
  const statusByMeter = new Map<string, WeekMeterStatus>()
  if (!uniqueMeters.length) {
    return statusByMeter
  }

  const analyzed = await analyzeDemmMeters(uniqueMeters)
  const analyzedByMeter = new Map(analyzed.map((item) => [item.meter, item]))
  const normalizedMeters = uniqueMeters.map((meter) => normalizeScheduleMeter(meter))
  const inspectionByNorm = await loadInspectionSummariesByNorm(normalizedMeters)

  for (const meter of uniqueMeters) {
    const item = analyzedByMeter.get(meter)
    const inspection = toWeekMeterInspection(
      inspectionByNorm.get(normalizeScheduleMeter(meter)),
    )
    statusByMeter.set(
      meter,
      computeWeekMeterStatus(Boolean(item?.scheduled), inspection),
    )
  }

  return statusByMeter
}

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

  const registryRows = uniqueMeters.length
    ? await query<{ meter: string; status: string; trail_step: string }>(
        `SELECT meter, status, trail_step FROM meter_registry WHERE meter = ANY($1::text[])`,
        [uniqueMeters],
      )
    : { rows: [] as Array<{ meter: string; status: string; trail_step: string }> }
  const registryByMeter = new Map(registryRows.rows.map((row) => [row.meter, row]))

  const scheduleTrailRows = uniqueMeters.length
    ? await query<{ meter: string; trail_step: string }>(
        `SELECT DISTINCT ON (meter) meter, trail_step
         FROM meter_schedules
         WHERE meter = ANY($1::text[])
         ORDER BY meter, created_at DESC`,
        [uniqueMeters],
      )
    : { rows: [] as Array<{ meter: string; trail_step: string }> }
  const scheduleTrailByMeter = new Map(scheduleTrailRows.rows.map((row) => [row.meter, row.trail_step]))

  const normalizedMeters = uniqueMeters.map((meter) => normalizeScheduleMeter(meter))
  const inspectionByNorm = await loadInspectionSummariesByNorm(normalizedMeters)

  const meters = analyzed
    .filter((item) => {
      const registry = registryByMeter.get(item.meter)
      const scheduleTrailStep = scheduleTrailByMeter.get(item.meter)
      return meterAwaitingEntrada(registry?.status, scheduleTrailStep)
    })
    .map((item) => {
    const info = meterInfo.get(item.meter)
    const summary = inspectionByNorm.get(normalizeScheduleMeter(item.meter))
    const inspection = toWeekMeterInspection(summary)
    const status = computeWeekMeterStatus(item.scheduled, inspection)
    return {
      meter: item.meter,
      csdId: info?.csdId ?? null,
      csdName: info?.csdName ?? null,
      demmDocumentNumber: info?.demmDocumentNumber ?? null,
      scheduleId: item.scheduleId,
      scheduledAtLabel: item.scheduledAtLabel,
      sourceFiles: info?.sourceFiles ?? [],
      status,
      hasToi: Boolean(summary?.hasToi),
      hasComunicado: Boolean(summary?.hasComunicado),
      blockReason: summary?.blockReasons ?? null,
    }
  })

  res.json({ meters, total: meters.length })
}

type WeekMeterScheduleRow = {
  id: string
  meter: string
  trail_step: string
}

async function resolveWeekMeterSchedule(
  meter: string,
  scheduleId: string,
): Promise<WeekMeterScheduleRow | null> {
  const scheduleResult = scheduleId
    ? await query<WeekMeterScheduleRow>(
        `SELECT id, meter, trail_step FROM meter_schedules WHERE id = $1`,
        [scheduleId],
      )
    : await query<WeekMeterScheduleRow>(
        `SELECT id, meter, trail_step
         FROM meter_schedules
         WHERE meter = $1 AND trail_step = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [meter, ENTRADA_TRAIL_STEP],
      )

  const schedule = scheduleResult.rows[0]
  if (!schedule || normalizeScheduleMeter(schedule.meter) !== normalizeScheduleMeter(meter)) {
    return null
  }
  return schedule
}

async function validateWeekMeterReadyToReceive(
  schedule: WeekMeterScheduleRow,
  res: Response,
): Promise<boolean> {
  if (schedule.trail_step.trim() !== ENTRADA_TRAIL_STEP) {
    res.status(409).json({ error: 'Este medidor já teve entrada registrada.' })
    return false
  }

  const registry = await query<{ status: string }>(
    `SELECT status FROM meter_registry WHERE meter = $1`,
    [schedule.meter],
  )
  if (registry.rows[0] && hasMeterEntradaGiven(registry.rows[0].status)) {
    res.status(409).json({ error: 'Este medidor já teve entrada registrada.' })
    return false
  }

  const summaries = await loadInspectionSummariesByNorm([normalizeScheduleMeter(schedule.meter)])
  const inspection = toWeekMeterInspection(
    summaries.get(normalizeScheduleMeter(schedule.meter)),
  )
  const status = computeWeekMeterStatus(true, inspection)

  if (status === 'nao_agendado') {
    res.status(409).json({ error: 'Medidor não está agendado.' })
    return false
  }
  if (status === 'sem_documento_inspecao') {
    res.status(409).json({
      error: 'Anexe TOI e CSM antes de receber o medidor.',
    })
    return false
  }
  if (status === 'bloqueado') {
    res.status(409).json({
      error: inspection?.block_reasons
        ? `Medidor bloqueado: ${inspection.block_reasons}`
        : 'Medidor bloqueado pelos documentos de inspeção.',
    })
    return false
  }

  return true
}

async function applyWeekMeterReceive(
  schedule: WeekMeterScheduleRow,
  receivedAt: Date,
  req: Request,
  summarySuffix = '',
) {
  await query(
    `UPDATE meter_schedules
     SET trail_step = $1, received_at = $2
     WHERE id = $3 AND trail_step = $4`,
    [ENSAIAR_TRAIL_STEP, receivedAt.toISOString(), schedule.id, ENTRADA_TRAIL_STEP],
  )

  await query(
    `UPDATE meter_registry
     SET status = $1, trail_step = $2, received_at = $3
     WHERE meter = $4 AND status = 'Agendado'`,
    [
      getNextStatusAfterEntrada(),
      ENSAIAR_TRAIL_STEP,
      receivedAt.toISOString(),
      schedule.meter,
    ],
  )

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'meter_schedule',
    entityId: schedule.id,
    summary: `Medidor ${schedule.meter} recebido no laboratório${summarySuffix}`,
    newData: {
      meter: schedule.meter,
      scheduleId: schedule.id,
      receivedAt: receivedAt.toISOString(),
    },
    metadata: { meter: schedule.meter },
  })
}

function parsePassiveReceivedAt(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }
  const parsed = new Date(value.trim())
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed
}

export async function receiveWeekMeter(req: Request, res: Response) {
  const meter = typeof req.body?.meter === 'string' ? req.body.meter.trim() : ''
  const scheduleId =
    typeof req.body?.scheduleId === 'string' ? req.body.scheduleId.trim() : ''

  if (!meter) {
    res.status(400).json({ error: 'Informe o medidor para receber.' })
    return
  }

  const schedule = await resolveWeekMeterSchedule(meter, scheduleId)
  if (!schedule) {
    res.status(404).json({ error: 'Agendamento do medidor não encontrado.' })
    return
  }

  if (!(await validateWeekMeterReadyToReceive(schedule, res))) {
    return
  }

  const receivedAt = new Date()
  await applyWeekMeterReceive(schedule, receivedAt, req)

  res.json({ ok: true, meter, scheduleId: schedule.id, receivedAt: receivedAt.toISOString() })
}

export async function receiveWeekMeterPassive(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Somente administradores podem registrar recebimento passivo.' })
    return
  }

  const meter = typeof req.body?.meter === 'string' ? req.body.meter.trim() : ''
  const scheduleId =
    typeof req.body?.scheduleId === 'string' ? req.body.scheduleId.trim() : ''
  const receivedAt = parsePassiveReceivedAt(req.body?.receivedAt)

  if (!meter) {
    res.status(400).json({ error: 'Informe o medidor para receber.' })
    return
  }

  if (!receivedAt) {
    res.status(400).json({ error: 'Informe a data real em que o medidor foi recebido.' })
    return
  }

  if (receivedAt.getTime() > Date.now()) {
    res.status(400).json({ error: 'A data de recebimento não pode ser no futuro.' })
    return
  }

  const schedule = await resolveWeekMeterSchedule(meter, scheduleId)
  if (!schedule) {
    res.status(404).json({ error: 'Agendamento do medidor não encontrado.' })
    return
  }

  if (!(await validateWeekMeterReadyToReceive(schedule, res))) {
    return
  }

  await applyWeekMeterReceive(schedule, receivedAt, req, ' (passivo)')

  res.json({
    ok: true,
    meter,
    scheduleId: schedule.id,
    receivedAt: receivedAt.toISOString(),
    passive: true,
  })
}

type CsdDashboardAccumulator = {
  csdId: string
  csdName: string
  responsibleName: string | null
  scheduledTotal: number
  lateNow: number
  deliveredLate: number
  deliveredOnTime: number
  onTimePending: number
  slaDaySamples: number[]
  demmMetersTotal: number
  unscheduledMeters: number
}

function emptyCsdAccumulator(
  csdId: string,
  csdName: string,
  responsibleName: string | null,
): CsdDashboardAccumulator {
  return {
    csdId,
    csdName,
    responsibleName,
    scheduledTotal: 0,
    lateNow: 0,
    deliveredLate: 0,
    deliveredOnTime: 0,
    onTimePending: 0,
    slaDaySamples: [],
    demmMetersTotal: 0,
    unscheduledMeters: 0,
  }
}

function computeCsdScore(options: {
  lateProportion: number
  avgSlaDays: number | null
  unscheduledProportion: number
  hasScheduledData: boolean
  hasDemmData: boolean
}) {
  const lateScore = (1 - options.lateProportion) * 100
  const slaScore =
    options.avgSlaDays === null
      ? 100
      : Math.max(0, 100 - (Math.min(options.avgSlaDays, 30) / 30) * 100)
  const unscheduledScore = (1 - options.unscheduledProportion) * 100

  if (!options.hasScheduledData && !options.hasDemmData) {
    return 100
  }
  if (!options.hasScheduledData) {
    return Math.round(unscheduledScore)
  }
  if (!options.hasDemmData) {
    return Math.round(lateScore * 0.6 + slaScore * 0.4)
  }

  return Math.round(lateScore * 0.4 + slaScore * 0.3 + unscheduledScore * 0.3)
}

/** Dashboard de erros e desempenho por CSD na etapa Entrada. */
export async function getEntradaCsdDashboard(_req: Request, res: Response) {
  const now = new Date()

  const csdsResult = await query<{
    id: string
    name: string
    responsible_name: string | null
  }>(
    `SELECT c.id, c.name, u.name AS responsible_name
     FROM csds c
     LEFT JOIN users u ON u.id = c.responsible_user_id
     ORDER BY c.name ASC`,
  )

  const csdByKey = new Map(
    csdsResult.rows.map((row) => [
      normalizeCsdKey(row.name),
      emptyCsdAccumulator(row.id, row.name, row.responsible_name),
    ]),
  )

  const ensureCsd = (csdName: string | null | undefined) => {
    const key = normalizeCsdKey(csdName?.trim() ?? '')
    if (!key) return null
    return csdByKey.get(key) ?? null
  }

  const schedulesResult = await query<{
    id: string
    meter: string
    csd: string
    scheduled_at: Date
    trail_step: string
    created_at: Date
    entry_at: Date | null
  }>(
    `SELECT ms.id, ms.meter, ms.csd, ms.scheduled_at, ms.trail_step, ms.created_at,
            COALESCE(ms.received_at, mr.received_at, d.created_at) AS entry_at
     FROM meter_schedules ms
     LEFT JOIN meter_registry mr ON mr.meter = ms.meter
     LEFT JOIN LATERAL (
       SELECT created_at
       FROM demm_documents
       WHERE meter_schedule_id = ms.id OR meter = ms.meter
       ORDER BY created_at ASC
       LIMIT 1
     ) d ON true
     ORDER BY ms.scheduled_at ASC`,
  )

  for (const row of schedulesResult.rows) {
    const bucket = ensureCsd(row.csd)
    if (!bucket) continue

    bucket.scheduledTotal += 1
    const deadline = lastFridayBeforeAssay(row.scheduled_at)
    const hasEntry = Boolean(row.entry_at) || row.trail_step.trim() !== ENTRADA_TRAIL_STEP

    if (hasEntry) {
      if (row.entry_at) {
        const daysLate = calendarDaysBetween(deadline, row.entry_at)
        bucket.slaDaySamples.push(computeEntradaSlaDays(row.created_at, row.entry_at))
        if (daysLate > 0) {
          bucket.deliveredLate += 1
        } else {
          bucket.deliveredOnTime += 1
        }
      } else {
        bucket.deliveredOnTime += 1
      }
      continue
    }

    const currentlyLate = isMeterDeliveryLate({
      scheduledAt: row.scheduled_at,
      trailStep: row.trail_step,
      entradaTrailStep: ENTRADA_TRAIL_STEP,
      now,
    })
    if (currentlyLate) {
      bucket.lateNow += 1
    } else {
      bucket.onTimePending += 1
    }
  }

  const demmResult = await query<{
    csd_id: string | null
    csd_name: string | null
    created_at: Date
    extracted_meters: Array<{ meter: string }> | null
  }>(
    `SELECT d.csd_id, c.name AS csd_name, d.created_at, d.extracted_meters
     FROM demm_documents d
     LEFT JOIN csds c ON c.id = d.csd_id
     ORDER BY d.created_at ASC`,
  )

  const allDemmMeters = new Set<string>()
  for (const doc of demmResult.rows) {
    for (const item of doc.extracted_meters ?? []) {
      allDemmMeters.add(item.meter)
    }
  }

  const priorSchedulesResult = allDemmMeters.size
    ? await query<{ meter: string; created_at: Date }>(
        `SELECT meter, created_at
         FROM meter_schedules
         WHERE meter = ANY($1::text[])`,
        [[...allDemmMeters]],
      )
    : { rows: [] as Array<{ meter: string; created_at: Date }> }

  const schedulesByMeter = new Map<string, Date[]>()
  for (const row of priorSchedulesResult.rows) {
    const list = schedulesByMeter.get(row.meter) ?? []
    list.push(row.created_at)
    schedulesByMeter.set(row.meter, list)
  }

  for (const doc of demmResult.rows) {
    const bucket = doc.csd_id
      ? [...csdByKey.values()].find((item) => item.csdId === doc.csd_id) ?? ensureCsd(doc.csd_name)
      : ensureCsd(doc.csd_name)
    if (!bucket) continue

    for (const item of doc.extracted_meters ?? []) {
      bucket.demmMetersTotal += 1
      const priorDates = schedulesByMeter.get(item.meter) ?? []
      const hadPriorSchedule = priorDates.some(
        (createdAt) => createdAt.getTime() <= doc.created_at.getTime(),
      )
      if (!hadPriorSchedule) {
        bucket.unscheduledMeters += 1
      }
    }
  }

  const csds = [...csdByKey.values()].map((bucket) => {
    const delayedOverall = bucket.lateNow + bucket.deliveredLate
    const lateProportion =
      bucket.scheduledTotal > 0 ? delayedOverall / bucket.scheduledTotal : 0
    const avgSlaDays = bucket.slaDaySamples.length
      ? bucket.slaDaySamples.reduce((sum, value) => sum + value, 0) /
        bucket.slaDaySamples.length
      : null
    const unscheduledProportion =
      bucket.demmMetersTotal > 0 ? bucket.unscheduledMeters / bucket.demmMetersTotal : 0
    const score = computeCsdScore({
      lateProportion,
      avgSlaDays,
      unscheduledProportion,
      hasScheduledData: bucket.scheduledTotal > 0,
      hasDemmData: bucket.demmMetersTotal > 0,
    })

    return {
      csdId: bucket.csdId,
      csdName: bucket.csdName,
      responsibleName: bucket.responsibleName,
      scheduledTotal: bucket.scheduledTotal,
      lateNow: bucket.lateNow,
      deliveredLate: bucket.deliveredLate,
      deliveredOnTime: bucket.deliveredOnTime,
      onTimePending: bucket.onTimePending,
      delayedOverall,
      lateProportion,
      avgSlaDays:
        avgSlaDays === null ? null : Math.round(avgSlaDays * 10) / 10,
      slaSampleCount: bucket.slaDaySamples.length,
      demmMetersTotal: bucket.demmMetersTotal,
      unscheduledMeters: bucket.unscheduledMeters,
      unscheduledProportion,
      score,
    }
  })

  const rankedCsds = [...csds]
    .filter((item) => item.scheduledTotal > 0 || item.demmMetersTotal > 0)
    .sort((a, b) => b.score - a.score || a.csdName.localeCompare(b.csdName, 'pt-BR'))
    .map((item, index) => ({ ...item, rank: index + 1 }))

  const inactiveCsds = csds
    .filter((item) => item.scheduledTotal === 0 && item.demmMetersTotal === 0)
    .map((item) => ({ ...item, rank: null as number | null }))

  const summary = {
    scheduledTotal: csds.reduce((sum, item) => sum + item.scheduledTotal, 0),
    delayedOverall: csds.reduce((sum, item) => sum + item.delayedOverall, 0),
    unscheduledMeters: csds.reduce((sum, item) => sum + item.unscheduledMeters, 0),
    demmMetersTotal: csds.reduce((sum, item) => sum + item.demmMetersTotal, 0),
    avgScore:
      rankedCsds.length > 0
        ? Math.round(
            rankedCsds.reduce((sum, item) => sum + item.score, 0) / rankedCsds.length,
          )
        : null,
  }

  res.json({
    summary,
    csds: [...rankedCsds, ...inactiveCsds],
    rankings: {
      byScore: rankedCsds.slice(0, 5),
      byLate: [...rankedCsds]
        .sort(
          (a, b) =>
            b.lateProportion - a.lateProportion ||
            b.delayedOverall - a.delayedOverall ||
            a.csdName.localeCompare(b.csdName, 'pt-BR'),
        )
        .slice(0, 5),
      bySla: [...rankedCsds]
        .filter((item) => item.avgSlaDays !== null)
        .sort(
          (a, b) =>
            (b.avgSlaDays ?? 0) - (a.avgSlaDays ?? 0) ||
            a.csdName.localeCompare(b.csdName, 'pt-BR'),
        )
        .slice(0, 5),
      byUnscheduled: [...rankedCsds]
        .filter((item) => item.demmMetersTotal > 0)
        .sort(
          (a, b) =>
            b.unscheduledMeters - a.unscheduledMeters ||
            b.unscheduledProportion - a.unscheduledProportion ||
            a.csdName.localeCompare(b.csdName, 'pt-BR'),
        )
        .slice(0, 5),
    },
  })
}
