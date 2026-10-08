import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { buildRatmPdfFileName, formatRatmLaudoNumber, generateRatmLaudoPdf } from '../ratm-laudo-pdf.js'
import { writeAuditLog } from '../audit.js'
import {
  APROVACAO_TRAIL_STEP,
  ENSAIAR_TRAIL_STEP,
  SUCATA_TRAIL_STEP,
  isMeterReadyForEnsaio,
  normalizedMeterColumnSql,
} from '../lab-trail-status.js'
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

async function loadPortalUser(userId: string | null | undefined) {
  if (!userId) return null
  const result = await query<{
    id: string
    name: string
    registration: string
  }>(
    `SELECT id, name, registration
     FROM users
     WHERE id = $1`,
    [userId],
  )
  return result.rows[0] ?? null
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

async function setMeterProcessStatus(meter: string, status: 'Ensaiado' | 'Aprovado' | 'Recebido') {
  const meterKey = normalizeScheduleMeter(meter)
  if (!meterKey) return
  const trailStep =
    status === 'Aprovado'
      ? SUCATA_TRAIL_STEP
      : status === 'Ensaiado'
        ? APROVACAO_TRAIL_STEP
        : ENSAIAR_TRAIL_STEP
  const scheduleSql =
    status === 'Ensaiado'
      ? `UPDATE meter_schedules
         SET trail_step = $1
         WHERE ${normalizedMeterColumnSql()} = $2
           AND BTRIM(trail_step) IS DISTINCT FROM $3`
      : `UPDATE meter_schedules
         SET trail_step = $1
         WHERE ${normalizedMeterColumnSql()} = $2`
  await query(
    scheduleSql,
    status === 'Ensaiado' ? [trailStep, meterKey, SUCATA_TRAIL_STEP] : [trailStep, meterKey],
  )
  const registrySql =
    status === 'Ensaiado'
      ? `UPDATE meter_registry
         SET status = $1, trail_step = $2
         WHERE ${normalizedMeterColumnSql()} = $3
           AND status IS DISTINCT FROM 'Aprovado'`
      : `UPDATE meter_registry
         SET status = $1, trail_step = $2
         WHERE ${normalizedMeterColumnSql()} = $3`
  await query(registrySql, [status, trailStep, meterKey])
}

async function refreshMeterProcessFromLaudos(meter: string) {
  const active = await findActiveLaudosForMeter(meter)
  if (active.some((row) => row.status === 'Aprovado')) {
    await setMeterProcessStatus(meter, 'Aprovado')
    return
  }
  if (active.some((row) => row.status === 'Pendente')) {
    await setMeterProcessStatus(meter, 'Ensaiado')
    return
  }
  await setMeterProcessStatus(meter, 'Recebido')
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
       AND status = 'Pendente'
       AND ${normalizedMeterSql('meter')} = $1
       AND ($2::text IS NULL OR id <> $2)`,
    [normalized, exceptId ?? null],
  )
}

async function findActiveLaudosForMeter(meter: string) {
  const normalized = normalizeScheduleMeter(meter)
  if (!normalized) return [] as Array<{ id: string; status: string }>
  const result = await query<{ id: string; status: string }>(
    `SELECT id, status
     FROM ratm_laudos
     WHERE revoked_at IS NULL
       AND ${normalizedMeterSql('meter')} = $1`,
    [normalized],
  )
  return result.rows
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
      typeof form.client === 'string' ? form.client.trim().toLocaleUpperCase('pt-BR') : ''
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

    const activeLaudos = await findActiveLaudosForMeter(meter)
    if (activeLaudos.some((row) => row.status === 'Aprovado')) {
      res.status(409).json({
        error: `O medidor ${meter} já possui laudo aprovado e não pode ser substituído.`,
      })
      return
    }

    const hasPendingLaudo = activeLaudos.some((row) => row.status === 'Pendente')
    if (hasPendingLaudo && req.body?.replacePending !== true) {
      res.status(409).json({
        error: 'Esse medidor já foi ensaiado, deseja substituir o relatório?',
        code: 'replace_pending_laudo',
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
    await setMeterProcessStatus(meter, 'Ensaiado')
    const draftKey = normalizeScheduleMeter(meter)
    if (draftKey) {
      await query(`DELETE FROM ratm_assay_drafts WHERE meter_key = $1`, [draftKey])
    }
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
    form.client = form.client.trim().toLocaleUpperCase('pt-BR')
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
      form.client?.trim().toLocaleUpperCase('pt-BR') || 'Não informado',
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

function isValidCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false
  const check = (length: number) => {
    let sum = 0
    for (let index = 0; index < length; index += 1) {
      sum += Number(value[index]) * (length + 1 - index)
    }
    const result = (sum * 10) % 11
    return (result === 10 ? 0 : result) === Number(value[length])
  }
  return check(9) && check(10)
}

function imageDataUrlError(value: string, label: string, maxChars: number) {
  if (!value || value.length > maxChars) return `${label} inválida.`
  if (!/^data:image\/(png|jpeg|jpg);base64,[a-z0-9+/=\r\n]+$/i.test(value)) {
    return `${label} inválida.`
  }
  return ''
}

export async function approveRatmLaudo(req: Request, res: Response) {
  const { id } = req.params
  const clientPresent = req.body?.clientPresent
  const satisfactionWhatsapp =
    typeof req.body?.satisfactionWhatsapp === 'string'
      ? req.body.satisfactionWhatsapp.replace(/\D/g, '')
      : ''
  const clientDocumentPhoto =
    typeof req.body?.clientDocumentPhoto === 'string' ? req.body.clientDocumentPhoto.trim() : ''
  const clientSignature =
    typeof req.body?.clientSignature === 'string' ? req.body.clientSignature.trim() : ''
  const clientCpf = typeof req.body?.clientCpf === 'string' ? req.body.clientCpf.replace(/\D/g, '') : ''

  if (clientPresent !== 'Sim' && clientPresent !== 'Não') {
    res.status(400).json({ error: 'Informe se o cliente acompanhou (Sim ou Não).' })
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

    const photoError = imageDataUrlError(clientDocumentPhoto, 'A foto do documento', 2_500_000)
    if (photoError) {
      res.status(400).json({ error: photoError })
      return
    }
    const signatureError = imageDataUrlError(clientSignature, 'A assinatura', 1_500_000)
    if (signatureError) {
      res.status(400).json({ error: signatureError })
      return
    }
    if (!isValidCpf(clientCpf)) {
      res.status(400).json({ error: 'Informe um CPF válido.' })
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

  const approver = req.user?.role === 'admin'
    ? await loadPortalUser(req.user.id)
    : await loadLaboratorioMedicaoUser(req.user?.id)
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

  if (req.user?.role !== 'admin' && approver.id === assayUser.id) {
    res.status(403).json({
      error: 'Quem realizou o ensaio não pode aprovar o próprio laudo.',
    })
    return
  }

  const formData = {
    ...existing.rows[0].form_data,
    clientAccompanied: clientPresent,
    ratmApprovedBy: formatPortalUser(approver),
    clientDocumentPhoto: clientPresent === 'Sim' ? clientDocumentPhoto : '',
    clientCpf: clientPresent === 'Sim' ? clientCpf : '',
    clientSignature: clientPresent === 'Sim' ? clientSignature : '',
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
  await setMeterProcessStatus(laudo.meter, 'Aprovado')
  const auditLaudo = {
    ...laudo,
    formData: {
      ...laudo.formData,
      clientDocumentPhoto: laudo.formData.clientDocumentPhoto ? '[foto]' : '',
      clientSignature: laudo.formData.clientSignature ? '[assinatura]' : '',
    },
  }

  await writeAuditLog(req, {
    action: 'approve',
    entityType: 'ratm_laudo',
    entityId: laudo.id,
    summary: `Laudo RATM ${laudo.ratmNumber} aprovado`,
    oldData: mapRatmLaudo(existing.rows[0]),
    newData: auditLaudo,
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
    const laudoId = typeof id === 'string' ? id : id[0]
    const requestedName = typeof req.params.filename === 'string' ? req.params.filename : ''
    if (requestedName !== filename) {
      res.redirect(302, `/api/ratm-laudos/${encodeURIComponent(laudoId)}/pdf/${encodeURIComponent(filename)}`)
      return
    }

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    )
    await generateRatmLaudoPdf(laudo, res)
  } catch (error) {
    console.error('Erro ao gerar PDF do laudo:', error)

    if (!res.headersSent) {
      res.status(500).json({ error: 'Não foi possível gerar o laudo em PDF.' })
    }
  }
}

export async function getRatmAssayDraft(req: Request, res: Response) {
  const meter = typeof req.query.meter === 'string' ? req.query.meter.trim() : ''
  const meterKey = normalizeScheduleMeter(meter)
  if (!meterKey) {
    res.json({ draft: null })
    return
  }

  const result = await query<{
    form_data: Record<string, unknown>
    updated_at: Date
  }>(
    `SELECT form_data, updated_at FROM ratm_assay_drafts WHERE meter_key = $1`,
    [meterKey],
  )
  const row = result.rows[0]
  res.json({
    draft: row
      ? {
          meter: meterKey,
          formData: row.form_data,
          updatedAt: row.updated_at.toISOString(),
        }
      : null,
  })
}

export async function saveRatmAssayDraft(req: Request, res: Response) {
  const meter = typeof req.body?.meter === 'string' ? req.body.meter.trim() : ''
  const formData = req.body?.formData
  const meterKey = normalizeScheduleMeter(meter)
  if (!meterKey || !formData || typeof formData !== 'object') {
    res.status(400).json({ error: 'Informe o medidor e o preenchimento do ensaio.' })
    return
  }

  await query(
    `INSERT INTO ratm_assay_drafts (meter_key, form_data, updated_by_user_id, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (meter_key) DO UPDATE
     SET form_data = EXCLUDED.form_data,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = NOW()`,
    [meterKey, JSON.stringify(formData), req.user?.id ?? null],
  )
  res.json({ ok: true })
}

export async function deleteRatmLaudo(req: Request, res: Response) {
  const { id } = req.params

  const existing = await query<RatmLaudoRow>(
    `SELECT id, ratm_number, meter, client, status, created_at
     FROM ratm_laudos
     WHERE id = $1`,
    [id],
  )
  const row = existing.rows[0]
  if (!row) {
    res.status(404).json({ error: 'Laudo não encontrado.' })
    return
  }

  await query(`DELETE FROM ratm_laudos WHERE id = $1`, [id])
  await refreshMeterProcessFromLaudos(row.meter)

  const number = formatRatmLaudoNumber(row.ratm_number, row.created_at.toISOString())
  await writeAuditLog(req, {
    action: 'delete',
    entityType: 'ratm_laudo',
    entityId: row.id,
    summary: `Excluiu o laudo ${number} do medidor ${row.meter}.`,
    oldData: {
      id: row.id,
      ratmNumber: row.ratm_number,
      meter: row.meter,
      client: row.client,
      status: row.status,
    },
  })

  res.json({ ok: true, id: row.id })
}

export async function deleteRatmAssayDraft(req: Request, res: Response) {
  const meter = typeof req.query.meter === 'string' ? req.query.meter.trim() : ''
  const meterKey = normalizeScheduleMeter(meter)
  if (meterKey) {
    await query(`DELETE FROM ratm_assay_drafts WHERE meter_key = $1`, [meterKey])
  }
  res.json({ ok: true })
}

export const ratmLaudoRoutes = {
  list: [requireAuth, listRatmLaudos],
  create: [requireAuth, createRatmLaudos],
  update: [requireAuth, updateRatmLaudo],
  approve: [requireAuth, approveRatmLaudo],
  pdf: [requireAuth, downloadRatmLaudoPdf],
}
