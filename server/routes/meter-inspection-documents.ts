import type { Request, Response } from 'express'
import { query } from '../db.js'
import { writeAuditLog } from '../audit.js'
import { NORMALIZED_METER_SQL } from '../demm-meter-analysis.js'
import { ENTRADA_TRAIL_STEP, hasMeterEntradaGiven } from '../lab-trail-status.js'
import {
  classifyInspectionDocument,
  extractInspectionPdfText,
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

const MAX_FILE_BYTES = 10 * 1024 * 1024

type InspectionDocumentRow = {
  id: string
  meter_schedule_id: string
  doc_type: InspectionDocumentType
  file_name: string
  file_data: Buffer
  extracted_meter: string | null
  extracted_lacre: string | null
  extracted_installation: string | null
  extracted_toi: string | null
  extracted_note: string | null
  blocked: boolean
  block_reason: string | null
  created_at: Date
  created_by_user_id: string | null
  created_by_registration: string | null
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

export type InspectionSummary = {
  hasToi: boolean
  hasComunicado: boolean
  anyBlocked: boolean
  blockReasons: string | null
}

type ScheduleForInspectionAggregate = {
  meter: string
  envelope_seal: string | null
  installation: string
  toi: string
  note: string
  source: string
}

type DocumentForInspectionAggregate = Pick<
  InspectionDocumentRow,
  | 'doc_type'
  | 'extracted_meter'
  | 'extracted_lacre'
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
    installation: string
    toi: string
    note: string
    source: string
    created_at: Date
    doc_type: InspectionDocumentType | null
    extracted_meter: string | null
    extracted_lacre: string | null
    extracted_installation: string | null
    extracted_toi: string | null
    extracted_note: string | null
  }>(
    `SELECT ms_norm.norm,
            ms.id,
            ms.meter,
            ms.envelope_seal,
            ms.installation,
            ms.toi,
            ms.note,
            ms.source,
            ms.created_at,
            d.doc_type,
            d.extracted_meter,
            d.extracted_lacre,
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
        extracted_lacre: row.extracted_lacre,
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
    scheduleDate: buildEntryFieldMatch(formatAvailableSlot(schedule.scheduled_at), null),
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
    envelope_seal: string
    installation: string
    toi: string
    note: string
    source: string
  }>(
    `SELECT id, meter, envelope_seal, installation, toi, note, source FROM meter_schedules WHERE id = $1`,
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
  let extractedLacre: string | null = null
  let extractedInstallation: string | null = null
  let extractedToi: string | null = null
  let extractedNote: string | null = null

  if (docType === 'toi' || docType === 'ambos') {
    const parsed = parseInspectionText(text)
    extractedMeter = parsed.meterEncontrado
    extractedLacre = parsed.lacre
    extractedInstallation = parsed.installation
    extractedToi = parsed.toi
    extractedNote = parsed.note
    evaluation = evaluateInspectionDocument(
      parsed.lacre,
      parsed.meterEncontrado,
      schedule.rows[0].meter,
      schedule.rows[0].envelope_seal || null,
    )
  }

  const id = `inspdoc-${Date.now()}-${meterScheduleId}-${docType}`

  const insert = await query<Omit<InspectionDocumentRow, 'created_by_registration'>>(
    `INSERT INTO meter_inspection_documents (
      id, meter_schedule_id, doc_type, file_name, file_data,
      extracted_meter, extracted_lacre, extracted_installation, extracted_toi, extracted_note,
      blocked, block_reason, created_by_user_id
    )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (meter_schedule_id, doc_type) DO UPDATE SET
       file_name = EXCLUDED.file_name,
       file_data = EXCLUDED.file_data,
       extracted_meter = EXCLUDED.extracted_meter,
       extracted_lacre = EXCLUDED.extracted_lacre,
       extracted_installation = EXCLUDED.extracted_installation,
       extracted_toi = EXCLUDED.extracted_toi,
       extracted_note = EXCLUDED.extracted_note,
       blocked = EXCLUDED.blocked,
       block_reason = EXCLUDED.block_reason,
       created_at = NOW(),
       created_by_user_id = EXCLUDED.created_by_user_id
     RETURNING id, meter_schedule_id, doc_type, file_name, extracted_meter, extracted_lacre,
               extracted_installation, extracted_toi, extracted_note,
               blocked, block_reason, created_at, created_by_user_id`,
    [
      id,
      meterScheduleId,
      docType,
      fileName.trim(),
      fileBuffer,
      extractedMeter,
      extractedLacre,
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
    `SELECT doc_type, extracted_meter, extracted_lacre, extracted_installation, extracted_toi, extracted_note
     FROM meter_inspection_documents
     WHERE meter_schedule_id = ANY($1::text[])`,
    [documentScheduleIds],
  )
  const aggregate = aggregateInspectionForSchedule(schedule.rows[0], allDocuments.rows)

  const registeredMeter = schedule.rows[0].meter
  const registeredLacre = schedule.rows[0].envelope_seal || null

  const document = {
    id: insert.rows[0].id,
    meterScheduleId: insert.rows[0].meter_schedule_id,
    docType: insert.rows[0].doc_type,
    fileName: insert.rows[0].file_name,
    extractedMeter: insert.rows[0].extracted_meter,
    extractedLacre: insert.rows[0].extracted_lacre,
    registeredMeter,
    registeredLacre,
    meterMatches: compareMeter(insert.rows[0].extracted_meter, registeredMeter),
    lacreMatches: compareSeal(insert.rows[0].extracted_lacre, registeredLacre),
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
  row: Omit<InspectionDocumentRow, 'file_data' | 'created_by_registration'>,
  registration: string | null = null,
  registeredMeter: string | null = null,
  registeredLacre: string | null = null,
) {
  const evaluation =
    (row.doc_type === 'toi' || row.doc_type === 'ambos') && registeredMeter
      ? evaluateInspectionDocument(
          row.extracted_lacre,
          row.extracted_meter,
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
    extractedLacre: row.extracted_lacre,
    registeredMeter,
    registeredLacre,
    meterMatches: compareMeter(row.extracted_meter, registeredMeter),
    lacreMatches: compareSeal(row.extracted_lacre, registeredLacre),
    blocked: evaluation.blocked,
    blockReason: evaluation.reason,
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
    createdByRegistration: registration,
  }
}

export async function listInspectionDocuments(req: Request, res: Response) {
  const meterScheduleId = typeof req.params.id === 'string' ? req.params.id : ''

  const schedule = await query<{ id: string; meter: string; envelope_seal: string }>(
    `SELECT id, meter, envelope_seal FROM meter_schedules WHERE id = $1`,
    [meterScheduleId],
  )
  if (!schedule.rows[0]) {
    res.status(404).json({ error: 'Agendamento não encontrado.' })
    return
  }

  const registeredMeter = schedule.rows[0].meter
  const registeredLacre = schedule.rows[0].envelope_seal || null
  const scheduleIds = await listEntradaScheduleIdsForSchedule(meterScheduleId)
  const documentScheduleIds = scheduleIds.length ? scheduleIds : [meterScheduleId]

  const result = await query<Omit<InspectionDocumentRow, 'file_data'>>(
    `SELECT DISTINCT ON (doc_type)
            id, meter_schedule_id, doc_type, file_name, extracted_meter, extracted_lacre,
            extracted_installation, extracted_toi, extracted_note,
            blocked, block_reason, created_at, created_by_user_id
     FROM meter_inspection_documents
     WHERE meter_schedule_id = ANY($1::text[])
     ORDER BY doc_type, created_at DESC`,
    [documentScheduleIds],
  )

  const presence = await loadDocTypePresence(meterScheduleId)
  const userCanManage = await canManageInspectionDocuments(req)
  const deletable = await assertInspectionDocumentDeletable(meterScheduleId)
  const canDelete = userCanManage && deletable.ok
  const deleteBlockedReason =
    userCanManage && !deletable.ok ? deletable.error : null

  res.json({
    meter: registeredMeter,
    registeredLacre,
    meterScheduleId,
    documents: result.rows.map((row) =>
      mapInspectionDocumentRow(row, null, registeredMeter, registeredLacre),
    ),
    complete: presence.complete,
    hasToi: presence.hasToi,
    hasComunicado: presence.hasComunicado,
    canDelete,
    deleteBlockedReason,
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
      'doc_type' | 'extracted_installation' | 'extracted_toi' | 'extracted_note'
    >
  >(
    `SELECT doc_type, extracted_installation, extracted_toi, extracted_note
     FROM meter_inspection_documents
     WHERE meter_schedule_id = $1`,
    [meterScheduleId],
  )

  const comparisons = buildScheduleEntryComparisons(
    schedule.rows[0],
    pickToiExtractionRow(documents.rows),
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

export async function listInspectionPendencias(_req: Request, res: Response) {
  const schedules = await query<{
    id: string
    meter: string
    installation: string
    csd: string
    scheduled_at: Date
    trail_step: string
    envelope_seal: string | null
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
     WHERE ms.trail_step = $1
        OR EXISTS (
          SELECT 1 FROM meter_inspection_documents d
          WHERE d.meter_schedule_id = ms.id
        )
     ORDER BY ms.scheduled_at ASC`,
    [ENTRADA_TRAIL_STEP],
  )

  const scheduleIds = schedules.rows.map((row) => row.id)
  const documents = scheduleIds.length
    ? await query<
        DocumentForInspectionAggregate & {
          meter_schedule_id: string
        }
      >(
        `SELECT meter_schedule_id, doc_type, extracted_meter, extracted_lacre,
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

  for (const row of schedules.rows) {
    const summary = aggregateInspectionForSchedule(row, docsByScheduleId.get(row.id) ?? [])
    byScheduleId[row.id] = summary

    if (!(summary.hasToi && summary.hasComunicado)) {
      pendencias.push({
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
        missingToi: !summary.hasToi,
        missingComunicado: !summary.hasComunicado,
      })
    }
  }

  res.json({ pendencias, pendingCount: pendencias.length, byScheduleId })
}
