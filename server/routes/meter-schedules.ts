import type { Request, Response } from 'express'
import { query } from '../db.js'
import { writeAuditLog } from '../audit.js'
import { validateScheduleNumericField } from '../numeric-field-validation.js'
import { fixBulkScheduleCollaboratorsFromCsv, fixBulkScheduleCsdFromCsv, fixBulkScheduleDigitsFromCsv, fixBulkScheduleNotesFromCsv, fixBulkScheduleUsersFromCsv, importMeterSchedulesFromCsv } from '../import-meter-schedules-bulk.js'
import {
  findNextAvailableSlot,
  formatAvailableSlot,
  isScheduleDayBlocked,
} from '../schedule-slots.js'
import { toDateKey } from '../brazilian-holidays.js'
import {
  formatDeliveryDeadlineLabel,
  isMeterDeliveryLate,
  lastFridayBeforeAssay,
  toCalendarDate,
} from '../delivery-deadline.js'
import {
  PONTO_FOCAL_SCOPE,
  pontoFocalScopeUserId,
  resolvePontoFocalCsdNames,
} from '../ponto-focal-csds.js'

export const ENTRADA_TRAIL_STEP = 'Entrada de medidores'
const BACKOFFICE_SCOPE = 'Lavratura de TOI - Backoffice'

type MeterScheduleRow = {
  id: string
  meter: string
  installation: string
  toi: string
  note: string
  csd: string
  client_present: 'sim' | 'nao'
  scheduling_notes: string
  toi_collaborator1_name: string
  toi_collaborator1_registration: string
  toi_collaborator2_name: string
  toi_collaborator2_registration: string
  toi_team_reason: string
  partner_user_id: string | null
  partner_name: string
  partner_registration: string
  envelope_photo: string
  envelope_seal: string
  scheduled_by_name: string
  scheduling_date: string | null
  scheduled_at: Date
  trail_step: string
  source: string
  created_at: Date
  created_by_user_id: string | null
  created_by_registration: string | null
  created_by_name?: string | null
  demm_document_id?: string | null
  demm_file_name?: string | null
  demm_meter_count?: number | null
  registry_status?: string | null
  delay_justification?: string | null
}

function mapMeterSchedule(row: MeterScheduleRow) {
  const deliveryDeadlineAt = lastFridayBeforeAssay(row.scheduled_at)
  const isLate = isMeterDeliveryLate({
    scheduledAt: row.scheduled_at,
    trailStep: row.trail_step,
    entradaTrailStep: ENTRADA_TRAIL_STEP,
  })

  return {
    id: row.id,
    meter: row.meter,
    installation: row.installation,
    toi: row.toi,
    note: row.note,
    csd: row.csd,
    clientPresent: row.client_present,
    schedulingNotes: row.scheduling_notes,
    toiCollaborator1Name: row.toi_collaborator1_name || '',
    toiCollaborator1Registration: row.toi_collaborator1_registration || '',
    toiCollaborator2Name: row.toi_collaborator2_name || '',
    toiCollaborator2Registration: row.toi_collaborator2_registration || '',
    toiTeamReason: row.toi_team_reason || '',
    partnerUserId: row.partner_user_id ?? null,
    partnerName: row.partner_name || '',
    partnerRegistration: row.partner_registration || '',
    envelopePhoto: row.envelope_photo || '',
    envelopeSeal: row.envelope_seal || '',
    scheduledByName: row.scheduled_by_name || '',
    schedulingDate: row.scheduling_date,
    scheduledAt: row.scheduled_at.toISOString(),
    scheduledAtLabel: formatAvailableSlot(row.scheduled_at),
    deliveryDeadlineAt: deliveryDeadlineAt.toISOString(),
    deliveryDeadlineLabel: formatDeliveryDeadlineLabel(deliveryDeadlineAt),
    isLate,
    trailStep: row.trail_step,
    source: row.source,
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
    createdByRegistration: row.created_by_registration,
    createdByName: row.created_by_name || '',
    demmDocumentId: row.demm_document_id ?? null,
    demmFileName: row.demm_file_name ?? null,
    demmMeterCount: Number(row.demm_meter_count ?? 0),
    registryStatus: row.registry_status || '',
    delayJustification: (row.delay_justification ?? '').trim(),
  }
}

export async function listMeterSchedules(req: Request, res: Response) {
  const galleryMode =
    req.query.gallery === '1' ||
    req.query.gallery === 'true' ||
    req.query.gallery === 'yes'
  const meterSearch =
    typeof req.query.meter === 'string' && req.query.meter.trim()
      ? req.query.meter.trim()
      : ''
  const trailStep =
    typeof req.query.trailStep === 'string' && req.query.trailStep.trim()
      ? req.query.trailStep.trim()
      : ENTRADA_TRAIL_STEP
  const mineOnly =
    req.query.mine === '1' ||
    req.query.mine === 'true' ||
    req.query.mine === 'yes'
  const forUserId =
    typeof req.query.forUserId === 'string' && req.query.forUserId.trim()
      ? req.query.forUserId.trim()
      : ''

  const params: unknown[] = []
  const filters: string[] = []

  if (meterSearch) {
    params.push(meterSearch)
    filters.push(`ms.meter = $${params.length}`)
  } else if (galleryMode) {
    filters.push(`ms.envelope_photo <> ''`)
  } else {
    params.push(trailStep)
    filters.push(`ms.trail_step = $${params.length}`)
  }

  let mineFilter = ''

  if (mineOnly) {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Autenticação necessária.' })
      return
    }
    const registration = (req.user.registration ?? '').trim().toUpperCase()
    params.push(req.user.id, registration)
    const userParam = params.length - 1
    const registrationParam = params.length
    mineFilter = `
      AND (
        ms.created_by_user_id = $${userParam}
        OR UPPER(TRIM(ms.toi_collaborator1_registration)) = $${registrationParam}
        OR UPPER(TRIM(ms.toi_collaborator2_registration)) = $${registrationParam}
      )`
  } else if (!galleryMode && !meterSearch) {
    // Consultar: Ponto Focal vê só agendamentos dos CSDs atribuídos a ele.
    const scopeUserId = pontoFocalScopeUserId(req.user?.role, req.user?.id, forUserId)

    if (scopeUserId) {
      const csdNames = await resolvePontoFocalCsdNames(scopeUserId)
      if (csdNames !== null) {
        if (csdNames.length === 0) {
          res.json({ schedules: [], total: 0 })
          return
        }
        params.push(csdNames.map((name) => name.toUpperCase()))
        filters.push(`UPPER(TRIM(ms.csd)) = ANY($${params.length}::text[])`)
      }
    }
  }

  const orderBy = meterSearch
    ? `ORDER BY ms.scheduled_at DESC, ms.created_at DESC`
    : `ORDER BY ms.scheduled_at ASC, ms.created_at DESC`

  const result = await query<MeterScheduleRow>(
    `SELECT ms.*, ms.scheduling_date::text AS scheduling_date,
            u.name AS created_by_name, u.registration AS created_by_registration,
            mr.status AS registry_status,
            d.id AS demm_document_id, d.file_name AS demm_file_name,
            COALESCE(jsonb_array_length(d.extracted_meters), 0) AS demm_meter_count
     FROM meter_schedules ms
     LEFT JOIN users u ON u.id = ms.created_by_user_id
     LEFT JOIN meter_registry mr ON mr.meter = ms.meter
     LEFT JOIN LATERAL (
       SELECT id, file_name, extracted_meters
       FROM demm_documents
       WHERE meter_schedule_id = ms.id
       ORDER BY created_at DESC
       LIMIT 1
     ) d ON true
     WHERE ${filters.join(' AND ')}
     ${mineFilter}
     ${orderBy}`,
    params,
  )

  const schedules = result.rows.map(mapMeterSchedule)
  schedules.sort((a, b) => {
    if (a.isLate !== b.isLate) return a.isLate ? -1 : 1
    return (
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime() ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  })

  res.json({
    schedules,
    total: result.rowCount ?? 0,
  })
}

export async function countMeterSchedules(req: Request, res: Response) {
  const trailStep =
    typeof req.query.trailStep === 'string' && req.query.trailStep.trim()
      ? req.query.trailStep.trim()
      : ENTRADA_TRAIL_STEP

  const result = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM meter_schedules WHERE trail_step = $1`,
    [trailStep],
  )

  res.json({ total: Number(result.rows[0]?.total ?? 0), trailStep })
}

/** Parceiros: usuários aprovados com perfil Lavratura de TOI (busca por matrícula). */
export async function listFieldPartners(req: Request, res: Response) {
  const result = await query<{
    id: string
    name: string
    registration: string
  }>(
    `SELECT id, name, registration
     FROM users
     WHERE approval_status = 'approved'
       AND role <> 'admin'
       AND REPLACE(TRIM(COALESCE(work_subtype, '')), '–', '-') ILIKE 'Lavratura de TOI%'
       AND ($1::text IS NULL OR id <> $1)
     ORDER BY registration ASC, name ASC`,
    [req.user?.id ?? null],
  )

  res.json({
    partners: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      registration: row.registration,
      label: `${row.registration} — ${row.name}`,
    })),
  })
}

/** Colaboradores da equipe que lavrou o TOI: qualquer perfil de Lavratura de TOI. */
export async function listToiCollaborators(req: Request, res: Response) {
  const result = await query<{
    id: string
    name: string
    registration: string
  }>(
    `SELECT id, name, registration
     FROM users
     WHERE approval_status = 'approved'
       AND role <> 'admin'
       AND REPLACE(TRIM(COALESCE(work_subtype, '')), '–', '-') ILIKE 'Lavratura de TOI%'
       AND ($1::text IS NULL OR id <> $1)
     ORDER BY registration ASC, name ASC`,
    [req.user?.id ?? null],
  )

  res.json({
    users: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      registration: row.registration,
      label: `${row.registration} — ${row.name}`,
    })),
  })
}

export async function createMeterSchedule(req: Request, res: Response) {
  const {
    meter,
    installation,
    toi,
    note,
    csd,
    clientPresent,
    schedulingNotes,
    partnerUserId,
    envelopePhoto,
    envelopeSeal,
    toiCollaborator1Name,
    toiCollaborator1Registration,
    toiCollaborator2Name,
    toiCollaborator2Registration,
    toiTeamReason,
  } = req.body as {
    meter?: string
    installation?: string
    toi?: string
    note?: string
    csd?: string
    clientPresent?: string
    schedulingNotes?: string
    partnerUserId?: string
    envelopePhoto?: string
    envelopeSeal?: string
    toiCollaborator1Name?: string
    toiCollaborator1Registration?: string
    toiCollaborator2Name?: string
    toiCollaborator2Registration?: string
    toiTeamReason?: string
  }

  const normalized = {
    meter: meter?.trim() ?? '',
    installation: installation?.trim() ?? '',
    toi: toi?.trim() ?? '',
    note: note?.trim() ?? '',
    csd: csd?.trim() ?? '',
    clientPresent: clientPresent?.trim() ?? '',
    schedulingNotes: schedulingNotes?.trim() ?? '',
    partnerUserId: partnerUserId?.trim() ?? '',
    envelopePhoto: envelopePhoto?.trim() ?? '',
    envelopeSeal: envelopeSeal?.trim() ?? '',
    toiCollaborator1Name: toiCollaborator1Name?.trim() ?? '',
    toiCollaborator1Registration: toiCollaborator1Registration?.trim() ?? '',
    toiCollaborator2Name: toiCollaborator2Name?.trim() ?? '',
    toiCollaborator2Registration: toiCollaborator2Registration?.trim() ?? '',
    toiTeamReason: toiTeamReason?.trim() ?? '',
  }

  for (const [value, field] of [
    [normalized.meter, 'medidor'],
    [normalized.installation, 'instalacao'],
    [normalized.toi, 'toi'],
    [normalized.note, 'nota'],
  ] as const) {
    const error = validateScheduleNumericField(value, field)
    if (error) {
      res.status(400).json({ error })
      return
    }
  }

  if (!normalized.csd) {
    res.status(400).json({ error: 'Selecione um CSD.' })
    return
  }

  if (
    !normalized.envelopePhoto ||
    !normalized.envelopePhoto.startsWith('data:image/') ||
    normalized.envelopePhoto.length > 3_500_000
  ) {
    res.status(400).json({
      error:
        'Anexe uma foto nítida do número do invólucro (até cerca de 2 MB), com o medidor visível dentro dele.',
    })
    return
  }

  if (!normalized.envelopeSeal) {
    res.status(400).json({ error: 'Informe o número do invólucro cadastrado no campo.' })
    return
  }

  if (normalized.clientPresent !== 'sim' && normalized.clientPresent !== 'nao') {
    normalized.clientPresent = 'nao'
  }

  let requiresToiTeam = false
  if (req.user?.id) {
    const userResult = await query<{ work_subtype: string }>(
      `SELECT work_subtype FROM users WHERE id = $1`,
      [req.user.id],
    )
    const subtype = userResult.rows[0]?.work_subtype?.trim() ?? ''
    requiresToiTeam = subtype === BACKOFFICE_SCOPE || subtype === PONTO_FOCAL_SCOPE
  }

  const hasToiTeamPayload = Boolean(
    normalized.toiCollaborator1Name &&
      normalized.toiCollaborator1Registration &&
      normalized.toiCollaborator2Name &&
      normalized.toiCollaborator2Registration,
  )
  // Aceita modo equipe TOI também quando o front envia os colaboradores
  // (ex.: admin em pré-visualização de Ponto Focal / Backoffice).
  if (hasToiTeamPayload) {
    requiresToiTeam = true
  }

  if (requiresToiTeam) {
    if (
      !normalized.toiCollaborator1Name ||
      !normalized.toiCollaborator1Registration ||
      !normalized.toiCollaborator2Name ||
      !normalized.toiCollaborator2Registration
    ) {
      res.status(400).json({
        error:
          'Selecione os colaboradores 1 e 2 da equipe que lavrou o TOI na lista de usuários cadastrados.',
      })
      return
    }
    if (
      normalized.toiCollaborator1Registration.toUpperCase() ===
      normalized.toiCollaborator2Registration.toUpperCase()
    ) {
      res.status(400).json({
        error: 'Os colaboradores 1 e 2 devem ser usuários diferentes.',
      })
      return
    }

    const toiUsers = await query<{
      id: string
      name: string
      registration: string
    }>(
      `SELECT id, name, registration
       FROM users
       WHERE approval_status = 'approved'
         AND role <> 'admin'
         AND REPLACE(TRIM(COALESCE(work_subtype, '')), '–', '-') ILIKE 'Lavratura de TOI%'
         AND UPPER(TRIM(registration)) = ANY($1::text[])`,
      [
        [
          normalized.toiCollaborator1Registration.toUpperCase(),
          normalized.toiCollaborator2Registration.toUpperCase(),
        ],
      ],
    )
    const byRegistration = new Map(
      toiUsers.rows.map((row) => [row.registration.trim().toUpperCase(), row]),
    )
    const collaborator1 = byRegistration.get(
      normalized.toiCollaborator1Registration.toUpperCase(),
    )
    const collaborator2 = byRegistration.get(
      normalized.toiCollaborator2Registration.toUpperCase(),
    )
    if (!collaborator1 || !collaborator2) {
      res.status(400).json({
        error:
          'Colaboradores inválidos. Selecione apenas usuários com perfil Lavratura de TOI. Se alguém não estiver na lista, solicite o cadastro no portal.',
      })
      return
    }
    normalized.toiCollaborator1Name = collaborator1.name
    normalized.toiCollaborator1Registration = collaborator1.registration
    normalized.toiCollaborator2Name = collaborator2.name
    normalized.toiCollaborator2Registration = collaborator2.registration

    if (normalized.toiTeamReason.length < 5) {
      res.status(400).json({
        error:
          'Informe o motivo pelo qual está agendando pela equipe (mínimo de 5 caracteres).',
      })
      return
    }
  }

  let partner: { id: string; name: string; registration: string } | null = null
  if (!requiresToiTeam) {
    if (!normalized.partnerUserId) {
      res.status(400).json({
        error:
          'Selecione o parceiro. Escolha um usuário com perfil Lavratura de TOI. Se ele não estiver na lista, solicite o cadastro no portal.',
      })
      return
    }

    const partnerResult = await query<{
      id: string
      name: string
      registration: string
    }>(
      `SELECT id, name, registration
       FROM users
       WHERE id = $1
         AND approval_status = 'approved'
         AND role <> 'admin'
         AND REPLACE(TRIM(COALESCE(work_subtype, '')), '–', '-') ILIKE 'Lavratura de TOI%'`,
      [normalized.partnerUserId],
    )
    partner = partnerResult.rows[0] ?? null
    if (!partner) {
      res.status(400).json({
        error:
          'Parceiro inválido. Selecione um usuário com perfil Lavratura de TOI. Se ele não estiver na lista, solicite o cadastro no portal.',
      })
      return
    }
    if (req.user?.id && partner.id === req.user.id) {
      res.status(400).json({ error: 'Selecione um parceiro diferente de você.' })
      return
    }
  }

  const duplicate = await query<{ id: string }>(
    `SELECT id FROM meter_schedules
     WHERE meter = $1 AND trail_step = $2
     LIMIT 1`,
    [normalized.meter, ENTRADA_TRAIL_STEP],
  )

  if (duplicate.rows[0]) {
    res.status(409).json({
      error: `O medidor ${normalized.meter} já está agendado e aguardando entrada no laboratório.`,
    })
    return
  }

  const blocks = await query<{ blocked_date: string }>(
    `SELECT blocked_date::text FROM ensaios_manual_blocks`,
  )
  const manualBlocks = new Set(blocks.rows.map((block) => block.blocked_date.slice(0, 10)))
  const nextSlot = findNextAvailableSlot(manualBlocks)

  if (!nextSlot) {
    res.status(409).json({
      error: 'Não há datas disponíveis no calendário nos próximos meses.',
    })
    return
  }

  const id = `schedule-${Date.now()}-${normalized.meter}`

  const insert = await query<Omit<MeterScheduleRow, 'created_by_registration'>>(
    `INSERT INTO meter_schedules (
      id, meter, installation, toi, note, csd, client_present,
      scheduling_notes,
      toi_collaborator1_name, toi_collaborator1_registration,
      toi_collaborator2_name, toi_collaborator2_registration,
      toi_team_reason,
      partner_user_id, partner_name, partner_registration,
      envelope_photo, envelope_seal,
      scheduled_at, trail_step, source, created_by_user_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'field_team',$21)
    RETURNING *`,
    [
      id,
      normalized.meter,
      normalized.installation,
      normalized.toi,
      normalized.note,
      normalized.csd,
      normalized.clientPresent,
      normalized.schedulingNotes,
      normalized.toiCollaborator1Name,
      normalized.toiCollaborator1Registration,
      normalized.toiCollaborator2Name,
      normalized.toiCollaborator2Registration,
      normalized.toiTeamReason,
      partner?.id ?? null,
      partner?.name ?? '',
      partner?.registration ?? '',
      normalized.envelopePhoto,
      normalized.envelopeSeal,
      nextSlot.toISOString(),
      ENTRADA_TRAIL_STEP,
      req.user?.id ?? null,
    ],
  )

  const schedule = mapMeterSchedule({
    ...insert.rows[0],
    created_by_registration: req.user?.registration ?? null,
  })

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'meter_schedule',
    entityId: schedule.id,
    summary: `Medidor ${schedule.meter} agendado para ${schedule.scheduledAtLabel}`,
    newData: {
      ...schedule,
      envelopePhoto: schedule.envelopePhoto ? '[imagem anexada]' : '',
    },
    metadata: { meter: schedule.meter },
  })

  res.status(201).json({ schedule })
}

export async function createPassiveMeterSchedule(req: Request, res: Response) {
  const {
    meter,
    installation,
    toi,
    note,
    csd,
    schedulingNotes,
    scheduledByName,
    schedulingDate,
    scheduledAt,
  } = req.body as {
    meter?: string
    installation?: string
    toi?: string
    note?: string
    csd?: string
    schedulingNotes?: string
    scheduledByName?: string
    schedulingDate?: string
    scheduledAt?: string
  }

  const normalized = {
    meter: meter?.trim() ?? '',
    installation: installation?.trim() ?? '',
    toi: toi?.trim() ?? '',
    note: note?.trim() ?? '',
    csd: csd?.trim() ?? '',
    schedulingNotes: schedulingNotes?.trim() ?? '',
    scheduledByName: scheduledByName?.trim() ?? '',
    schedulingDate: schedulingDate?.trim() ?? '',
    scheduledAt: scheduledAt?.trim() ?? '',
  }

  const meterError = validateScheduleNumericField(normalized.meter, 'medidor')
  if (meterError) {
    res.status(400).json({ error: meterError })
    return
  }

  for (const [value, field] of [
    [normalized.installation, 'instalacao'],
    [normalized.toi, 'toi'],
    [normalized.note, 'nota'],
  ] as const) {
    if (!value) continue
    const error = validateScheduleNumericField(value, field)
    if (error) {
      res.status(400).json({ error })
      return
    }
  }

  if (!normalized.csd) {
    res.status(400).json({ error: 'Selecione um CSD.' })
    return
  }

  const scheduledAtDate = normalized.scheduledAt ? new Date(normalized.scheduledAt) : null
  if (!scheduledAtDate || Number.isNaN(scheduledAtDate.getTime())) {
    res.status(400).json({ error: 'Informe a data escrita no CSM.' })
    return
  }

  const id = `schedule-${Date.now()}-${normalized.meter}`

  const insert = await query<Omit<MeterScheduleRow, 'created_by_registration'>>(
    `INSERT INTO meter_schedules (
      id, meter, installation, toi, note, csd, client_present,
      scheduling_notes, scheduled_by_name, scheduling_date,
      scheduled_at, trail_step, source, created_by_user_id
    ) VALUES ($1,$2,$3,$4,$5,$6,'nao',$7,$8,$9,$10,$11,'passivo',$12)
    RETURNING *, scheduling_date::text AS scheduling_date`,
    [
      id,
      normalized.meter,
      normalized.installation,
      normalized.toi,
      normalized.note,
      normalized.csd,
      normalized.schedulingNotes,
      normalized.scheduledByName,
      normalized.schedulingDate || null,
      scheduledAtDate.toISOString(),
      ENTRADA_TRAIL_STEP,
      req.user?.id ?? null,
    ],
  )

  const schedule = mapMeterSchedule({
    ...insert.rows[0],
    created_by_registration: req.user?.registration ?? null,
  })

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'meter_schedule',
    entityId: schedule.id,
    summary: `Medidor ${schedule.meter} agendado (passivo) para ${schedule.scheduledAtLabel}`,
    newData: schedule,
    metadata: { meter: schedule.meter },
  })

  res.status(201).json({ schedule })
}

const MIN_JUSTIFICATION_LENGTH = 5

export async function rescheduleMeterSchedule(req: Request, res: Response) {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : ''
  if (!id) {
    res.status(400).json({ error: 'Informe o agendamento a reagendar.' })
    return
  }

  const { scheduledAt, justification } = req.body as {
    scheduledAt?: string
    justification?: string
  }

  const normalizedJustification = justification?.trim() ?? ''
  if (normalizedJustification.length < MIN_JUSTIFICATION_LENGTH) {
    res.status(400).json({
      error: `Informe a justificativa (mínimo ${MIN_JUSTIFICATION_LENGTH} caracteres).`,
    })
    return
  }

  const scheduledAtRaw = scheduledAt?.trim() ?? ''
  if (!scheduledAtRaw) {
    res.status(400).json({ error: 'Informe a nova data de ensaio.' })
    return
  }

  const nextDate = new Date(scheduledAtRaw)
  if (Number.isNaN(nextDate.getTime())) {
    res.status(400).json({ error: 'Data de ensaio inválida.' })
    return
  }

  const existing = await query<Omit<MeterScheduleRow, 'created_by_registration'>>(
    `SELECT *, scheduling_date::text AS scheduling_date FROM meter_schedules WHERE id = $1 LIMIT 1`,
    [id],
  )
  const current = existing.rows[0]
  if (!current) {
    res.status(404).json({ error: 'Agendamento não encontrado.' })
    return
  }

  const blocks = await query<{ blocked_date: string }>(
    `SELECT blocked_date::text FROM ensaios_manual_blocks`,
  )
  const manualBlocks = new Set(blocks.rows.map((block) => block.blocked_date.slice(0, 10)))

  if (isScheduleDayBlocked(nextDate, manualBlocks)) {
    res.status(400).json({
      error: `A data ${toDateKey(nextDate)} está bloqueada no calendário de ensaios.`,
    })
    return
  }

  const previous = mapMeterSchedule({
    ...current,
    created_by_registration: null,
  })

  const update = await query<Omit<MeterScheduleRow, 'created_by_registration'>>(
    `UPDATE meter_schedules
     SET scheduled_at = $1
     WHERE id = $2
     RETURNING *, scheduling_date::text AS scheduling_date`,
    [nextDate.toISOString(), id],
  )

  const updatedRow = update.rows[0]
  if (!updatedRow) {
    res.status(500).json({ error: 'Não foi possível atualizar o agendamento.' })
    return
  }

  await query(
    `UPDATE meter_registry
     SET scheduled_at = $1
     WHERE meter = $2`,
    [nextDate.toISOString(), updatedRow.meter],
  )

  const schedule = mapMeterSchedule({
    ...updatedRow,
    created_by_registration: req.user?.registration ?? null,
  })

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'meter_schedule',
    entityId: schedule.id,
    summary: `Medidor ${schedule.meter} reagendado de ${previous.scheduledAtLabel} para ${schedule.scheduledAtLabel}. Justificativa: ${normalizedJustification}`,
    oldData: {
      meter: previous.meter,
      scheduledAt: previous.scheduledAt,
      scheduledAtLabel: previous.scheduledAtLabel,
    },
    newData: {
      meter: schedule.meter,
      scheduledAt: schedule.scheduledAt,
      scheduledAtLabel: schedule.scheduledAtLabel,
    },
    metadata: {
      meter: schedule.meter,
      justification: normalizedJustification,
      previousScheduledAt: previous.scheduledAt,
      previousScheduledAtLabel: previous.scheduledAtLabel,
      newScheduledAt: schedule.scheduledAt,
      newScheduledAtLabel: schedule.scheduledAtLabel,
    },
  })

  res.json({ schedule })
}

type MeterHistoryRow = {
  id: string
  occurred_at: Date
  user_id: string | null
  user_registration: string | null
  user_role: string | null
  user_name: string | null
  action: string
  entity_type: string
  entity_id: string | null
  summary: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}

export async function listMeterScheduleHistory(req: Request, res: Response) {
  const meter =
    typeof req.query.meter === 'string' && req.query.meter.trim()
      ? req.query.meter.trim()
      : ''

  if (!meter) {
    res.status(400).json({ error: 'Informe o número do medidor.' })
    return
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)

  const result = await query<MeterHistoryRow>(
    `SELECT a.id, a.occurred_at, a.user_id, a.user_registration, a.user_role,
            u.name AS user_name, a.action, a.entity_type, a.entity_id, a.summary,
            a.old_data, a.new_data, a.metadata
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.entity_type = 'meter_schedule'
       AND (
         COALESCE(a.metadata->>'meter', '') = $1
         OR COALESCE(a.new_data->>'meter', '') = $1
         OR COALESCE(a.old_data->>'meter', '') = $1
         OR a.summary ILIKE '%' || $1 || '%'
       )
     ORDER BY a.occurred_at DESC
     LIMIT $2`,
    [meter, limit],
  )

  res.json({
    meter,
    history: result.rows.map((row) => {
      const metadata = row.metadata ?? {}
      const justification =
        typeof metadata.justification === 'string' ? metadata.justification : ''

      return {
        id: String(row.id),
        occurredAt: row.occurred_at.toISOString(),
        userId: row.user_id,
        userRegistration: row.user_registration,
        userName: row.user_name,
        userRole: row.user_role,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        summary: row.summary,
        justification,
        oldData: row.old_data,
        newData: row.new_data,
        metadata,
      }
    }),
    total: result.rowCount ?? 0,
  })
}

function calendarDaysBetween(from: Date, to: Date): number {
  const start = toCalendarDate(from).getTime()
  const end = toCalendarDate(to).getTime()
  return Math.max(0, Math.round((end - start) / (24 * 60 * 60 * 1000)))
}

function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabelFromKey(key: string): string {
  const [year, month] = key.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  const label = date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export async function saveDelayJustification(req: Request, res: Response) {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : ''
  if (!id) {
    res.status(400).json({ error: 'Informe o agendamento.' })
    return
  }

  const justification =
    typeof req.body?.justification === 'string' ? req.body.justification.trim() : ''
  if (justification.length < MIN_JUSTIFICATION_LENGTH) {
    res.status(400).json({
      error: `Informe o motivo do atraso (mínimo ${MIN_JUSTIFICATION_LENGTH} caracteres).`,
    })
    return
  }

  const existing = await query<MeterScheduleRow>(
    `SELECT ms.*, ms.scheduling_date::text AS scheduling_date,
            u.name AS created_by_name, u.registration AS created_by_registration
     FROM meter_schedules ms
     LEFT JOIN users u ON u.id = ms.created_by_user_id
     WHERE ms.id = $1`,
    [id],
  )
  const row = existing.rows[0]
  if (!row) {
    res.status(404).json({ error: 'Agendamento não encontrado.' })
    return
  }

  const isLate = isMeterDeliveryLate({
    scheduledAt: row.scheduled_at,
    trailStep: row.trail_step,
    entradaTrailStep: ENTRADA_TRAIL_STEP,
  })
  if (!isLate) {
    res.status(400).json({ error: 'Só é possível justificar medidores atrasados.' })
    return
  }

  if (req.user?.role !== 'admin') {
    const userId = req.user?.id ?? ''
    const allowedCsdNames = userId ? await resolvePontoFocalCsdNames(userId) : []
    if (allowedCsdNames === null) {
      res.status(403).json({
        error: 'Apenas o responsável do CSD pode justificar o atraso da entrega.',
      })
      return
    }
    const scheduleCsd = row.csd.trim().toUpperCase()
    if (!allowedCsdNames.some((name) => name.toUpperCase() === scheduleCsd)) {
      res.status(403).json({
        error: 'Você só pode justificar atrasos dos CSDs em que é responsável.',
      })
      return
    }
  }

  const updated = await query<MeterScheduleRow>(
    `UPDATE meter_schedules
     SET delay_justification = $2
     WHERE id = $1
     RETURNING *, scheduling_date::text AS scheduling_date`,
    [id, justification],
  )

  const schedule = mapMeterSchedule({
    ...updated.rows[0],
    created_by_name: row.created_by_name,
    created_by_registration: row.created_by_registration,
  })

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'meter_schedule',
    entityId: schedule.id,
    summary: `Justificativa de atraso do medidor ${schedule.meter}`,
    oldData: { delayJustification: (row.delay_justification ?? '').trim() },
    newData: { delayJustification: justification },
  })

  res.json({ schedule })
}

/** Dashboard de atraso de entrega para Ponto Focal (CSDs sob responsabilidade). */
export async function getPontoFocalDashboard(req: Request, res: Response) {
  const forUserId =
    typeof req.query.forUserId === 'string' && req.query.forUserId.trim()
      ? req.query.forUserId.trim()
      : ''
  const scopeUserId = pontoFocalScopeUserId(req.user?.role, req.user?.id, forUserId)

  if (!scopeUserId) {
    res.status(401).json({ error: 'Autenticação necessária.' })
    return
  }

  const csdNames = await resolvePontoFocalCsdNames(scopeUserId)
  if (csdNames === null) {
    res.status(403).json({
      error: 'Disponível apenas para o responsável do CSD.',
    })
    return
  }

  if (csdNames.length === 0) {
    res.json({
      csdNames: [],
      current: {
        total: 0,
        late: 0,
        onTimePending: 0,
        deliveredOnTime: 0,
        deliveredLate: 0,
        delayedOverall: 0,
        onTimeOverall: 0,
        lateProportion: 0,
        onTimeProportion: 0,
        delayedOverallProportion: 0,
        onTimeOverallProportion: 0,
      },
      delay: {
        maxDays: 0,
        averageDays: 0,
        delayedCount: 0,
      },
      monthly: [],
      lateMeters: [],
    })
    return
  }

  const result = await query<{
    id: string
    meter: string
    installation: string
    toi: string
    note: string
    csd: string
    scheduled_at: Date
    trail_step: string
    created_at: Date
    entry_at: Date | null
    delay_justification: string | null
  }>(
    `SELECT ms.id, ms.meter, ms.installation, ms.toi, ms.note, ms.csd,
            ms.scheduled_at, ms.trail_step, ms.created_at,
            COALESCE(ms.delay_justification, '') AS delay_justification,
            d.created_at AS entry_at
     FROM meter_schedules ms
     LEFT JOIN LATERAL (
       SELECT created_at
       FROM demm_documents
       WHERE meter_schedule_id = ms.id OR meter = ms.meter
       ORDER BY created_at ASC
       LIMIT 1
     ) d ON true
     WHERE UPPER(TRIM(ms.csd)) = ANY($1::text[])
     ORDER BY ms.scheduled_at ASC`,
    [csdNames.map((name) => name.toUpperCase())],
  )

  const now = new Date()
  let late = 0
  let onTimePending = 0
  let deliveredOnTime = 0
  let deliveredLate = 0
  const delayDaysSamples: number[] = []
  const lateMeters: Array<{
    id: string
    meter: string
    installation: string
    toi: string
    note: string
    csd: string
    scheduledAt: string
    scheduledAtLabel: string
    deliveryDeadlineLabel: string
    daysLate: number
    delayJustification: string
  }> = []
  const monthlyMap = new Map<
    string,
    { late: number; deliveredOnTime: number; onTimePending: number; deliveredLate: number }
  >()

  const bumpMonth = (
    key: string,
    field: 'late' | 'deliveredOnTime' | 'onTimePending' | 'deliveredLate',
  ) => {
    const current = monthlyMap.get(key) ?? {
      late: 0,
      deliveredOnTime: 0,
      onTimePending: 0,
      deliveredLate: 0,
    }
    current[field] += 1
    monthlyMap.set(key, current)
  }

  for (const row of result.rows) {
    const deadline = lastFridayBeforeAssay(row.scheduled_at)
    const monthKey = monthKeyFromDate(deadline)
    const hasEntry =
      Boolean(row.entry_at) || row.trail_step.trim() !== ENTRADA_TRAIL_STEP

    if (hasEntry) {
      if (row.entry_at) {
        const daysLate = calendarDaysBetween(deadline, row.entry_at)
        if (daysLate > 0) {
          deliveredLate += 1
          delayDaysSamples.push(daysLate)
          bumpMonth(monthKey, 'deliveredLate')
        } else {
          deliveredOnTime += 1
          bumpMonth(monthKey, 'deliveredOnTime')
        }
      } else {
        deliveredOnTime += 1
        bumpMonth(monthKey, 'deliveredOnTime')
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
      late += 1
      const daysLate = calendarDaysBetween(deadline, now)
      delayDaysSamples.push(daysLate)
      bumpMonth(monthKey, 'late')
      lateMeters.push({
        id: row.id,
        meter: row.meter,
        installation: row.installation,
        toi: row.toi,
        note: row.note,
        csd: row.csd,
        scheduledAt: row.scheduled_at.toISOString(),
        scheduledAtLabel: formatAvailableSlot(row.scheduled_at),
        deliveryDeadlineLabel: formatDeliveryDeadlineLabel(deadline),
        daysLate,
        delayJustification: (row.delay_justification ?? '').trim(),
      })
    } else {
      onTimePending += 1
      bumpMonth(monthKey, 'onTimePending')
    }
  }

  const total = result.rows.length
  const delayedOverall = late + deliveredLate
  const onTimeOverall = deliveredOnTime + onTimePending
  const lateProportion = total > 0 ? late / total : 0
  const onTimeProportion = total > 0 ? deliveredOnTime / total : 0
  const delayedOverallProportion = total > 0 ? delayedOverall / total : 0
  const onTimeOverallProportion = total > 0 ? onTimeOverall / total : 0
  const maxDays = delayDaysSamples.length ? Math.max(...delayDaysSamples) : 0
  const averageDays = delayDaysSamples.length
    ? delayDaysSamples.reduce((sum, value) => sum + value, 0) / delayDaysSamples.length
    : 0

  const monthly = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([key, values]) => {
      const monthLate = values.late + values.deliveredLate
      const monthOnTime = values.deliveredOnTime + values.onTimePending
      const monthTotal = monthLate + monthOnTime
      return {
        monthKey: key,
        label: monthLabelFromKey(key),
        late: monthLate,
        onTime: monthOnTime,
        deliveredOnTime: values.deliveredOnTime,
        onTimePending: values.onTimePending,
        total: monthTotal,
        lateProportion: monthTotal > 0 ? monthLate / monthTotal : 0,
        onTimeProportion: monthTotal > 0 ? monthOnTime / monthTotal : 0,
      }
    })

  res.json({
    csdNames,
    current: {
      total,
      late,
      onTimePending,
      deliveredOnTime,
      deliveredLate,
      delayedOverall,
      onTimeOverall,
      lateProportion,
      onTimeProportion,
      delayedOverallProportion,
      onTimeOverallProportion,
    },
    delay: {
      maxDays,
      averageDays: Math.round(averageDays * 10) / 10,
      delayedCount: delayDaysSamples.length,
    },
    monthly,
    lateMeters: lateMeters.sort((a, b) => b.daysLate - a.daysLate || a.meter.localeCompare(b.meter)),
  })
}

export async function createBulkMeterSchedulesImport(req: Request, res: Response) {
  const csvContent = typeof req.body?.csvContent === 'string' ? req.body.csvContent : ''
  if (!csvContent.trim()) {
    res.status(400).json({ error: 'Envie o conteúdo do CSV em csvContent.' })
    return
  }

  try {
    const result = await importMeterSchedulesFromCsv(csvContent, 'api_bulk_import')
    res.status(201).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na importação em massa.'
    res.status(400).json({ error: message })
  }
}

export async function fixBulkMeterSchedulesCsd(req: Request, res: Response) {
  const csvContent = typeof req.body?.csvContent === 'string' ? req.body.csvContent : ''
  if (!csvContent.trim()) {
    res.status(400).json({ error: 'Envie o conteúdo do CSV em csvContent.' })
    return
  }

  try {
    const result = await fixBulkScheduleCsdFromCsv(csvContent)
    res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao corrigir CSD dos agendamentos.'
    res.status(400).json({ error: message })
  }
}

export async function fixBulkMeterSchedulesNote(req: Request, res: Response) {
  const csvContent = typeof req.body?.csvContent === 'string' ? req.body.csvContent : ''
  if (!csvContent.trim()) {
    res.status(400).json({ error: 'Envie o conteúdo do CSV em csvContent.' })
    return
  }

  try {
    const result = await fixBulkScheduleNotesFromCsv(csvContent)
    res.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao corrigir nota dos agendamentos.'
    res.status(400).json({ error: message })
  }
}

export async function fixBulkMeterSchedulesCollaborators(req: Request, res: Response) {
  const csvContent = typeof req.body?.csvContent === 'string' ? req.body.csvContent : ''
  if (!csvContent.trim()) {
    res.status(400).json({ error: 'Envie o conteúdo do CSV em csvContent.' })
    return
  }

  try {
    const result = await fixBulkScheduleCollaboratorsFromCsv(csvContent)
    res.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao corrigir colaboradores dos agendamentos.'
    res.status(400).json({ error: message })
  }
}

export async function fixBulkMeterSchedulesDigits(req: Request, res: Response) {
  const csvContent = typeof req.body?.csvContent === 'string' ? req.body.csvContent : ''
  if (!csvContent.trim()) {
    res.status(400).json({ error: 'Envie o conteúdo do CSV em csvContent.' })
    return
  }

  try {
    const result = await fixBulkScheduleDigitsFromCsv(csvContent)
    res.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao normalizar dígitos dos agendamentos.'
    res.status(400).json({ error: message })
  }
}

export async function fixBulkMeterSchedulesUsers(req: Request, res: Response) {
  const csvContent = typeof req.body?.csvContent === 'string' ? req.body.csvContent : ''
  if (!csvContent.trim()) {
    res.status(400).json({ error: 'Envie o conteúdo do CSV em csvContent.' })
    return
  }

  try {
    const result = await fixBulkScheduleUsersFromCsv(csvContent)
    res.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao vincular usuários dos agendamentos.'
    res.status(400).json({ error: message })
  }
}
