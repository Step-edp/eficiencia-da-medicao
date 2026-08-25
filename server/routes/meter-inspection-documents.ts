import type { Request, Response } from 'express'
import { query } from '../db.js'
import { writeAuditLog } from '../audit.js'
import { NORMALIZED_METER_SQL } from '../demm-meter-analysis.js'
import { ENTRADA_TRAIL_STEP, hasMeterEntradaGiven } from '../lab-trail-status.js'
import {
  classifyInspectionDocument,
  extractInspectionPdfText,
  parseExtractedScheduleLabel,
  parseInspectionText,
  type InspectionDocumentType,
} from '../inspection-document-parser.js'
import { formatAvailableSlot } from '../schedule-slots.js'
import {
  formatDeliveryDeadlineLabel,
  lastFridayBeforeAssay,
} from '../delivery-deadline.js'
import {
  formatScheduleNumericField,
  normalizeScheduleMeter,
  normalizeScheduleNote,
} from '../numeric-field-validation.js'
import { pontoFocalScopeUserId, resolvePontoFocalCsdNames } from '../ponto-focal-csds.js'

const MAX_FILE_BYTES = 10 * 1024 * 1024

type InspectionDocumentRow = {
  id: string
  meter_schedule_id: string
  doc_type: InspectionDocumentType
  file_name: string
  file_data: Buffer
  extracted_meter: string | null
  extracted_meter_retirado: string | null
  extracted_lacre: string | null
  extracted_cover_seal: string | null
  extracted_reading: string | null
  extracted_scheduled_at: string | null
  extracted_installation: string | null
  extracted_toi: string | null
  extracted_note: string | null
  extracted_fields_manual?: boolean
  blocked: boolean
  block_reason: string | null
  created_at: Date
  created_by_user_id: string | null
  created_by_registration: string | null
  created_by_name?: string | null
}

export type EntryFieldMatch = {
  registered: string | null
  document: string | null
  matches: boolean | null
}

export type ScheduleEntryComparisons = {
  scheduleDate: EntryFieldMatch
  installation: EntryFieldMatch
  toi: EntryFieldMatch
  note: EntryFieldMatch
  csd: EntryFieldMatch
  partner: EntryFieldMatch
  collaborator1: EntryFieldMatch
  collaborator2: EntryFieldMatch
  clientPresent: EntryFieldMatch
  deliveryDeadline: EntryFieldMatch
  schedulingNotes: EntryFieldMatch
  scheduleSource: string
  excludeCollaboratorChecks: boolean
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

function normalizeMeter(value: string | null | undefined): string | null {
  const normalized = normalizeScheduleMeter(value)
  return normalized || null
}

function normalizeNumericEntryField(
  value: string | null | undefined,
  field: 'instalacao' | 'toi' | 'nota',
): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null
  if (field === 'nota') {
    const normalized = normalizeScheduleNote(digits)
    return normalized || null
  }
  const normalized = formatScheduleNumericField(digits, field)
  return normalized || null
}

function compareNumericEntryField(
  extracted: string | null | undefined,
  registered: string | null | undefined,
  field: 'instalacao' | 'toi' | 'nota',
): boolean | null {
  const documentValue = normalizeNumericEntryField(extracted, field)
  const registeredValue = normalizeNumericEntryField(registered, field)
  if (!documentValue || !registeredValue) return null
  return documentValue === registeredValue
}

function normalizeSeal(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) {
    return trimmed.replace(/^0+/, '') || '0'
  }
  return trimmed.toUpperCase()
}

function compareMeter(extracted: string | null, registered: string | null): boolean | null {
  const documentValue = normalizeMeter(extracted)
  const registeredValue = normalizeMeter(registered)
  if (!documentValue || !registeredValue) return null
  return documentValue === registeredValue
}

function compareSeal(extracted: string | null, registered: string | null): boolean | null {
  const documentValue = normalizeSeal(extracted)
  const registeredValue = normalizeSeal(registered)
  if (!documentValue || !registeredValue) return null
  return documentValue === registeredValue
}

function normalizeReading(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null
  return digits.replace(/^0+/, '') || '0'
}

function compareReading(extracted: string | null, registered: string | null): boolean | null {
  const documentValue = normalizeReading(extracted)
  const registeredValue = normalizeReading(registered)
  if (!documentValue || !registeredValue) return null
  return documentValue === registeredValue
}

function normalizeEntryValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 4) return digits
  return trimmed.toLowerCase()
}

function compareEntryField(
  extracted: string | null | undefined,
  registered: string | null | undefined,
): boolean | null {
  const documentValue = normalizeEntryValue(extracted)
  const registeredValue = normalizeEntryValue(registered)
  if (!documentValue || !registeredValue) return null
  return documentValue === registeredValue
}

function normalizeScheduleDateValue(value: string | null | undefined): string | null {
  const match = String(value ?? '').match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/,
  )
  if (!match) return null
  const day = match[1].padStart(2, '0')
  const month = match[2].padStart(2, '0')
  const year = match[3]
  const hour = match[4]
  const minute = match[5]
  if (hour == null || minute == null) return `${year}-${month}-${day}`
  return `${year}-${month}-${day}T${hour.padStart(2, '0')}:${minute}`
}

function compareScheduleDates(
  extracted: string | null | undefined,
  registered: string | null | undefined,
): boolean | null {
  const documentValue = normalizeScheduleDateValue(extracted)
  const registeredValue = normalizeScheduleDateValue(registered)
  if (!documentValue || !registeredValue) return null
  if (documentValue.includes('T') && registeredValue.includes('T')) {
    return documentValue === registeredValue
  }
  return documentValue.slice(0, 10) === registeredValue.slice(0, 10)
}

function buildEntryFieldMatch(
  registered: string | null | undefined,
  document: string | null | undefined,
  numericField?: 'instalacao' | 'toi' | 'nota',
): EntryFieldMatch {
  const registeredValue = registered?.trim() || null
  const documentValue = document?.trim() || null
  return {
    registered: registeredValue,
    document: documentValue,
    matches: numericField
      ? compareNumericEntryField(documentValue, registeredValue, numericField)
      : compareEntryField(documentValue, registeredValue),
  }
}

function pickToiExtractionRow(
  rows: Array<
    Pick<
      InspectionDocumentRow,
      | 'doc_type'
      | 'extracted_cover_seal'
      | 'extracted_reading'
      | 'extracted_installation'
      | 'extracted_toi'
      | 'extracted_note'
    >
  >,
) {
  return (
    rows.find((row) => row.doc_type === 'ambos') ??
    rows.find((row) => row.doc_type === 'toi') ??
    null
  )
}

function pickExtractedScheduledAt(
  rows: Array<{
    doc_type: InspectionDocumentType
    extracted_scheduled_at?: string | null
  }>,
): string | null {
  const preferred =
    rows.find((row) => row.doc_type === 'ambos') ??
    rows.find((row) => row.doc_type === 'comunicado') ??
    rows.find((row) => row.doc_type === 'toi')
  const fromPreferred = preferred?.extracted_scheduled_at?.trim()
  if (fromPreferred) return fromPreferred
  return (
    rows.find((row) => row.extracted_scheduled_at?.trim())?.extracted_scheduled_at?.trim() ?? null
  )
}

export type InspectionSummary = {
  hasToi: boolean
  hasComunicado: boolean
  anyBlocked: boolean
  blockReasons: string | null
}

type ScheduleForInspectionAggregate = {
  meter: string
  envelope_seal: string | null
  cover_seal: string | null
  meter_reading: string | null
  installation: string
  toi: string
  note: string
  source: string
}

type DocumentForInspectionAggregate = Pick<
  InspectionDocumentRow,
  | 'doc_type'
  | 'extracted_meter'
  | 'extracted_meter_retirado'
  | 'extracted_lacre'
  | 'extracted_cover_seal'
  | 'extracted_reading'
  | 'extracted_installation'
  | 'extracted_toi'
  | 'extracted_note'
>

export function aggregateInspectionForSchedule(
  schedule: ScheduleForInspectionAggregate,
  documents: DocumentForInspectionAggregate[],
): InspectionSummary {
  const types = new Set(documents.map((doc) => doc.doc_type))
  const hasToi = types.has('toi') || types.has('ambos')
  const hasComunicado = types.has('comunicado') || types.has('ambos')
  const reasons: string[] = []

  for (const doc of documents) {
    if (doc.doc_type !== 'toi' && doc.doc_type !== 'ambos') continue
    const evaluation = evaluateInspectionDocument(
      doc.extracted_lacre,
      doc.extracted_meter,
      schedule.meter,
      schedule.envelope_seal,
    )
    if (evaluation.blocked && evaluation.reason) {
      reasons.push(evaluation.reason)
    }
  }

  for (const doc of documents) {
    if (doc.doc_type !== 'comunicado') continue
    const evaluation = evaluateInspectionDocument(
      doc.extracted_lacre,
      doc.extracted_meter_retirado,
      schedule.meter,
      schedule.envelope_seal,
    )
    if (evaluation.blocked && evaluation.reason) {
      reasons.push(evaluation.reason)
    }
  }

  const extraction = pickToiExtractionRow(documents)
  if (extraction) {
    const comparisons = buildScheduleEntryComparisons(
      {
        source: schedule.source,
        scheduled_at: new Date(),
        installation: schedule.installation,
        toi: schedule.toi,
        note: schedule.note,
        csd: '',
        partner_name: '',
        partner_registration: '',
        toi_collaborator1_name: '',
        toi_collaborator1_registration: '',
        toi_collaborator2_name: '',
        toi_collaborator2_registration: '',
        client_present: '',
        scheduling_notes: '',
      },
      extraction,
      pickExtractedScheduledAt(documents),
    )
    const fieldLabels: Array<[string, EntryFieldMatch]> = [
      ['Instalação', comparisons.installation],
      ['TOI', comparisons.toi],
      ['Nota', comparisons.note],
    ]
    for (const [label, field] of fieldLabels) {
      if (field.matches === false) {
        reasons.push(`${label} no documento diverge do cadastrado.`)
      }
    }

    if (
      schedule.cover_seal?.trim() &&
      compareSeal(extraction.extracted_cover_seal, schedule.cover_seal) === false
    ) {
      reasons.push('Lacre da tampa no documento diverge do cadastrado.')
    }
    if (
      schedule.meter_reading?.trim() &&
      compareReading(extraction.extracted_reading, schedule.meter_reading) === false
    ) {
      reasons.push('Leitura no documento diverge do cadastrada.')
    }
  }

  const uniqueReasons = [...new Set(reasons)]
  return {
    hasToi,
    hasComunicado,
    anyBlocked: uniqueReasons.length > 0,
    blockReasons: uniqueReasons.length ? uniqueReasons.join(' | ') : null,
  }
}

export async function loadInspectionSummariesByNorm(
  normalizedMeters: string[],
): Promise<Map<string, InspectionSummary>> {
  const summariesByNorm = new Map<string, InspectionSummary>()
  if (!normalizedMeters.length) {
    return summariesByNorm
  }

  const rows = await query<{
    norm: string
    id: string
    meter: string
    envelope_seal: string | null
    cover_seal: string | null
    meter_reading: string | null
    installation: string
    toi: string
    note: string
    source: string
    created_at: Date
    doc_type: InspectionDocumentType | null
    extracted_meter: string | null
    extracted_meter_retirado: string | null
    extracted_lacre: string | null
    extracted_cover_seal: string | null
    extracted_reading: string | null
    extracted_installation: string | null
    extracted_toi: string | null
    extracted_note: string | null
  }>(
    `SELECT ms_norm.norm,
            ms.id,
            ms.meter,
            ms.envelope_seal,
            ms.cover_seal,
            ms.meter_reading,
            ms.installation,
            ms.toi,
            ms.note,
            ms.source,
            ms.created_at,
            d.doc_type,
            d.extracted_meter,
            d.extracted_meter_retirado,
            d.extracted_lacre,
            d.extracted_cover_seal,
            d.extracted_reading,
            d.extracted_installation,
            d.extracted_toi,
            d.extracted_note
     FROM meter_schedules ms
     JOIN (
       SELECT id, ${NORMALIZED_METER_SQL} AS norm
       FROM meter_schedules
     ) ms_norm ON ms_norm.id = ms.id
     LEFT JOIN meter_inspection_documents d ON d.meter_schedule_id = ms.id
     WHERE ms.trail_step = $2
       AND ms.delay_dismissed_at IS NULL
       AND ms_norm.norm = ANY($1::text[])`,
    [normalizedMeters, ENTRADA_TRAIL_STEP],
  )

  type NormGroup = {
    schedule: ScheduleForInspectionAggregate
    documents: DocumentForInspectionAggregate[]
  }
  const groups = new Map<string, NormGroup>()

  for (const row of rows.rows) {
    let group = groups.get(row.norm)
    if (!group) {
      group = {
        schedule: {
          meter: row.meter,
          envelope_seal: row.envelope_seal,
          cover_seal: row.cover_seal,
          meter_reading: row.meter_reading,
          installation: row.installation,
          toi: row.toi,
          note: row.note,
          source: row.source,
        },
        documents: [],
      }
      groups.set(row.norm, group)
    }

    if (row.doc_type) {
      group.documents.push({
        doc_type: row.doc_type,
        extracted_meter: row.extracted_meter,
        extracted_meter_retirado: row.extracted_meter_retirado,
        extracted_lacre: row.extracted_lacre,
        extracted_cover_seal: row.extracted_cover_seal,
        extracted_reading: row.extracted_reading,
        extracted_installation: row.extracted_installation,
        extracted_toi: row.extracted_toi,
        extracted_note: row.extracted_note,
      })
    }
  }

  for (const [norm, group] of groups) {
    summariesByNorm.set(norm, aggregateInspectionForSchedule(group.schedule, group.documents))
  }

  return summariesByNorm
}

function formatPersonLabel(name: string, registration: string) {
  const normalizedName = name?.trim()
  const normalizedRegistration = registration?.trim()
  if (!normalizedName && !normalizedRegistration) return null
  if (normalizedName && normalizedRegistration) {
    return `${normalizedName} (${normalizedRegistration})`
  }
  return normalizedName || normalizedRegistration || null
}

function buildScheduleEntryComparisons(
  schedule: {
    source: string
    scheduled_at: Date
    installation: string
    toi: string
    note: string
    csd: string
    partner_name: string
    partner_registration: string
    toi_collaborator1_name: string
    toi_collaborator1_registration: string
    toi_collaborator2_name: string
    toi_collaborator2_registration: string
    client_present: string
    scheduling_notes: string
  },
  extraction: Pick<
    InspectionDocumentRow,
    'extracted_installation' | 'extracted_toi' | 'extracted_note'
  > | null,
  extractedScheduledAt: string | null = null,
): ScheduleEntryComparisons {
  const partnerRegistered = formatPersonLabel(
    schedule.partner_name,
    schedule.partner_registration,
  )
  const collaborator1Registered = formatPersonLabel(
    schedule.toi_collaborator1_name,
    schedule.toi_collaborator1_registration,
  )
  const collaborator2Registered = formatPersonLabel(
    schedule.toi_collaborator2_name,
    schedule.toi_collaborator2_registration,
  )
  const excludeCollaboratorChecks = schedule.source === 'bulk_import'
  const clientPresent =
    schedule.client_present === 'sim'
      ? 'Sim'
      : schedule.client_present === 'nao'
        ? 'Não'
        : null
  const deliveryDeadlineLabel = formatDeliveryDeadlineLabel(
    lastFridayBeforeAssay(schedule.scheduled_at),
  )

  return {
    scheduleDate: {
      registered: formatAvailableSlot(schedule.scheduled_at),
      document: extractedScheduledAt?.trim() || null,
      matches: compareScheduleDates(extractedScheduledAt, formatAvailableSlot(schedule.scheduled_at)),
    },
    installation: buildEntryFieldMatch(
      schedule.installation,
      extraction?.extracted_installation ?? null,
      'instalacao',
    ),
    toi: buildEntryFieldMatch(schedule.toi, extraction?.extracted_toi ?? null, 'toi'),
    note: buildEntryFieldMatch(schedule.note, extraction?.extracted_note ?? null, 'nota'),
    csd: buildEntryFieldMatch(schedule.csd, null),
    partner: buildEntryFieldMatch(partnerRegistered, null),
    collaborator1: buildEntryFieldMatch(collaborator1Registered, null),
    collaborator2: buildEntryFieldMatch(collaborator2Registered, null),
    clientPresent: buildEntryFieldMatch(clientPresent, null),
    deliveryDeadline: buildEntryFieldMatch(deliveryDeadlineLabel, null),
    schedulingNotes: buildEntryFieldMatch(schedule.scheduling_notes, null),
    scheduleSource: schedule.source,
    excludeCollaboratorChecks,
  }
}

function evaluateInspectionDocument(
  lacre: string | null,
  meterEncontrado: string | null,
  expectedMeter: string,
  expectedLacre: string | null = null,
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
  if (normalizeMeter(meterEncontrado) !== normalizeMeter(expectedMeter)) {
    return {
      blocked: true,
      reason: `Medidor encontrado no documento (${meterEncontrado}) diverge do medidor agendado (${expectedMeter}).`,
    }
  }
  const registeredLacre = normalizeSeal(expectedLacre)
  const documentLacre = normalizeSeal(lacre)
  if (registeredLacre && documentLacre && registeredLacre !== documentLacre) {
    return {
      blocked: true,
      reason: `Lacre do invólucro no documento (${lacre}) diverge do lacre cadastrado (${expectedLacre}).`,
    }
  }
  return { blocked: false, reason: null }
}

function pickSavedWpa(saved: string | null | undefined) {
  const trimmed = saved?.trim()
  return trimmed ? trimmed : null
}

function readWpaText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

const VALID_INSPECTION_DOC_TYPES = new Set<InspectionDocumentType>(['toi', 'comunicado', 'ambos'])

async function canManageInspectionDocuments(req: Request): Promise<boolean> {
  if (req.user?.role === 'admin') return true

  const userId = req.user?.id
  if (!userId) return false

  const result = await query<{ work_area: string; work_subtype: string }>(
    `SELECT work_area, work_subtype FROM users WHERE id = $1`,
    [userId],
  )
  const row = result.rows[0]
  if (!row) return false

  const area = row.work_area?.trim() ?? ''
  const subtype = row.work_subtype?.trim().replace(/–/g, '-') ?? ''
  return area === 'Medição' && subtype === 'Laboratório de Medição'
}

async function assertInspectionDocumentDeletable(
  meterScheduleId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const schedule = await query<{ meter: string; trail_step: string }>(
    `SELECT meter, trail_step FROM meter_schedules WHERE id = $1`,
    [meterScheduleId],
  )
  if (!schedule.rows[0]) {
    return { ok: false, error: 'Agendamento não encontrado.' }
  }

  const { meter, trail_step } = schedule.rows[0]
  if (trail_step.trim() !== ENTRADA_TRAIL_STEP) {
    return {
      ok: false,
      error: 'Não é possível excluir: o medidor já teve entrada no laboratório.',
    }
  }

  const registry = await query<{ status: string }>(
    `SELECT status FROM meter_registry WHERE meter = $1`,
    [meter],
  )
  if (registry.rows[0] && hasMeterEntradaGiven(registry.rows[0].status)) {
    return {
      ok: false,
      error: 'Não é possível excluir: o medidor já teve entrada no laboratório.',
    }
  }

  return { ok: true }
}

async function findInspectionDocumentForDeletion(meterScheduleId: string, docType: string) {
  const scheduleIds = await listEntradaScheduleIdsForSchedule(meterScheduleId)
  const ids = scheduleIds.length ? scheduleIds : [meterScheduleId]
  const result = await query<{ id: string; file_name: string; meter_schedule_id: string }>(
    `SELECT id, file_name, meter_schedule_id
     FROM meter_inspection_documents
     WHERE meter_schedule_id = ANY($1::text[]) AND doc_type = $2`,
    [ids, docType],
  )
  return result.rows[0] ?? null
}

async function resolveCanonicalEntradaScheduleId(meterScheduleId: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    `SELECT DISTINCT ON (${NORMALIZED_METER_SQL}) id
     FROM meter_schedules
     WHERE trail_step = $2
       AND ${NORMALIZED_METER_SQL} = (
         SELECT ${NORMALIZED_METER_SQL} FROM meter_schedules WHERE id = $1
       )
     ORDER BY ${NORMALIZED_METER_SQL}, created_at DESC`,
    [meterScheduleId, ENTRADA_TRAIL_STEP],
  )
  return result.rows[0]?.id ?? null
}

async function listEntradaScheduleIdsForSchedule(meterScheduleId: string): Promise<string[]> {
  const result = await query<{ id: string }>(
    `SELECT id
     FROM meter_schedules
     WHERE trail_step = $2
       AND ${NORMALIZED_METER_SQL} = (
         SELECT ${NORMALIZED_METER_SQL} FROM meter_schedules WHERE id = $1
       )`,
    [meterScheduleId, ENTRADA_TRAIL_STEP],
  )
  return result.rows.map((row) => row.id)
}

async function loadDocTypePresence(meterScheduleId: string) {
  const scheduleIds = await listEntradaScheduleIdsForSchedule(meterScheduleId)
  const ids = scheduleIds.length ? scheduleIds : [meterScheduleId]
  const result = await query<{ doc_type: InspectionDocumentType }>(
    `SELECT doc_type FROM meter_inspection_documents WHERE meter_schedule_id = ANY($1::text[])`,
    [ids],
  )
  const types = new Set(result.rows.map((row) => row.doc_type))
  const hasToi = types.has('toi') || types.has('ambos')
  const hasComunicado = types.has('comunicado') || types.has('ambos')
  return { hasToi, hasComunicado, complete: hasToi && hasComunicado }
}

export async function uploadInspectionDocument(req: Request, res: Response) {
  const requestedScheduleId = typeof req.params.id === 'string' ? req.params.id : ''
  const { fileName, fileBase64 } = req.body as { fileName?: string; fileBase64?: string }

  if (!fileName?.trim() || !fileBase64?.trim()) {
    res.status(400).json({ error: 'Envie o documento de inspeção.' })
    return
  }

  const canonicalScheduleId = await resolveCanonicalEntradaScheduleId(requestedScheduleId)
  const meterScheduleId = canonicalScheduleId ?? requestedScheduleId

  const schedule = await query<{
    id: string
    meter: string
    csd: string
    envelope_seal: string
    cover_seal: string
    meter_reading: string
    installation: string
    toi: string
    note: string
    source: string
    delay_dismissed_at: Date | null
  }>(
    `SELECT id, meter, csd, envelope_seal, cover_seal, meter_reading, installation, toi, note, source, delay_dismissed_at FROM meter_schedules WHERE id = $1`,
    [meterScheduleId],
  )
  if (!schedule.rows[0]) {
    res.status(404).json({ error: 'Agendamento não encontrado.' })
    return
  }

  if (schedule.rows[0].delay_dismissed_at) {
    res.status(400).json({
      error: 'Este medidor foi excluído da lista e não recebe mais documentos.',
    })
    return
  }

  if (req.user?.id && req.user.role !== 'admin') {
    const allowedCsdNames = await resolvePontoFocalCsdNames(req.user.id)
    if (allowedCsdNames !== null) {
      const scheduleCsd = schedule.rows[0].csd.trim().toUpperCase()
      if (!allowedCsdNames.some((name) => name.toUpperCase() === scheduleCsd)) {
        res.status(403).json({
          error: 'Você só pode anexar documentos dos CSDs em que é responsável.',
        })
        return
      }
    }
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
    if (!text.trim()) {
      res.status(400).json({
        error:
          'Não foi possível ler o PDF (texto ilegível ou documento exportado como imagem). Aguarde alguns segundos e tente novamente; se persistir, exporte o TOI/CSM novamente pelo sistema da EDP com texto selecionável.',
      })
      return
    }

    res.status(400).json({
      error:
        'O conteúdo do PDF não foi reconhecido como TOI ou CSM. A validação usa apenas o texto interno do documento, não o nome do arquivo.',
    })
    return
  }

  let evaluation: InspectionEvaluation = { blocked: false, reason: null }
  let extractedMeter: string | null = null
  let extractedMeterRetirado: string | null = null
  let extractedLacre: string | null = null
  let extractedCoverSeal: string | null = null
  let extractedReading: string | null = null
  let extractedScheduledAt: string | null = null
  let extractedInstallation: string | null = null
  let extractedToi: string | null = null
  let extractedNote: string | null = null

  const parsed = parseInspectionText(text)
  extractedScheduledAt = parsed.scheduledAt
  extractedMeterRetirado = parsed.meterRetirado
  if (docType === 'toi' || docType === 'ambos') {
    extractedMeter = parsed.meterEncontrado
    extractedLacre = parsed.lacre
    extractedCoverSeal = parsed.coverSeal
    extractedReading = parsed.reading
    extractedInstallation = parsed.installation
    extractedToi = parsed.toi
    extractedNote = parsed.note
    evaluation = evaluateInspectionDocument(
      parsed.lacre,
      parsed.meterEncontrado,
      schedule.rows[0].meter,
      schedule.rows[0].envelope_seal || null,
    )
  } else if (docType === 'comunicado') {
    extractedLacre = parsed.lacre
    evaluation = evaluateInspectionDocument(
      parsed.lacre,
      parsed.meterRetirado,
      schedule.rows[0].meter,
      schedule.rows[0].envelope_seal || null,
    )
  }

  const id = `inspdoc-${Date.now()}-${meterScheduleId}-${docType}`

  const insert = await query<Omit<InspectionDocumentRow, 'created_by_registration'>>(
    `INSERT INTO meter_inspection_documents (
      id, meter_schedule_id, doc_type, file_name, file_data,
      extracted_meter, extracted_meter_retirado, extracted_lacre, extracted_cover_seal, extracted_reading,
      extracted_scheduled_at, extracted_installation, extracted_toi, extracted_note,
      blocked, block_reason, created_by_user_id
    )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (meter_schedule_id, doc_type) DO UPDATE SET
       file_name = EXCLUDED.file_name,
       file_data = EXCLUDED.file_data,
       extracted_meter = EXCLUDED.extracted_meter,
       extracted_meter_retirado = EXCLUDED.extracted_meter_retirado,
       extracted_lacre = EXCLUDED.extracted_lacre,
       extracted_cover_seal = EXCLUDED.extracted_cover_seal,
       extracted_reading = EXCLUDED.extracted_reading,
       extracted_scheduled_at = EXCLUDED.extracted_scheduled_at,
       extracted_installation = EXCLUDED.extracted_installation,
       extracted_toi = EXCLUDED.extracted_toi,
       extracted_note = EXCLUDED.extracted_note,
       blocked = EXCLUDED.blocked,
       block_reason = EXCLUDED.block_reason,
       created_at = NOW(),
       created_by_user_id = EXCLUDED.created_by_user_id
     RETURNING id, meter_schedule_id, doc_type, file_name, extracted_meter, extracted_meter_retirado,
               extracted_lacre, extracted_cover_seal, extracted_reading, extracted_scheduled_at,
               extracted_installation, extracted_toi, extracted_note,
               blocked, block_reason, created_at, created_by_user_id`,
    [
      id,
      meterScheduleId,
      docType,
      fileName.trim(),
      fileBuffer,
      extractedMeter,
      extractedMeterRetirado,
      extractedLacre,
      extractedCoverSeal,
      extractedReading,
      extractedScheduledAt,
      extractedInstallation,
      extractedToi,
      extractedNote,
      evaluation.blocked,
      evaluation.reason,
      req.user?.id ?? null,
    ],
  )

  const presence = await loadDocTypePresence(meterScheduleId)

  const scheduleIds = await listEntradaScheduleIdsForSchedule(meterScheduleId)
  const documentScheduleIds = scheduleIds.length ? scheduleIds : [meterScheduleId]
  const allDocuments = await query<DocumentForInspectionAggregate>(
    `SELECT doc_type, extracted_meter, extracted_meter_retirado, extracted_lacre, extracted_cover_seal, extracted_reading,
            extracted_installation, extracted_toi, extracted_note
     FROM meter_inspection_documents
     WHERE meter_schedule_id = ANY($1::text[])`,
    [documentScheduleIds],
  )
  const aggregate = aggregateInspectionForSchedule(schedule.rows[0], allDocuments.rows)

  const registeredMeter = schedule.rows[0].meter
  const registeredLacre = schedule.rows[0].envelope_seal || null
  const registeredCoverSeal = schedule.rows[0].cover_seal || null
  const registeredReading = schedule.rows[0].meter_reading || null

  const document = {
    id: insert.rows[0].id,
    meterScheduleId: insert.rows[0].meter_schedule_id,
    docType: insert.rows[0].doc_type,
    fileName: insert.rows[0].file_name,
    extractedMeter: insert.rows[0].extracted_meter,
    extractedMeterRetirado: insert.rows[0].extracted_meter_retirado,
    extractedLacre: insert.rows[0].extracted_lacre,
    extractedCoverSeal: insert.rows[0].extracted_cover_seal,
    extractedReading: insert.rows[0].extracted_reading,
    extractedScheduledAt: insert.rows[0].extracted_scheduled_at,
    registeredMeter,
    registeredLacre,
    registeredCoverSeal,
    registeredReading,
    meterMatches: compareMeter(insert.rows[0].extracted_meter, registeredMeter),
    meterRetiradoMatches: compareMeter(insert.rows[0].extracted_meter_retirado, registeredMeter),
    lacreMatches: compareSeal(insert.rows[0].extracted_lacre, registeredLacre),
    coverSealMatches: compareSeal(insert.rows[0].extracted_cover_seal, registeredCoverSeal),
    readingMatches: compareReading(insert.rows[0].extracted_reading, registeredReading),
    blocked: aggregate.anyBlocked,
    blockReason: aggregate.blockReasons,
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

function mapInspectionDocumentRow(
  row: Omit<InspectionDocumentRow, 'file_data'>,
  registration: string | null = null,
  registeredMeter: string | null = null,
  registeredLacre: string | null = null,
  registeredCoverSeal: string | null = null,
  registeredReading: string | null = null,
) {
  const evaluation =
    (row.doc_type === 'toi' || row.doc_type === 'ambos') && registeredMeter
      ? evaluateInspectionDocument(
          row.extracted_lacre,
          row.extracted_meter,
          registeredMeter,
          registeredLacre,
        )
      : row.doc_type === 'comunicado' && registeredMeter
        ? evaluateInspectionDocument(
            row.extracted_lacre,
            row.extracted_meter_retirado,
            registeredMeter,
            registeredLacre,
          )
        : { blocked: row.blocked, reason: row.block_reason }

  return {
    id: row.id,
    meterScheduleId: row.meter_schedule_id,
    docType: row.doc_type,
    fileName: row.file_name,
    extractedMeter: row.extracted_meter,
    extractedMeterRetirado: row.extracted_meter_retirado,
    extractedLacre: row.extracted_lacre,
    extractedCoverSeal: row.extracted_cover_seal,
    extractedReading: row.extracted_reading,
    extractedScheduledAt: row.extracted_scheduled_at,
    registeredMeter,
    registeredLacre,
    registeredCoverSeal,
    registeredReading,
    meterMatches: compareMeter(row.extracted_meter, registeredMeter),
    meterRetiradoMatches: compareMeter(row.extracted_meter_retirado, registeredMeter),
    lacreMatches: compareSeal(row.extracted_lacre, registeredLacre),
    coverSealMatches: compareSeal(row.extracted_cover_seal, registeredCoverSeal),
    readingMatches: compareReading(row.extracted_reading, registeredReading),
    blocked: evaluation.blocked,
    blockReason: evaluation.reason,
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name ?? null,
    createdByRegistration: registration ?? row.created_by_registration ?? null,
  }
}

async function backfillMissingExtractions(
  rows: Array<Omit<InspectionDocumentRow, 'file_data'>>,
) {
  for (const row of rows) {
    const needsSchedule = !row.extracted_scheduled_at?.trim()
    const needsRetirado = !row.extracted_meter_retirado?.trim()
    const needsCoverSeal = !row.extracted_cover_seal?.trim()
    const needsReading = !row.extracted_reading?.trim()
    if (!needsSchedule && !needsRetirado && !needsCoverSeal && !needsReading) continue

    const file = await query<{ file_data: Buffer }>(
      `SELECT file_data FROM meter_inspection_documents WHERE id = $1`,
      [row.id],
    )
    if (!file.rows[0]?.file_data) continue
    try {
      const parsed = parseInspectionText(await extractInspectionPdfText(file.rows[0].file_data))
      const assignments: string[] = []
      const values: string[] = []

      if (needsSchedule && parsed.scheduledAt) {
        assignments.push(`extracted_scheduled_at = $${assignments.length + 1}`)
        values.push(parsed.scheduledAt)
        row.extracted_scheduled_at = parsed.scheduledAt
      }
      if (needsRetirado && parsed.meterRetirado) {
        assignments.push(`extracted_meter_retirado = $${assignments.length + 1}`)
        values.push(parsed.meterRetirado)
        row.extracted_meter_retirado = parsed.meterRetirado
      }
      if (needsCoverSeal && parsed.coverSeal) {
        assignments.push(`extracted_cover_seal = $${assignments.length + 1}`)
        values.push(parsed.coverSeal)
        row.extracted_cover_seal = parsed.coverSeal
      }
      if (needsReading && parsed.reading) {
        assignments.push(`extracted_reading = $${assignments.length + 1}`)
        values.push(parsed.reading)
        row.extracted_reading = parsed.reading
      }
      if (!assignments.length) continue

      await query(
        `UPDATE meter_inspection_documents SET ${assignments.join(', ')} WHERE id = $${assignments.length + 1}`,
        [...values, row.id],
      )
    } catch (error) {
      console.error('Falha ao extrair campos do documento de inspeção:', error)
    }
  }
}

function sameNumericId(left: string | null | undefined, right: string | null | undefined) {
  const leftDigits = String(left ?? '').replace(/\D/g, '').replace(/^0+/, '')
  const rightDigits = String(right ?? '').replace(/\D/g, '').replace(/^0+/, '')
  return Boolean(leftDigits && rightDigits && leftDigits === rightDigits)
}

async function repairMeterToiCollisions(
  rows: Array<Omit<InspectionDocumentRow, 'file_data'>>,
  expectedMeter: string,
  expectedLacre: string | null,
) {
  for (const row of rows) {
    if (row.extracted_fields_manual) continue
    const meterLooksLikeToi = sameNumericId(row.extracted_meter, row.extracted_toi)
    const retiradoLooksLikeToi = sameNumericId(row.extracted_meter_retirado, row.extracted_toi)
    const blockedByMeter = Boolean(
      row.blocked && /medidor encontrado no documento/i.test(row.block_reason ?? ''),
    )
    if (!meterLooksLikeToi && !retiradoLooksLikeToi && !blockedByMeter) continue

    const file = await query<{ file_data: Buffer }>(
      `SELECT file_data FROM meter_inspection_documents WHERE id = $1`,
      [row.id],
    )
    if (!file.rows[0]?.file_data) continue
    try {
      const parsed = parseInspectionText(await extractInspectionPdfText(file.rows[0].file_data))
      const evaluation = evaluateInspectionDocument(
        parsed.lacre ?? row.extracted_lacre,
        parsed.meterEncontrado,
        expectedMeter,
        expectedLacre,
      )
      await query(
        `UPDATE meter_inspection_documents
         SET extracted_meter = $1,
             extracted_meter_retirado = $2,
             extracted_toi = COALESCE($3, extracted_toi),
             blocked = $4,
             block_reason = $5
         WHERE id = $6`,
        [
          parsed.meterEncontrado,
          parsed.meterRetirado,
          parsed.toi,
          evaluation.blocked,
          evaluation.reason,
          row.id,
        ],
      )
      row.extracted_meter = parsed.meterEncontrado
      row.extracted_meter_retirado = parsed.meterRetirado
      if (parsed.toi) row.extracted_toi = parsed.toi
      row.blocked = evaluation.blocked
      row.block_reason = evaluation.reason
    } catch (error) {
      console.error('Falha ao corrigir medidor extraído do documento de inspeção:', error)
    }
  }
}

export async function listInspectionDocuments(req: Request, res: Response) {
  const meterScheduleId = typeof req.params.id === 'string' ? req.params.id : ''

  const schedule = await query<{
    id: string
    meter: string
    envelope_seal: string
    cover_seal: string
    meter_reading: string
    source: string
    scheduled_at: Date
    inspection_wpa_meter: string | null
    inspection_wpa_lacre: string | null
    inspection_wpa_cover_seal: string | null
    inspection_wpa_reading: string | null
    inspection_observations: string | null
    envelope_photo: string | null
  }>(
    `SELECT id, meter, envelope_seal, cover_seal, meter_reading, source, scheduled_at,
            envelope_photo, inspection_wpa_meter, inspection_wpa_lacre, inspection_wpa_cover_seal,
            inspection_wpa_reading, inspection_observations
     FROM meter_schedules WHERE id = $1`,
    [meterScheduleId],
  )
  if (!schedule.rows[0]) {
    res.status(404).json({ error: 'Agendamento não encontrado.' })
    return
  }

  const registeredMeter = schedule.rows[0].meter
  const registeredLacre = schedule.rows[0].envelope_seal || null
  const registeredCoverSeal = schedule.rows[0].cover_seal || null
  const registeredReading = schedule.rows[0].meter_reading || null
  const registry = await query<{ meter: string; status: string; received_at: Date | null }>(
    `SELECT meter, status, received_at
     FROM meter_registry
     WHERE ${NORMALIZED_METER_SQL} = $1
     LIMIT 1`,
    [normalizeScheduleMeter(registeredMeter)],
  )
  const labRow = registry.rows[0]
  const labEntradaGiven = Boolean(
    labRow && (hasMeterEntradaGiven(labRow.status) || labRow.received_at),
  )
  const scheduleIds = await listEntradaScheduleIdsForSchedule(meterScheduleId)
  const documentScheduleIds = scheduleIds.length ? scheduleIds : [meterScheduleId]

  const result = await query<Omit<InspectionDocumentRow, 'file_data'>>(
    `SELECT DISTINCT ON (d.doc_type)
            d.id, d.meter_schedule_id, d.doc_type, d.file_name, d.extracted_meter, d.extracted_meter_retirado,
            d.extracted_lacre,
            d.extracted_cover_seal, d.extracted_reading, d.extracted_scheduled_at,
            d.extracted_installation, d.extracted_toi, d.extracted_note,
            d.extracted_fields_manual, d.blocked, d.block_reason, d.created_at, d.created_by_user_id,
            u.registration AS created_by_registration, u.name AS created_by_name
     FROM meter_inspection_documents d
     LEFT JOIN users u ON u.id = d.created_by_user_id
     WHERE d.meter_schedule_id = ANY($1::text[])
     ORDER BY d.doc_type, d.created_at DESC`,
    [documentScheduleIds],
  )

  const presence = await loadDocTypePresence(meterScheduleId)
  const userCanManage = await canManageInspectionDocuments(req)
  const deletable = await assertInspectionDocumentDeletable(meterScheduleId)
  const canDelete = userCanManage && deletable.ok
  const deleteBlockedReason =
    userCanManage && !deletable.ok ? deletable.error : null
  const scheduleDateLabel = formatAvailableSlot(schedule.rows[0].scheduled_at)
  const scheduleDateAdjustment = await query<{ adjusted: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM toi_schedule_deviations
       WHERE meter_schedule_id = ANY($1::text[])
     ) AS adjusted`,
    [documentScheduleIds],
  )
  const scheduleDateAdjusted = Boolean(scheduleDateAdjustment.rows[0]?.adjusted)

  await backfillMissingExtractions(result.rows)
  await repairMeterToiCollisions(
    result.rows,
    registeredMeter,
    registeredLacre,
  )

  res.json({
    meter: registeredMeter,
    registeredLacre,
    registeredCoverSeal,
    registeredReading,
    envelopePhoto: schedule.rows[0].envelope_photo?.trim() || null,
    conference: {
      campoMeter: pickSavedWpa(schedule.rows[0].inspection_wpa_meter),
      campoLacre: pickSavedWpa(schedule.rows[0].inspection_wpa_lacre),
      campoCoverSeal: pickSavedWpa(schedule.rows[0].inspection_wpa_cover_seal),
      campoReading: pickSavedWpa(schedule.rows[0].inspection_wpa_reading),
      campoScheduleDate: null,
      scheduleMeter: registeredMeter,
      scheduleLacre: registeredLacre,
      scheduleCoverSeal: registeredCoverSeal,
      scheduleReading: registeredReading,
      scheduleScheduleDate: scheduleDateLabel,
      labMeter: labEntradaGiven ? labRow?.meter ?? null : null,
      labLacre: null,
      labCoverSeal: null,
      labReading: null,
      labScheduleDate: null,
      scheduleDateAdjusted,
    },
    meterScheduleId,
    documents: result.rows.map((row) =>
      mapInspectionDocumentRow(
        row,
        row.created_by_registration,
        registeredMeter,
        registeredLacre,
        registeredCoverSeal,
        registeredReading,
      ),
    ),
    complete: presence.complete,
    hasToi: presence.hasToi,
    hasComunicado: presence.hasComunicado,
    canDelete,
    deleteBlockedReason,
    photos: await loadInspectionPhotos(meterScheduleId),
    canManagePhotos: userCanManage,
    canEditWpa: userCanManage,
    observations: schedule.rows[0].inspection_observations ?? '',
  })
}

export async function getScheduleEntryComparisons(req: Request, res: Response) {
  const meterScheduleId = typeof req.params.id === 'string' ? req.params.id : ''

  const schedule = await query<{
    id: string
    source: string
    scheduled_at: Date
    installation: string
    toi: string
    note: string
    csd: string
    partner_name: string
    partner_registration: string
    toi_collaborator1_name: string
    toi_collaborator1_registration: string
    toi_collaborator2_name: string
    toi_collaborator2_registration: string
    client_present: string
    scheduling_notes: string
  }>(
    `SELECT id, source, scheduled_at, installation, toi, note, csd,
            partner_name, partner_registration,
            toi_collaborator1_name, toi_collaborator1_registration,
            toi_collaborator2_name, toi_collaborator2_registration,
            client_present, scheduling_notes
     FROM meter_schedules WHERE id = $1`,
    [meterScheduleId],
  )
  if (!schedule.rows[0]) {
    res.status(404).json({ error: 'Agendamento não encontrado.' })
    return
  }

  const documents = await query<
    Pick<
      InspectionDocumentRow,
      | 'doc_type'
      | 'extracted_cover_seal'
      | 'extracted_reading'
      | 'extracted_scheduled_at'
      | 'extracted_installation'
      | 'extracted_toi'
      | 'extracted_note'
    >
  >(
    `SELECT doc_type, extracted_cover_seal, extracted_reading, extracted_scheduled_at,
            extracted_installation, extracted_toi, extracted_note
     FROM meter_inspection_documents
     WHERE meter_schedule_id = $1`,
    [meterScheduleId],
  )

  const comparisons = buildScheduleEntryComparisons(
    schedule.rows[0],
    pickToiExtractionRow(documents.rows),
    pickExtractedScheduledAt(documents.rows),
  )

  res.json({ meterScheduleId, comparisons })
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
  const asDownload = req.query.download === '1' || req.query.download === 'true'

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader(
    'Content-Disposition',
    `${asDownload ? 'attachment' : 'inline'}; filename="${safeName}"`,
  )
  res.send(file_data)
}

export async function deleteInspectionDocument(req: Request, res: Response) {
  const meterScheduleId = typeof req.params.id === 'string' ? req.params.id : ''
  const docType = typeof req.params.docType === 'string' ? req.params.docType : ''

  if (!VALID_INSPECTION_DOC_TYPES.has(docType as InspectionDocumentType)) {
    res.status(400).json({ error: 'Tipo de documento inválido.' })
    return
  }

  if (!(await canManageInspectionDocuments(req))) {
    res.status(403).json({
      error: 'Somente administradores e usuários do Laboratório de Medição podem excluir documentos.',
    })
    return
  }

  const deletable = await assertInspectionDocumentDeletable(meterScheduleId)
  if (!deletable.ok) {
    res.status(409).json({ error: deletable.error })
    return
  }

  const existing = await findInspectionDocumentForDeletion(meterScheduleId, docType)

  if (!existing) {
    res.status(404).json({ error: 'Documento de inspeção não encontrado.' })
    return
  }

  await query(`DELETE FROM meter_inspection_documents WHERE id = $1`, [existing.id])

  await writeAuditLog(req, {
    action: 'delete',
    entityType: 'meter_inspection_document',
    entityId: existing.id,
    summary: `Documento de inspeção (${docType}) removido do agendamento ${existing.meter_schedule_id}`,
    metadata: { meterScheduleId: existing.meter_schedule_id, docType },
  })

  res.json({ ok: true, meterScheduleId: existing.meter_schedule_id })
}

export async function listInspectionPendencias(req: Request, res: Response) {
  const forUserId =
    typeof req.query.forUserId === 'string' && req.query.forUserId.trim()
      ? req.query.forUserId.trim()
      : ''
  const scopeUserId = pontoFocalScopeUserId(req.user?.role, req.user?.id, forUserId)

  let csdNames: string[] | null = null
  if (scopeUserId) {
    csdNames = await resolvePontoFocalCsdNames(scopeUserId)
  }

  if (csdNames !== null && csdNames.length === 0) {
    res.json({ pendencias: [], pendingCount: 0, documentados: [], byScheduleId: {} })
    return
  }

  const params: unknown[] = [ENTRADA_TRAIL_STEP]
  let csdFilter = ''
  if (csdNames !== null) {
    params.push(csdNames.map((name) => name.toUpperCase()))
    csdFilter = `AND UPPER(TRIM(ms.csd)) = ANY($${params.length}::text[])`
  }

  const schedules = await query<{
    id: string
    meter: string
    installation: string
    csd: string
    scheduled_at: Date
    trail_step: string
    envelope_seal: string | null
    cover_seal: string | null
    meter_reading: string | null
    toi: string
    note: string
    source: string
    responsible_user_id: string | null
    responsible_name: string | null
    responsible_registration: string | null
    responsible_work_subtype: string | null
  }>(
    `SELECT ms.id,
            ms.meter,
            ms.installation,
            ms.csd,
            ms.scheduled_at,
            ms.trail_step,
            ms.envelope_seal,
            ms.cover_seal,
            ms.meter_reading,
            ms.toi,
            ms.note,
            ms.source,
            c.responsible_user_id,
            u.name AS responsible_name,
            u.registration AS responsible_registration,
            u.work_subtype AS responsible_work_subtype
     FROM meter_schedules ms
     LEFT JOIN csds c ON c.name = ms.csd
     LEFT JOIN users u ON u.id = c.responsible_user_id
     WHERE (ms.trail_step = $1
        OR EXISTS (
          SELECT 1 FROM meter_inspection_documents d
          WHERE d.meter_schedule_id = ms.id
        ))
     AND ms.delay_dismissed_at IS NULL
     ${csdFilter}
     ORDER BY ms.scheduled_at ASC`,
    params,
  )

  const scheduleIds = schedules.rows.map((row) => row.id)
  const documents = scheduleIds.length
    ? await query<
        DocumentForInspectionAggregate & {
          meter_schedule_id: string
        }
      >(
        `SELECT meter_schedule_id, doc_type, extracted_meter, extracted_meter_retirado, extracted_lacre,
                extracted_cover_seal, extracted_reading,
                extracted_installation, extracted_toi, extracted_note
         FROM meter_inspection_documents
         WHERE meter_schedule_id = ANY($1::text[])`,
        [scheduleIds],
      )
    : { rows: [] as Array<DocumentForInspectionAggregate & { meter_schedule_id: string }> }

  const docsByScheduleId = new Map<string, DocumentForInspectionAggregate[]>()
  for (const doc of documents.rows) {
    const list = docsByScheduleId.get(doc.meter_schedule_id) ?? []
    list.push(doc)
    docsByScheduleId.set(doc.meter_schedule_id, list)
  }

  const byScheduleId: Record<string, InspectionSummary> = {}
  const pendencias = []
  const documentados = []

  for (const row of schedules.rows) {
    const summary = aggregateInspectionForSchedule(row, docsByScheduleId.get(row.id) ?? [])
    byScheduleId[row.id] = summary

    const base = {
      id: row.id,
      meter: row.meter,
      installation: row.installation,
      toi: row.toi,
      note: row.note,
      csd: row.csd,
      scheduledAt: row.scheduled_at.toISOString(),
      trailStep: row.trail_step,
      responsibleUserId: row.responsible_user_id,
      responsibleName: row.responsible_name,
      responsibleRegistration: row.responsible_registration,
      responsibleWorkSubtype: row.responsible_work_subtype,
      missingToi: !summary.hasToi,
      missingComunicado: !summary.hasComunicado,
      hasToi: summary.hasToi,
      hasComunicado: summary.hasComunicado,
      anyBlocked: summary.anyBlocked,
      blockReasons: summary.blockReasons,
    }

    if (!(summary.hasToi && summary.hasComunicado)) {
      pendencias.push(base)
    }
    if (summary.hasToi || summary.hasComunicado) {
      documentados.push(base)
    }
  }

  res.json({
    pendencias,
    pendingCount: pendencias.length,
    documentados,
    byScheduleId,
  })
}

export async function listWpaAnalysisMeters(req: Request, res: Response) {
  const forUserId =
    typeof req.query.forUserId === 'string' && req.query.forUserId.trim()
      ? req.query.forUserId.trim()
      : ''
  const scopeUserId = pontoFocalScopeUserId(req.user?.role, req.user?.id, forUserId)

  let csdNames: string[] | null = null
  if (scopeUserId) {
    csdNames = await resolvePontoFocalCsdNames(scopeUserId)
  }

  if (csdNames !== null && csdNames.length === 0) {
    res.json({ meters: [] })
    return
  }

  const params: unknown[] = []
  let csdFilter = ''
  if (csdNames !== null) {
    params.push(csdNames.map((name) => name.toUpperCase()))
    csdFilter = `AND UPPER(TRIM(ms.csd)) = ANY($${params.length}::text[])`
  }

  const schedules = await query<{
    id: string
    meter: string
    installation: string
    csd: string
    scheduled_at: Date
    trail_step: string
    envelope_seal: string | null
    cover_seal: string | null
    meter_reading: string | null
    toi: string
    note: string
    source: string
    responsible_user_id: string | null
    responsible_name: string | null
    responsible_registration: string | null
    responsible_work_subtype: string | null
  }>(
    `SELECT ms.id,
            ms.meter,
            ms.installation,
            ms.csd,
            ms.scheduled_at,
            ms.trail_step,
            ms.envelope_seal,
            ms.cover_seal,
            ms.meter_reading,
            ms.toi,
            ms.note,
            ms.source,
            c.responsible_user_id,
            u.name AS responsible_name,
            u.registration AS responsible_registration,
            u.work_subtype AS responsible_work_subtype
     FROM meter_schedules ms
     LEFT JOIN csds c ON c.name = ms.csd
     LEFT JOIN users u ON u.id = c.responsible_user_id
     WHERE EXISTS (
       SELECT 1 FROM meter_inspection_documents d
       WHERE d.meter_schedule_id = ms.id
     )
     AND ms.delay_dismissed_at IS NULL
     ${csdFilter}
     ORDER BY ms.scheduled_at ASC`,
    params,
  )

  const scheduleIds = schedules.rows.map((row) => row.id)
  const documents = scheduleIds.length
    ? await query<
        DocumentForInspectionAggregate & {
          meter_schedule_id: string
        }
      >(
        `SELECT meter_schedule_id, doc_type, extracted_meter, extracted_meter_retirado, extracted_lacre,
                extracted_cover_seal, extracted_reading,
                extracted_installation, extracted_toi, extracted_note
         FROM meter_inspection_documents
         WHERE meter_schedule_id = ANY($1::text[])`,
        [scheduleIds],
      )
    : { rows: [] as Array<DocumentForInspectionAggregate & { meter_schedule_id: string }> }

  const docsByScheduleId = new Map<string, DocumentForInspectionAggregate[]>()
  for (const doc of documents.rows) {
    const list = docsByScheduleId.get(doc.meter_schedule_id) ?? []
    list.push(doc)
    docsByScheduleId.set(doc.meter_schedule_id, list)
  }

  const meters = []
  for (const row of schedules.rows) {
    const summary = aggregateInspectionForSchedule(row, docsByScheduleId.get(row.id) ?? [])
    if (!summary.hasToi && !summary.hasComunicado) continue

    meters.push({
      id: row.id,
      meter: row.meter,
      installation: row.installation,
      toi: row.toi,
      note: row.note,
      csd: row.csd,
      scheduledAt: row.scheduled_at.toISOString(),
      trailStep: row.trail_step,
      responsibleUserId: row.responsible_user_id,
      responsibleName: row.responsible_name,
      responsibleRegistration: row.responsible_registration,
      responsibleWorkSubtype: row.responsible_work_subtype,
      missingToi: !summary.hasToi,
      missingComunicado: !summary.hasComunicado,
      hasToi: summary.hasToi,
      hasComunicado: summary.hasComunicado,
      anyBlocked: summary.anyBlocked,
      blockReasons: summary.blockReasons,
    })
  }

  res.json({ meters })
}

const MAX_INSPECTION_PHOTOS = 20
const MAX_INSPECTION_PHOTO_CHARS = 3_500_000

type InspectionPhotoRow = {
  id: string
  file_name: string
  photo_data: string
  created_at: Date
}

function mapInspectionPhoto(row: InspectionPhotoRow) {
  return {
    id: row.id,
    fileName: row.file_name,
    photoData: row.photo_data,
    createdAt: row.created_at.toISOString(),
  }
}

async function loadInspectionPhotos(meterScheduleId: string) {
  const result = await query<InspectionPhotoRow>(
    `SELECT id, file_name, photo_data, created_at
     FROM meter_inspection_photos
     WHERE meter_schedule_id = $1
     ORDER BY created_at DESC`,
    [meterScheduleId],
  )
  return result.rows.map(mapInspectionPhoto)
}

export async function uploadInspectionPhotos(req: Request, res: Response) {
  const meterScheduleId = typeof req.params.id === 'string' ? req.params.id : ''
  if (!(await canManageInspectionDocuments(req))) {
    res.status(403).json({
      error: 'Somente administradores e usuários do Laboratório de Medição podem enviar fotos.',
    })
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

  const body = req.body as {
    photos?: Array<{ fileName?: string; photoData?: string }>
  }
  const incoming = Array.isArray(body.photos) ? body.photos : []
  if (!incoming.length) {
    res.status(400).json({ error: 'Selecione ao menos uma foto.' })
    return
  }

  const existing = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM meter_inspection_photos WHERE meter_schedule_id = $1`,
    [meterScheduleId],
  )
  const currentCount = Number(existing.rows[0]?.count ?? 0)
  if (currentCount + incoming.length > MAX_INSPECTION_PHOTOS) {
    res.status(400).json({
      error: `É possível anexar no máximo ${MAX_INSPECTION_PHOTOS} fotos por medidor.`,
    })
    return
  }

  const created = []
  for (const item of incoming) {
    const photoData = item.photoData?.trim() ?? ''
    if (!photoData.startsWith('data:image/') || photoData.length > MAX_INSPECTION_PHOTO_CHARS) {
      res.status(400).json({
        error: 'Envie imagens nítidas (JPG ou PNG) de até cerca de 2 MB.',
      })
      return
    }
    const id = `insp-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const insert = await query<InspectionPhotoRow>(
      `INSERT INTO meter_inspection_photos (
         id, meter_schedule_id, file_name, photo_data, created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, file_name, photo_data, created_at`,
      [
        id,
        meterScheduleId,
        (item.fileName ?? '').trim().slice(0, 180),
        photoData,
        req.user?.id ?? null,
      ],
    )
    created.push(mapInspectionPhoto(insert.rows[0]))
  }

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'meter_inspection_photo',
    entityId: meterScheduleId,
    summary: `${created.length} foto(s) anexada(s) à análise do agendamento ${meterScheduleId}`,
    metadata: { meterScheduleId, count: created.length },
  })

  res.status(201).json({ photos: await loadInspectionPhotos(meterScheduleId) })
}

export async function deleteInspectionPhoto(req: Request, res: Response) {
  const meterScheduleId = typeof req.params.id === 'string' ? req.params.id : ''
  const photoId = typeof req.params.photoId === 'string' ? req.params.photoId : ''

  if (!(await canManageInspectionDocuments(req))) {
    res.status(403).json({
      error: 'Somente administradores e usuários do Laboratório de Medição podem excluir fotos.',
    })
    return
  }

  const existing = await query<{ id: string }>(
    `SELECT id FROM meter_inspection_photos
     WHERE id = $1 AND meter_schedule_id = $2`,
    [photoId, meterScheduleId],
  )
  if (!existing.rows[0]) {
    res.status(404).json({ error: 'Foto não encontrada.' })
    return
  }

  await query(`DELETE FROM meter_inspection_photos WHERE id = $1`, [photoId])
  await writeAuditLog(req, {
    action: 'delete',
    entityType: 'meter_inspection_photo',
    entityId: photoId,
    summary: `Foto removida da análise do agendamento ${meterScheduleId}`,
    metadata: { meterScheduleId },
  })

  res.json({ ok: true, photos: await loadInspectionPhotos(meterScheduleId) })
}

export async function updateInspectionWpa(req: Request, res: Response) {
  const meterScheduleId = typeof req.params.id === 'string' ? req.params.id : ''

  if (!(await canManageInspectionDocuments(req))) {
    res.status(403).json({
      error: 'Somente administradores e usuários do Laboratório de Medição podem informar o WPA.',
    })
    return
  }

  const existing = await query<{ id: string }>(
    `SELECT id FROM meter_schedules WHERE id = $1`,
    [meterScheduleId],
  )
  if (!existing.rows[0]) {
    res.status(404).json({ error: 'Agendamento não encontrado.' })
    return
  }

  const meter = readWpaText(req.body?.meter)
  const lacre = readWpaText(req.body?.lacre)
  const coverSeal = readWpaText(req.body?.coverSeal)
  const reading = readWpaText(req.body?.reading)

  await query(
    `UPDATE meter_schedules
     SET inspection_wpa_meter = $2,
         inspection_wpa_lacre = $3,
         inspection_wpa_cover_seal = $4,
         inspection_wpa_reading = $5
     WHERE id = $1`,
    [meterScheduleId, meter, lacre, coverSeal, reading],
  )

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'meter_schedule',
    entityId: meterScheduleId,
    summary: `WPA informado na análise do agendamento ${meterScheduleId}`,
    metadata: { meter, lacre, coverSeal, reading },
  })

  res.json({
    ok: true,
    conference: {
      campoMeter: meter || null,
      campoLacre: lacre || null,
      campoCoverSeal: coverSeal || null,
      campoReading: reading || null,
    },
  })
}

const MAX_EXTRACTED_FIELD = 80

export async function updateInspectionExtracted(req: Request, res: Response) {
  const meterScheduleId = typeof req.params.id === 'string' ? req.params.id : ''

  if (!(await canManageInspectionDocuments(req))) {
    res.status(403).json({
      error:
        'Somente administradores e usuários do Laboratório de Medição podem editar os campos do documento.',
    })
    return
  }

  const docType = typeof req.body?.docType === 'string' ? req.body.docType.trim() : ''
  if (!VALID_INSPECTION_DOC_TYPES.has(docType as InspectionDocumentType)) {
    res.status(400).json({ error: 'Tipo de documento inválido.' })
    return
  }

  const document = await findInspectionDocumentForDeletion(meterScheduleId, docType)
  if (!document) {
    res.status(404).json({ error: 'Documento de inspeção não encontrado.' })
    return
  }

  const schedule = await query<{ meter: string; envelope_seal: string }>(
    `SELECT meter, envelope_seal FROM meter_schedules WHERE id = $1`,
    [document.meter_schedule_id],
  )
  const currentSchedule = schedule.rows[0]
  if (!currentSchedule) {
    res.status(404).json({ error: 'Agendamento não encontrado.' })
    return
  }

  const readField = (value: unknown) =>
    typeof value === 'string' ? value.trim().slice(0, MAX_EXTRACTED_FIELD) : ''

  const meter = readField(req.body?.meter) || null
  const lacre = readField(req.body?.lacre) || null
  const coverSeal = readField(req.body?.coverSeal) || null
  const reading = readField(req.body?.reading) || null
  const scheduledAt = readField(req.body?.scheduledAt) || null

  const evaluation = evaluateInspectionDocument(
    lacre,
    meter,
    currentSchedule.meter,
    currentSchedule.envelope_seal || null,
  )

  const updated = await query<{
    extracted_meter: string | null
    extracted_meter_retirado: string | null
    extracted_lacre: string | null
    extracted_cover_seal: string | null
    extracted_reading: string | null
    extracted_scheduled_at: string | null
    blocked: boolean
    block_reason: string | null
  }>(
    `UPDATE meter_inspection_documents
     SET extracted_meter = $2,
         extracted_meter_retirado = $3,
         extracted_lacre = $4,
         extracted_cover_seal = $5,
         extracted_reading = $6,
         extracted_scheduled_at = $7,
         extracted_fields_manual = TRUE,
         blocked = $8,
         block_reason = $9
     WHERE id = $1
     RETURNING extracted_meter, extracted_meter_retirado, extracted_lacre, extracted_cover_seal,
               extracted_reading, extracted_scheduled_at, blocked, block_reason`,
    [
      document.id,
      meter,
      meter,
      lacre,
      coverSeal,
      reading,
      scheduledAt,
      evaluation.blocked,
      evaluation.reason,
    ],
  )
  const row = updated.rows[0]

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'meter_inspection_document',
    entityId: document.id,
    summary: `Campos do documento de inspeção (${docType}) ajustados no agendamento ${meterScheduleId}`,
    metadata: { meter, lacre, coverSeal, reading, scheduledAt },
  })

  res.json({
    ok: true,
    document: {
      extractedMeter: row?.extracted_meter ?? meter,
      extractedMeterRetirado: row?.extracted_meter_retirado ?? meter,
      extractedLacre: row?.extracted_lacre ?? lacre,
      extractedCoverSeal: row?.extracted_cover_seal ?? coverSeal,
      extractedReading: row?.extracted_reading ?? reading,
      extractedScheduledAt: row?.extracted_scheduled_at ?? scheduledAt,
      blocked: row?.blocked ?? evaluation.blocked,
      blockReason: row?.block_reason ?? evaluation.reason,
    },
  })
}

const MAX_INSPECTION_OBSERVATIONS = 4000

export async function updateInspectionObservations(req: Request, res: Response) {
  const meterScheduleId = typeof req.params.id === 'string' ? req.params.id : ''

  if (!(await canManageInspectionDocuments(req))) {
    res.status(403).json({
      error: 'Somente administradores e usuários do Laboratório de Medição podem informar observações.',
    })
    return
  }

  const existing = await query<{ id: string }>(
    `SELECT id FROM meter_schedules WHERE id = $1`,
    [meterScheduleId],
  )
  if (!existing.rows[0]) {
    res.status(404).json({ error: 'Agendamento não encontrado.' })
    return
  }

  const observations = typeof req.body?.observations === 'string'
    ? req.body.observations.trim().slice(0, MAX_INSPECTION_OBSERVATIONS)
    : ''

  await query(
    `UPDATE meter_schedules SET inspection_observations = $2 WHERE id = $1`,
    [meterScheduleId, observations],
  )

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'meter_schedule',
    entityId: meterScheduleId,
    summary: `Observações da análise atualizadas no agendamento ${meterScheduleId}`,
    metadata: { observationsLength: observations.length },
  })

  res.json({ ok: true, observations })
}

const SCHEDULE_DATE_DEVIATION_DESCRIPTION =
  'Data/horário de agendamento cadastrado no sistema diferente do inserido no documento'

type ToiScheduleDeviationRow = {
  id: string
  meter_schedule_id: string
  meter: string
  kind: string
  description: string
  scheduled_label: string
  document_label: string
  previous_scheduled_at: Date
  adjusted_scheduled_at: Date
  collaborator1_name: string
  collaborator1_registration: string
  collaborator2_name: string
  collaborator2_registration: string
  created_at: Date
  created_by_user_id: string | null
  created_by_name: string | null
  created_by_registration: string | null
  physically_adjusted_at: Date | null
  physically_adjusted_by_user_id: string | null
  physically_adjusted_by_name: string | null
  physically_adjusted_by_registration: string | null
}

const SCHEDULE_DATE_DEVIATION_SELECT = `
  SELECT d.*,
         u.name AS created_by_name,
         u.registration AS created_by_registration,
         p.name AS physically_adjusted_by_name,
         p.registration AS physically_adjusted_by_registration
  FROM toi_schedule_deviations d
  LEFT JOIN users u ON u.id = d.created_by_user_id
  LEFT JOIN users p ON p.id = d.physically_adjusted_by_user_id
`

function toIsoOrNull(value: Date | string | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function mapScheduleDateAdjustment(row: ToiScheduleDeviationRow) {
  return {
    id: row.id,
    meterScheduleId: row.meter_schedule_id,
    meter: row.meter,
    kind: row.kind,
    description: row.description,
    scheduledLabel: row.scheduled_label,
    documentLabel: row.document_label,
    previousScheduledAt: row.previous_scheduled_at.toISOString(),
    adjustedScheduledAt: row.adjusted_scheduled_at.toISOString(),
    collaborator1Name: row.collaborator1_name,
    collaborator1Registration: row.collaborator1_registration,
    collaborator2Name: row.collaborator2_name,
    collaborator2Registration: row.collaborator2_registration,
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    createdByRegistration: row.created_by_registration,
    physicallyAdjustedAt: toIsoOrNull(row.physically_adjusted_at),
    physicallyAdjustedByUserId: row.physically_adjusted_by_user_id,
    physicallyAdjustedByName: row.physically_adjusted_by_name,
    physicallyAdjustedByRegistration: row.physically_adjusted_by_registration,
  }
}

async function loadScheduleDateAdjustment(id: string) {
  const result = await query<ToiScheduleDeviationRow>(
    `${SCHEDULE_DATE_DEVIATION_SELECT} WHERE d.id = $1`,
    [id],
  )
  const row = result.rows[0]
  return row ? mapScheduleDateAdjustment(row) : null
}

export async function adjustScheduleDateFromDocument(req: Request, res: Response) {
  const meterScheduleId = typeof req.params.id === 'string' ? req.params.id : ''

  if (!(await canManageInspectionDocuments(req))) {
    res.status(403).json({
      error: 'Somente administradores e usuários do Laboratório de Medição podem ajustar a data.',
    })
    return
  }

  const requestedDocType =
    typeof req.body?.docType === 'string' ? req.body.docType.trim() : ''

  const schedule = await query<{
    id: string
    meter: string
    scheduled_at: Date
    toi_collaborator1_name: string
    toi_collaborator1_registration: string
    toi_collaborator2_name: string
    toi_collaborator2_registration: string
  }>(
    `SELECT id, meter, scheduled_at,
            toi_collaborator1_name, toi_collaborator1_registration,
            toi_collaborator2_name, toi_collaborator2_registration
     FROM meter_schedules WHERE id = $1`,
    [meterScheduleId],
  )
  const current = schedule.rows[0]
  if (!current) {
    res.status(404).json({ error: 'Agendamento não encontrado.' })
    return
  }

  const documents = await query<{
    doc_type: string
    extracted_scheduled_at: string | null
  }>(
    `SELECT doc_type, extracted_scheduled_at
     FROM meter_inspection_documents
     WHERE meter_schedule_id = $1
     ORDER BY created_at DESC`,
    [meterScheduleId],
  )
  const preferred =
    documents.rows.find((row) => row.doc_type === requestedDocType && row.extracted_scheduled_at) ??
    documents.rows.find((row) => row.extracted_scheduled_at?.trim())
  const documentLabel = preferred?.extracted_scheduled_at?.trim() ?? ''
  const nextDate = parseExtractedScheduleLabel(documentLabel)
  if (!nextDate) {
    res.status(400).json({
      error: 'Não foi possível ler data e horário completos no documento.',
    })
    return
  }

  const previousLabel = formatAvailableSlot(current.scheduled_at)
  const nextLabel = formatAvailableSlot(nextDate)
  if (previousLabel === nextLabel) {
    res.status(400).json({ error: 'A data do agendamento já confere com o documento.' })
    return
  }

  const update = await query<{ scheduled_at: Date }>(
    `UPDATE meter_schedules
     SET scheduled_at = $1
     WHERE id = $2
     RETURNING scheduled_at`,
    [nextDate.toISOString(), meterScheduleId],
  )
  const updatedAt = update.rows[0]?.scheduled_at ?? nextDate

  await query(`UPDATE meter_registry SET scheduled_at = $1 WHERE meter = $2`, [
    updatedAt.toISOString(),
    current.meter,
  ])

  const deviationId = `sched-date-${Date.now()}-${current.meter}`
  const inserted = await query<ToiScheduleDeviationRow>(
    `INSERT INTO toi_schedule_deviations (
       id, meter_schedule_id, meter, kind, description,
       scheduled_label, document_label, previous_scheduled_at, adjusted_scheduled_at,
       collaborator1_name, collaborator1_registration,
       collaborator2_name, collaborator2_registration, created_by_user_id
     ) VALUES ($1,$2,$3,'schedule_date_mismatch',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      deviationId,
      meterScheduleId,
      current.meter,
      SCHEDULE_DATE_DEVIATION_DESCRIPTION,
      previousLabel,
      documentLabel,
      current.scheduled_at.toISOString(),
      updatedAt.toISOString(),
      current.toi_collaborator1_name ?? '',
      current.toi_collaborator1_registration ?? '',
      current.toi_collaborator2_name ?? '',
      current.toi_collaborator2_registration ?? '',
      req.user?.id ?? null,
    ],
  )

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'meter_schedule',
    entityId: meterScheduleId,
    summary: `Medidor ${current.meter} teve a data de agendamento ajustada de ${previousLabel} para ${nextLabel}. ${SCHEDULE_DATE_DEVIATION_DESCRIPTION}. Agendado: ${previousLabel}. Documento: ${documentLabel}.`,
    oldData: {
      meter: current.meter,
      scheduledAt: current.scheduled_at.toISOString(),
      scheduledAtLabel: previousLabel,
    },
    newData: {
      meter: current.meter,
      scheduledAt: updatedAt.toISOString(),
      scheduledAtLabel: nextLabel,
    },
    metadata: {
      meter: current.meter,
      kind: 'schedule_date_adjustment',
      justification: `${SCHEDULE_DATE_DEVIATION_DESCRIPTION}. Agendado: ${previousLabel}. Documento: ${documentLabel}.`,
      previousScheduledAt: current.scheduled_at.toISOString(),
      previousScheduledAtLabel: previousLabel,
      newScheduledAt: updatedAt.toISOString(),
      newScheduledAtLabel: nextLabel,
      documentLabel,
    },
  })

  res.json({
    ok: true,
    scheduleDateLabel: nextLabel,
    adjustment: inserted.rows[0]
      ? mapScheduleDateAdjustment({
          ...inserted.rows[0],
          created_by_name: null,
          created_by_registration: req.user?.registration ?? null,
          physically_adjusted_at: inserted.rows[0].physically_adjusted_at ?? null,
          physically_adjusted_by_user_id:
            inserted.rows[0].physically_adjusted_by_user_id ?? null,
          physically_adjusted_by_name: null,
          physically_adjusted_by_registration: null,
        })
      : null,
  })
}

export async function listScheduleDateAdjustments(req: Request, res: Response) {
  const scope = typeof req.query.scope === 'string' ? req.query.scope.trim() : 'all'
  const mine = scope === 'mine'
  const registration = (req.user?.registration ?? '').trim().toUpperCase()

  if (mine && !registration) {
    res.json({ adjustments: [], history: [], total: 0, historyTotal: 0 })
    return
  }

  const scopeFilter = `
     WHERE (
       $1 = false
       OR UPPER(TRIM(d.collaborator1_registration)) = $2
       OR UPPER(TRIM(d.collaborator2_registration)) = $2
     )`

  const [pendingResult, historyResult] = await Promise.all([
    query<ToiScheduleDeviationRow>(
      `${SCHEDULE_DATE_DEVIATION_SELECT}
       ${scopeFilter}
         AND d.physically_adjusted_at IS NULL
       ORDER BY d.created_at DESC
       LIMIT 500`,
      [mine, registration],
    ),
    query<ToiScheduleDeviationRow>(
      `${SCHEDULE_DATE_DEVIATION_SELECT}
       ${scopeFilter}
         AND d.physically_adjusted_at IS NOT NULL
       ORDER BY d.physically_adjusted_at DESC
       LIMIT 500`,
      [mine, registration],
    ),
  ])

  const adjustments = pendingResult.rows.map(mapScheduleDateAdjustment)
  const history = historyResult.rows.map(mapScheduleDateAdjustment)
  res.json({
    adjustments,
    history,
    total: adjustments.length,
    historyTotal: history.length,
  })
}

export async function markScheduleDatePhysicallyAdjusted(req: Request, res: Response) {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : ''
  if (!id) {
    res.status(400).json({ error: 'Informe o apontamento de alteração de data.' })
    return
  }

  if (!(await canManageInspectionDocuments(req))) {
    res.status(403).json({
      error: 'Somente administradores e usuários do Laboratório de Medição podem marcar o ajuste físico.',
    })
    return
  }

  const existing = await query<{
    id: string
    meter: string
    meter_schedule_id: string
    physically_adjusted_at: Date | null
  }>(
    `SELECT id, meter, meter_schedule_id, physically_adjusted_at
     FROM toi_schedule_deviations
     WHERE id = $1`,
    [id],
  )
  const current = existing.rows[0]
  if (!current) {
    res.status(404).json({ error: 'Apontamento de alteração de data não encontrado.' })
    return
  }
  if (current.physically_adjusted_at) {
    res.status(400).json({ error: 'Este apontamento já foi marcado como ajustado fisicamente.' })
    return
  }

  const updated = await query<{ id: string }>(
    `UPDATE toi_schedule_deviations
     SET physically_adjusted_at = NOW(),
         physically_adjusted_by_user_id = $2
     WHERE id = $1 AND physically_adjusted_at IS NULL
     RETURNING id`,
    [id, req.user?.id ?? null],
  )
  if (!updated.rows[0]) {
    res.status(400).json({ error: 'Este apontamento já foi marcado como ajustado fisicamente.' })
    return
  }

  const adjustment = await loadScheduleDateAdjustment(id)
  if (!adjustment) {
    res.status(500).json({ error: 'Não foi possível carregar o apontamento atualizado.' })
    return
  }

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'meter_schedule',
    entityId: current.meter_schedule_id,
    summary: `Medidor ${current.meter} marcado como ajustado fisicamente na alteração de data.`,
    oldData: {
      meter: current.meter,
      physicallyAdjustedAt: null,
    },
    newData: {
      meter: current.meter,
      physicallyAdjustedAt: adjustment.physicallyAdjustedAt,
      physicallyAdjustedByUserId: adjustment.physicallyAdjustedByUserId,
      physicallyAdjustedByName: adjustment.physicallyAdjustedByName,
      physicallyAdjustedByRegistration: adjustment.physicallyAdjustedByRegistration,
    },
    metadata: {
      meter: current.meter,
      kind: 'schedule_date_physical_adjustment',
      deviationId: id,
    },
  })

  res.json({ ok: true, adjustment })
}
