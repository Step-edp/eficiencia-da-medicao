import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { buildRatmPdfFileName, generateRatmLaudoPdf } from '../ratm-laudo-pdf.js'
import { writeAuditLog } from '../audit.js'
import { isMeterReadyForEnsaio } from '../lab-trail-status.js'
import { normalizeScheduleMeter } from '../numeric-field-validation.js'

type RatmLaudoRow = {
  id: string
  ratm_number: number
  meter: string
  client: string
  created_at: Date
  status: 'Pendente' | 'Aprovado' | 'Reprovado'
  form_data: Record<string, unknown>
  created_by_user_id?: string | null
  created_by_name?: string | null
  created_by_registration?: string | null
  installation?: string | null
  toi?: string | null
  note?: string | null
  meter_reading?: string | null
  revoked_at?: Date | null
}

function mapRatmLaudo(row: RatmLaudoRow) {
  return {
    id: row.id,
    ratmNumber: row.ratm_number,
    meter: row.meter,
    client: row.client,
    createdAt: row.created_at.toISOString(),
    status: row.status,
    formData: row.form_data,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name || '',
    createdByRegistration: row.created_by_registration || '',
    installation: row.installation || '',
    toi: row.toi || '',
    note: row.note || '',
    meterReading: row.meter_reading || '',
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
  }
}

async function loadLaboratorioMedicaoUser(userId: string | null | undefined) {
  if (!userId) return null
  const result = await query<{
    id: string
    name: string
    registration: string
    work_area: string
    work_subtype: string
    approval_status: string
  }>(
    `SELECT id, name, registration, work_area, work_subtype, approval_status
     FROM users
     WHERE id = $1`,
    [userId],
  )
  const user = result.rows[0]
  if (!user || user.approval_status !== 'approved') return null
  const subtype = (user.work_subtype ?? '')
    .trim()
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-')
  if (user.work_area?.trim() !== 'Medição' || subtype !== 'Laboratório de Medição') return null
  return user
}

function formatPortalUser(user: { name: string; registration: string }) {
  return user.name.trim()
}

function normalizedMeterSql(column: string) {
  return `LPAD(RIGHT(REGEXP_REPLACE(${column}, '[^0-9]', '', 'g'), 8), 8, '0')`
}

async function revokeActiveLaudosForMeter(meter: string, exceptId?: string) {
  const normalized = normalizeScheduleMeter(meter)
  if (!normalized) return
  await query(
    `UPDATE ratm_laudos
     SET revoked_at = NOW()
     WHERE revoked_at IS NULL
       AND ${normalizedMeterSql('meter')} = $1
       AND ($2::text IS NULL OR id <> $2)`,
    [normalized, exceptId ?? null],
  )
}

function currentRatmYear() {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
    }).format(new Date()),
  )
}

async function nextRatmNumber() {
  const result = await query<{ last_number: string }>(
    `INSERT INTO ratm_laudo_year_counters (year, last_number)
     VALUES ($1, 1)
     ON CONFLICT (year) DO UPDATE
     SET last_number = ratm_laudo_year_counters.last_number + 1
     RETURNING last_number`,
    [currentRatmYear()],
  )
  return Number(result.rows[0]?.last_number ?? 1)
}

export async function listRatmLaudos(req: Request, res: Response) {
  const meter =
    typeof req.query.meter === 'string' && req.query.meter.trim()
      ? req.query.meter.trim()
      : ''
  const params: unknown[] = []
  let meterFilter = ''
  if (meter) {
    params.push(normalizeScheduleMeter(meter))
    meterFilter = `WHERE ${normalizedMeterSql('r.meter')} = $1`
  }

  const result = await query<RatmLaudoRow>(
    `SELECT r.*,
            u.name AS created_by_name,
            u.registration AS created_by_registration,
            ms.installation,
            ms.toi,
            ms.note
     FROM ratm_laudos r
     LEFT JOIN users u ON u.id = r.created_by_user_id
     LEFT JOIN LATERAL (
       SELECT installation, toi, note, meter_reading
       FROM meter_schedules
       WHERE meter = r.meter
       ORDER BY created_at DESC
       LIMIT 1
     ) ms ON true
     ${meterFilter}
     ORDER BY r.created_at DESC`,
    params,
  )

  res.json({ laudos: result.rows.map(mapRatmLaudo) })
}

export async function createRatmLaudos(req: Request, res: Response) {
  const forms = req.body?.forms

  if (!Array.isArray(forms) || forms.length === 0) {
    res.status(400).json({ error: 'Informe os formulários RATM para gerar os laudos.' })
    return
  }

  const assayUser = await loadLaboratorioMedicaoUser(req.user?.id)
  if (!assayUser) {
    res.status(403).json({
      error: 'Somente usuários do Laboratório de Medição podem realizar o ensaio.',
    })
    return
  }

  const batchId = Date.now()
  const createdLaudos = []

  for (let index = 0; index < forms.length; index += 1) {
    const form = forms[index] as { meter?: string; client?: string }

    if (!form.meter?.trim()) {
      res.status(400).json({ error: `Informe o medidor no RATM ${index + 1}.` })
      return
    }

    const id = `laudo-${batchId}-${index + 1}`
    const meter = form.meter.trim()
    const clientName =
      typeof form.client === 'string' ? form.client.trim().toLocaleLowerCase('pt-BR') : ''
    form.client = clientName
    const client = clientName || 'Não informado'

    const meterState = await query<{
      registry_status: string | null
      trail_step: string | null
      demm_id: string | null
    }>(
      `SELECT mr.status AS registry_status,
              ms.trail_step,
              d.id AS demm_id
       FROM meter_schedules ms
       LEFT JOIN meter_registry mr ON mr.meter = ms.meter
       LEFT JOIN LATERAL (
         SELECT id
         FROM demm_documents
         WHERE meter_schedule_id = ms.id
         ORDER BY created_at DESC
         LIMIT 1
       ) d ON true
       WHERE ms.meter = $1
       ORDER BY ms.created_at DESC
       LIMIT 1`,
      [meter],
    )

    const state = meterState.rows[0]
    const readyForEnsaio = isMeterReadyForEnsaio({
      registryStatus: state?.registry_status,
      trailStep: state?.trail_step,
      hasDemmEntry: Boolean(state?.demm_id),
    })

    if (!readyForEnsaio) {
      res.status(409).json({
        error: `O medidor ${meter} ainda não foi recebido na Entrada. Registre a DEMM antes de iniciar o ensaio.`,
      })
      return
    }

    await revokeActiveLaudosForMeter(meter)

    const ratmNumber = await nextRatmNumber()
    const result = await query<RatmLaudoRow>(
      `INSERT INTO ratm_laudos (
        id, ratm_number, meter, client, status, form_data, created_by_user_id
      ) VALUES ($1, $2, $3, $4, 'Pendente', $5::jsonb, $6)
      RETURNING *`,
      [id, ratmNumber, meter, client, JSON.stringify(forms[index]), assayUser.id],
    )

    createdLaudos.push(mapRatmLaudo(result.rows[0]))
  }

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'ratm_laudo',
    summary: `${createdLaudos.length} laudo(s) RATM criado(s)`,
    newData: {
      laudos: createdLaudos.map((laudo) => ({
        id: laudo.id,
        ratmNumber: laudo.ratmNumber,
        meter: laudo.meter,
        client: laudo.client,
      })),
    },
  })

  res.status(201).json({ laudos: createdLaudos })
}

export async function updateRatmLaudo(req: Request, res: Response) {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const form = req.body?.formData as { meter?: string; client?: string } | undefined

  if (!form || typeof form !== 'object') {
    res.status(400).json({ error: 'Informe os dados do laudo para edição.' })
    return
  }

  if (!form.meter?.trim()) {
    res.status(400).json({ error: 'Informe o medidor antes de salvar.' })
    return
  }

  const previous = await query<RatmLaudoRow>(
    'SELECT * FROM ratm_laudos WHERE id = $1 AND status = $2',
    [id, 'Pendente'],
  )

  if (!previous.rows[0]) {
    res.status(404).json({ error: 'Laudo pendente não encontrado para edição.' })
    return
  }

  if (previous.rows[0].revoked_at) {
    res.status(400).json({ error: 'Laudo revogado não pode ser alterado.' })
    return
  }

  await revokeActiveLaudosForMeter(form.meter.trim(), id)

  if (typeof form.client === 'string') {
    form.client = form.client.trim().toLocaleLowerCase('pt-BR')
  }

  const result = await query<RatmLaudoRow>(
    `UPDATE ratm_laudos
     SET form_data = $1::jsonb,
         meter = $2,
         client = $3
     WHERE id = $4 AND status = 'Pendente'
     RETURNING *`,
    [
      JSON.stringify(form),
      form.meter.trim(),
      form.client?.trim().toLocaleLowerCase('pt-BR') || 'Não informado',
      id,
    ],
  )

  if (!result.rows[0]) {
    res.status(404).json({ error: 'Laudo pendente não encontrado para edição.' })
    return
  }

  const laudo = mapRatmLaudo(result.rows[0])

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'ratm_laudo',
    entityId: laudo.id,
    summary: `Laudo RATM ${laudo.ratmNumber} editado (medidor ${laudo.meter})`,
    oldData: mapRatmLaudo(previous.rows[0]),
    newData: laudo,
  })

  res.json({ laudo })
}

export async function approveRatmLaudo(req: Request, res: Response) {
  const { id } = req.params
  const clientPresent = req.body?.clientPresent
  const satisfactionWhatsapp =
    typeof req.body?.satisfactionWhatsapp === 'string'
      ? req.body.satisfactionWhatsapp.replace(/\D/g, '')
      : ''

  if (clientPresent !== 'Sim' && clientPresent !== 'Não') {
    res.status(400).json({ error: 'Informe se o cliente está presente (Sim ou Não).' })
    return
  }

  if (clientPresent === 'Sim') {
    const normalizedWhatsapp =
      satisfactionWhatsapp.length === 10 || satisfactionWhatsapp.length === 11
        ? `55${satisfactionWhatsapp}`
        : satisfactionWhatsapp

    if (normalizedWhatsapp.length < 12 || normalizedWhatsapp.length > 13) {
      res.status(400).json({ error: 'Informe um número de WhatsApp válido para enviar a pesquisa.' })
      return
    }
  }

  const existing = await query<RatmLaudoRow>(
    'SELECT * FROM ratm_laudos WHERE id = $1 AND status = $2',
    [id, 'Pendente'],
  )

  if (!existing.rows[0]) {
    res.status(404).json({ error: 'Laudo pendente não encontrado para aprovação.' })
    return
  }

  if (existing.rows[0].revoked_at) {
    res.status(400).json({ error: 'Laudo revogado não pode ser aprovado.' })
    return
  }

  const approver = await loadLaboratorioMedicaoUser(req.user?.id)
  if (!approver) {
    res.status(403).json({
      error: 'Somente usuários do Laboratório de Medição podem aprovar o laudo.',
    })
    return
  }

  const assayUser = await loadLaboratorioMedicaoUser(existing.rows[0].created_by_user_id)
  if (!assayUser) {
    res.status(403).json({
      error: 'O ensaio precisa ter sido realizado por um usuário do Laboratório de Medição.',
    })
    return
  }

  if (approver.id === assayUser.id) {
    res.status(403).json({
      error: 'Quem realizou o ensaio não pode aprovar o próprio laudo.',
    })
    return
  }

  const formData = {
    ...existing.rows[0].form_data,
    clientAccompanied: clientPresent,
    ratmApprovedBy: formatPortalUser(approver),
    satisfactionWhatsapp:
      clientPresent === 'Sim'
        ? satisfactionWhatsapp.length === 10 || satisfactionWhatsapp.length === 11
          ? `55${satisfactionWhatsapp}`
          : satisfactionWhatsapp
        : '',
  }

  const result = await query<RatmLaudoRow>(
    `UPDATE ratm_laudos
     SET status = 'Aprovado',
         form_data = $1::jsonb
     WHERE id = $2 AND status = 'Pendente'
     RETURNING *`,
    [JSON.stringify(formData), id],
  )

  const laudo = mapRatmLaudo(result.rows[0])

  await writeAuditLog(req, {
    action: 'approve',
    entityType: 'ratm_laudo',
    entityId: laudo.id,
    summary: `Laudo RATM ${laudo.ratmNumber} aprovado`,
    oldData: mapRatmLaudo(existing.rows[0]),
    newData: laudo,
    metadata: { clientPresent },
  })

  res.json({ laudo })
}

export async function downloadRatmLaudoPdf(req: Request, res: Response) {
  const { id } = req.params

  try {
    const result = await query<RatmLaudoRow>(
      `SELECT r.*,
              u.name AS created_by_name,
              u.registration AS created_by_registration,
              ms.installation,
              ms.toi,
              ms.note
       FROM ratm_laudos r
       LEFT JOIN users u ON u.id = r.created_by_user_id
       LEFT JOIN LATERAL (
         SELECT installation, toi, note, meter_reading
         FROM meter_schedules
         WHERE meter = r.meter
         ORDER BY created_at DESC
         LIMIT 1
       ) ms ON true
       WHERE r.id = $1`,
      [id],
    )

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Laudo não encontrado.' })
      return
    }

    const laudo = mapRatmLaudo(result.rows[0])
    const filename = buildRatmPdfFileName(laudo)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
    await generateRatmLaudoPdf(laudo, res)
  } catch (error) {
    console.error('Erro ao gerar PDF do laudo:', error)

    if (!res.headersSent) {
      res.status(500).json({ error: 'Não foi possível gerar o laudo em PDF.' })
    }
  }
}

export const ratmLaudoRoutes = {
  list: [requireAuth, listRatmLaudos],
  create: [requireAuth, createRatmLaudos],
  update: [requireAuth, updateRatmLaudo],
  approve: [requireAuth, approveRatmLaudo],
  pdf: [requireAuth, downloadRatmLaudoPdf],
}
