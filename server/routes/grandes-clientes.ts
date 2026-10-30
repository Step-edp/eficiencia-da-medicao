import type { Request, Response } from 'express'
import { pool, query } from '../db.js'
import { writeAuditLog } from '../audit.js'
import {
  GcImportError,
  parseGcAssayWorkbook,
  parseGcDestinationWorkbook,
  parseGcSealsWorkbook,
  type GcSeal,
  type GcTestPoint,
} from '../gc-spreadsheet.js'

const PHOTO_KINDS = ['medidor', 'tampa', 'extra'] as const
type PhotoKind = (typeof PHOTO_KINDS)[number]

const PHOTO_LABEL: Record<PhotoKind, string> = {
  medidor: 'Medidor',
  tampa: 'Medidor com a tampa',
  extra: 'Extra',
}

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function decodeBase64File(input: unknown, label: string) {
  const raw = String(input ?? '').trim()
  if (!raw) throw new GcImportError(`Envie a planilha de ${label}.`)
  if (raw.length > 28_000_000) {
    throw new GcImportError(`A planilha de ${label} passou do tamanho aceito.`)
  }
  const payload = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw
  const buffer = Buffer.from(payload, 'base64')
  if (buffer.length < 32) throw new GcImportError(`A planilha de ${label} está vazia ou inválida.`)
  return buffer
}

async function actor(userId: string | undefined) {
  if (!userId) return { name: '', workArea: '' }
  const result = await query<{ name: string; work_area: string }>(
    `SELECT name, work_area FROM users WHERE id = $1`,
    [userId],
  )
  return {
    name: result.rows[0]?.name?.trim() ?? '',
    workArea: result.rows[0]?.work_area?.trim() ?? '',
  }
}

async function canRelease(req: Request) {
  if (!req.user?.id) return false
  if (req.user.role === 'admin') return true
  const person = await actor(req.user.id)
  return person.workArea === 'Grandes Clientes'
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function asTests(value: unknown): GcTestPoint[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const test = String(row.test ?? '').trim()
    const valueText = String(row.value ?? '').trim()
    if (!test || !valueText) return []
    return [{ test, energy: String(row.energy ?? '').trim(), value: valueText }]
  })
}

async function upsertSeals(seals: GcSeal[], sourceFile: string, userId: string | null) {
  if (!seals.length) return
  await query(
    `INSERT INTO gc_lacres (meter, seal1, seal2, source_file, imported_by_user_id)
     SELECT meter, seal1, seal2, $1, $2
     FROM UNNEST($3::text[], $4::text[], $5::text[]) AS t(meter, seal1, seal2)
     ON CONFLICT (meter) DO UPDATE SET
       seal1 = EXCLUDED.seal1,
       seal2 = EXCLUDED.seal2,
       source_file = EXCLUDED.source_file,
       imported_at = NOW(),
       imported_by_user_id = EXCLUDED.imported_by_user_id`,
    [sourceFile, userId, seals.map((item) => item.meter), seals.map((item) => item.seal1), seals.map((item) => item.seal2)],
  )
}

function sendImportError(res: Response, error: unknown) {
  if (error instanceof GcImportError) {
    res.status(400).json({ error: error.message })
    return true
  }
  return false
}

export async function importGcEnsaio(req: Request, res: Response) {
  const userId = req.user?.id ?? null
  try {
    const body = req.body as {
      assayFileName?: string
      assayBase64?: string
      sealsFileName?: string
      sealsBase64?: string
    }
    const assay = parseGcAssayWorkbook(decodeBase64File(body.assayBase64, 'ensaio'))
    const seals = body.sealsBase64
      ? parseGcSealsWorkbook(decodeBase64File(body.sealsBase64, 'lacres'))
      : []
    const ensaioId = newId('gce')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO gc_ensaios (id, title, operator_name, source_file, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          ensaioId,
          assay.title.slice(0, 240),
          assay.operatorName.slice(0, 120),
          String(body.assayFileName ?? '').slice(0, 240),
          userId,
        ],
      )
      for (const meter of assay.meters) {
        await client.query(
          `INSERT INTO gc_ensaio_medidores
             (id, ensaio_id, meter, meter_name, position, validation, tests)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            newId('gcm'),
            ensaioId,
            meter.meter,
            meter.meterName.slice(0, 160),
            meter.position,
            meter.validation.slice(0, 40),
            JSON.stringify(meter.tests),
          ],
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    if (seals.length) {
      await upsertSeals(seals, String(body.sealsFileName ?? '').slice(0, 240), userId)
    }
    await writeAuditLog(req, {
      action: 'register',
      entityType: 'grandes_clientes',
      entityId: ensaioId,
      summary: `Ensaio de Grandes Clientes com ${assay.meters.length} medidor(es).`,
      metadata: { meters: assay.meters.length, seals: seals.length },
    })
    res.status(201).json({
      id: ensaioId,
      title: assay.title,
      meterCount: assay.meters.length,
      sealCount: seals.length,
    })
  } catch (error) {
    if (sendImportError(res, error)) return
    console.error(error)
    res.status(500).json({ error: 'Não foi possível registrar o ensaio.' })
  }
}

export async function importGcLacres(req: Request, res: Response) {
  const userId = req.user?.id ?? null
  try {
    const body = req.body as { fileName?: string; fileBase64?: string }
    const seals = parseGcSealsWorkbook(decodeBase64File(body.fileBase64, 'lacres'))
    await upsertSeals(seals, String(body.fileName ?? '').slice(0, 240), userId)
    await writeAuditLog(req, {
      action: 'register',
      entityType: 'grandes_clientes',
      entityId: 'lacres',
      summary: `Lacres de Grandes Clientes importados (${seals.length}).`,
      metadata: { seals: seals.length },
    })
    res.status(201).json({ sealCount: seals.length })
  } catch (error) {
    if (sendImportError(res, error)) return
    console.error(error)
    res.status(500).json({ error: 'Não foi possível importar os lacres.' })
  }
}

export async function listGcEnsaios(_req: Request, res: Response) {
  try {
    const result = await query<{
      id: string
      title: string
      operator_name: string
      source_file: string
      created_at: Date
      created_by_name: string | null
      meter_count: string
    }>(
      `SELECT e.id, e.title, e.operator_name, e.source_file, e.created_at,
              u.name AS created_by_name,
              COUNT(m.id)::text AS meter_count
       FROM gc_ensaios e
       LEFT JOIN gc_ensaio_medidores m ON m.ensaio_id = e.id
       LEFT JOIN users u ON u.id = e.created_by_user_id
       GROUP BY e.id, u.name
       ORDER BY e.created_at DESC
       LIMIT 200`,
    )
    res.json({
      ensaios: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        operatorName: row.operator_name,
        sourceFile: row.source_file,
        createdAt: iso(row.created_at),
        createdByName: row.created_by_name,
        meterCount: Number(row.meter_count) || 0,
      })),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Não foi possível carregar os ensaios.' })
  }
}

export async function getGcEnsaio(req: Request, res: Response) {
  try {
    const ensaioId = String(req.params.id ?? '')
    const header = await query<{
      id: string
      title: string
      operator_name: string
      source_file: string
      created_at: Date
      created_by_name: string | null
    }>(
      `SELECT e.id, e.title, e.operator_name, e.source_file, e.created_at, u.name AS created_by_name
       FROM gc_ensaios e
       LEFT JOIN users u ON u.id = e.created_by_user_id
       WHERE e.id = $1`,
      [ensaioId],
    )
    const ensaio = header.rows[0]
    if (!ensaio) {
      res.status(404).json({ error: 'Ensaio não encontrado.' })
      return
    }
    const meters = await query<{
      id: string
      meter: string
      meter_name: string
      position: number
      validation: string
      tests: unknown
      seal1: string | null
      seal2: string | null
      photos: string[] | null
    }>(
      `SELECT m.id, m.meter, m.meter_name, m.position, m.validation, m.tests,
              l.seal1, l.seal2,
              COALESCE(ARRAY_AGG(f.kind) FILTER (WHERE f.kind IS NOT NULL), ARRAY[]::text[]) AS photos
       FROM gc_ensaio_medidores m
       LEFT JOIN gc_lacres l ON l.meter = m.meter
       LEFT JOIN gc_fotos f ON f.ensaio_medidor_id = m.id
       WHERE m.ensaio_id = $1
       GROUP BY m.id, l.seal1, l.seal2
       ORDER BY m.position, m.meter`,
      [ensaioId],
    )
    res.json({
      ensaio: {
        id: ensaio.id,
        title: ensaio.title,
        operatorName: ensaio.operator_name,
        sourceFile: ensaio.source_file,
        createdAt: iso(ensaio.created_at),
        createdByName: ensaio.created_by_name,
      },
      medidores: meters.rows.map((row) => ({
        id: row.id,
        meter: row.meter,
        meterName: row.meter_name,
        position: row.position,
        validation: row.validation,
        tests: asTests(row.tests),
        seal1: row.seal1 ?? '',
        seal2: row.seal2 ?? '',
        photos: (row.photos ?? []).filter((kind): kind is PhotoKind =>
          PHOTO_KINDS.includes(kind as PhotoKind),
        ),
      })),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Não foi possível abrir o ensaio.' })
  }
}

export async function saveGcFoto(req: Request, res: Response) {
  const userId = req.user?.id ?? null
  try {
    const meterId = String(req.params.meterId ?? '')
    const body = req.body as { kind?: string; fileName?: string; dataUrl?: string }
    const kind = body.kind
    if (!PHOTO_KINDS.includes(kind as PhotoKind)) {
      res.status(400).json({ error: 'Escolha a foto do medidor, da tampa ou a extra.' })
      return
    }
    const dataUrl = String(body.dataUrl ?? '')
    if (!dataUrl.startsWith('data:image/')) {
      res.status(400).json({ error: 'Envie uma imagem do medidor.' })
      return
    }
    if (dataUrl.length > 2_400_000) {
      res.status(400).json({ error: 'A foto ficou grande demais. Use uma imagem menor.' })
      return
    }
    const owned = await query<{ id: string }>(
      `SELECT id FROM gc_ensaio_medidores WHERE id = $1`,
      [meterId],
    )
    if (!owned.rows[0]) {
      res.status(404).json({ error: 'Medidor do ensaio não encontrado.' })
      return
    }
    const id = newId('gcf')
    await query(
      `INSERT INTO gc_fotos (id, ensaio_medidor_id, kind, file_name, data_url, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (ensaio_medidor_id, kind) DO UPDATE SET
         file_name = EXCLUDED.file_name,
         data_url = EXCLUDED.data_url,
         created_at = NOW(),
         created_by_user_id = EXCLUDED.created_by_user_id`,
      [id, meterId, kind, String(body.fileName ?? '').slice(0, 180), dataUrl, userId],
    )
    res.json({ ok: true, kind, label: PHOTO_LABEL[kind as PhotoKind] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Não foi possível salvar a foto.' })
  }
}

export async function getGcLaudo(req: Request, res: Response) {
  try {
    const meterId = String(req.params.meterId ?? '')
    const result = await query<{
      id: string
      meter: string
      meter_name: string
      position: number
      validation: string
      tests: unknown
      seal1: string | null
      seal2: string | null
      seal_source: string | null
      title: string
      operator_name: string
      source_file: string
      created_at: Date
      created_by_name: string | null
    }>(
      `SELECT m.id, m.meter, m.meter_name, m.position, m.validation, m.tests,
              l.seal1, l.seal2, l.source_file AS seal_source,
              e.title, e.operator_name, e.source_file, e.created_at,
              u.name AS created_by_name
       FROM gc_ensaio_medidores m
       JOIN gc_ensaios e ON e.id = m.ensaio_id
       LEFT JOIN gc_lacres l ON l.meter = m.meter
       LEFT JOIN users u ON u.id = e.created_by_user_id
       WHERE m.id = $1`,
      [meterId],
    )
    const row = result.rows[0]
    if (!row) {
      res.status(404).json({ error: 'Laudo não encontrado.' })
      return
    }
    const photos = await query<{ kind: PhotoKind; file_name: string; data_url: string }>(
      `SELECT kind, file_name, data_url FROM gc_fotos WHERE ensaio_medidor_id = $1`,
      [meterId],
    )
    res.json({
      laudo: {
        id: row.id,
        meter: row.meter,
        meterName: row.meter_name,
        position: row.position,
        validation: row.validation,
        tests: asTests(row.tests),
        seal1: row.seal1 ?? '',
        seal2: row.seal2 ?? '',
        sealSourceFile: row.seal_source ?? '',
        title: row.title,
        operatorName: row.operator_name,
        sourceFile: row.source_file,
        createdAt: iso(row.created_at),
        createdByName: row.created_by_name,
        photos: photos.rows.map((photo) => ({
          kind: photo.kind,
          label: PHOTO_LABEL[photo.kind] ?? photo.kind,
          fileName: photo.file_name,
          dataUrl: photo.data_url,
        })),
      },
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Não foi possível abrir o laudo.' })
  }
}

type DestinationRow = {
  id: string
  client_name: string
  installation: string
  ns: string
  meter: string
  calibrated_on: string
  simplified: string
  category: string
  voltage: string
  rtp: string
  rtc: string
  max_demand: string
  address: string
  city: string
  remotas: string
  remote_collection: string
  withdrawn_by_note: string
  source_file: string
  withdrawal_status: string
  signer_name: string
  signed_at: Date | null
  signed_by_user_id: string | null
  released_at: Date | null
  released_by_name: string
  withdrawn_at: Date | null
  imported_at: Date
  has_signature: boolean
}

function mapDestination(row: DestinationRow) {
  return {
    id: row.id,
    clientName: row.client_name,
    installation: row.installation,
    ns: row.ns,
    meter: row.meter,
    calibratedOn: row.calibrated_on,
    simplified: row.simplified,
    category: row.category,
    voltage: row.voltage,
    rtp: row.rtp,
    rtc: row.rtc,
    maxDemand: row.max_demand,
    address: row.address,
    city: row.city,
    remotas: row.remotas,
    remoteCollection: row.remote_collection,
    withdrawnByNote: row.withdrawn_by_note,
    sourceFile: row.source_file,
    withdrawalStatus: row.withdrawal_status,
    signerName: row.signer_name,
    signedAt: iso(row.signed_at),
    signedByUserId: row.signed_by_user_id,
    releasedAt: iso(row.released_at),
    releasedByName: row.released_by_name,
    withdrawnAt: iso(row.withdrawn_at),
    importedAt: iso(row.imported_at),
    hasSignature: row.has_signature,
  }
}

const DESTINATION_SELECT = `
  id, client_name, installation, ns, meter, calibrated_on, simplified, category,
  voltage, rtp, rtc, max_demand, address, city, remotas, remote_collection,
  withdrawn_by_note, source_file, withdrawal_status, signer_name, signed_at,
  signed_by_user_id, released_at, released_by_name, withdrawn_at, imported_at,
  (signature_data <> '') AS has_signature
`

export async function importGcDestinacoes(req: Request, res: Response) {
  const userId = req.user?.id ?? null
  try {
    const body = req.body as { fileName?: string; fileBase64?: string }
    const rows = parseGcDestinationWorkbook(decodeBase64File(body.fileBase64, 'destinação'))
    const sourceFile = String(body.fileName ?? '').slice(0, 240)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const item of rows) {
        await client.query(
          `INSERT INTO gc_destinacoes (
             id, client_name, installation, ns, meter, calibrated_on, simplified, category,
             voltage, rtp, rtc, max_demand, address, city, remotas, remote_collection,
             withdrawn_by_note, source_file, imported_by_user_id
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
           )`,
          [
            newId('gcd'),
            item.clientName.slice(0, 240),
            item.installation.slice(0, 80),
            item.ns.slice(0, 80),
            item.meter,
            item.calibratedOn.slice(0, 40),
            item.simplified.slice(0, 40),
            item.category.slice(0, 40),
            item.voltage.slice(0, 40),
            item.rtp.slice(0, 40),
            item.rtc.slice(0, 40),
            item.maxDemand.slice(0, 40),
            item.address.slice(0, 240),
            item.city.slice(0, 120),
            item.remotas.slice(0, 80),
            item.remoteCollection.slice(0, 80),
            item.withdrawnByNote.slice(0, 120),
            sourceFile,
            userId,
          ],
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    await writeAuditLog(req, {
      action: 'register',
      entityType: 'grandes_clientes',
      entityId: 'destinacao',
      summary: `Destinação de Grandes Clientes importada (${rows.length} medidor(es)).`,
      metadata: { rows: rows.length, sourceFile },
    })
    res.status(201).json({ count: rows.length })
  } catch (error) {
    if (sendImportError(res, error)) return
    console.error(error)
    res.status(500).json({ error: 'Não foi possível importar a destinação.' })
  }
}

export async function listGcDestinacoes(req: Request, res: Response) {
  try {
    const q = String(req.query.q ?? '').trim()
    const params: unknown[] = []
    let where = ''
    if (q) {
      params.push(`%${q}%`)
      where = `WHERE client_name ILIKE $1 OR meter ILIKE $1 OR city ILIKE $1
               OR installation ILIKE $1 OR ns ILIKE $1`
    }
    const result = await query<DestinationRow>(
      `SELECT ${DESTINATION_SELECT}
       FROM gc_destinacoes
       ${where}
       ORDER BY imported_at DESC, client_name, meter
       LIMIT 400`,
      params,
    )
    res.json({ destinacoes: result.rows.map((row) => mapDestination(row)) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Não foi possível carregar o histórico de destinação.' })
  }
}

export async function getGcDestinacao(req: Request, res: Response) {
  try {
    const result = await query(
      `SELECT ${DESTINATION_SELECT}, signature_data
       FROM gc_destinacoes
       WHERE id = $1`,
      [String(req.params.id ?? '')],
    )
    const row = result.rows[0] as (Parameters<typeof mapDestination>[0] & {
      signature_data: string
    }) | undefined
    if (!row) {
      res.status(404).json({ error: 'Destinação não encontrada.' })
      return
    }
    res.json({
      destinacao: {
        ...mapDestination(row),
        signatureData: row.signature_data,
      },
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Não foi possível abrir o termo.' })
  }
}

export async function signGcTermo(req: Request, res: Response) {
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Sessão expirada.' })
    return
  }
  try {
    const body = req.body as { signatureData?: string; signerName?: string }
    const signatureData = String(body.signatureData ?? '')
    const signerName = String(body.signerName ?? '').trim()
    if (!signatureData.startsWith('data:image/') || signatureData.length < 80) {
      res.status(400).json({ error: 'Assine o termo de retirada.' })
      return
    }
    if (signatureData.length > 1_200_000) {
      res.status(400).json({ error: 'A assinatura ficou grande demais.' })
      return
    }
    if (signerName.length < 3) {
      res.status(400).json({ error: 'Informe o nome de quem assina o termo.' })
      return
    }
    const id = String(req.params.id ?? '')
    const current = await query<{ withdrawal_status: string }>(
      `SELECT withdrawal_status FROM gc_destinacoes WHERE id = $1`,
      [id],
    )
    const status = current.rows[0]?.withdrawal_status
    if (!status) {
      res.status(404).json({ error: 'Destinação não encontrada.' })
      return
    }
    if (status !== 'disponivel') {
      res.status(409).json({ error: 'Este medidor já tem termo de retirada assinado.' })
      return
    }
    await query(
      `UPDATE gc_destinacoes
       SET withdrawal_status = 'aguardando_sab',
           signature_data = $2,
           signer_name = $3,
           signed_at = NOW(),
           signed_by_user_id = $4
       WHERE id = $1 AND withdrawal_status = 'disponivel'`,
      [id, signatureData, signerName.slice(0, 160), userId],
    )
    await writeAuditLog(req, {
      action: 'register',
      entityType: 'grandes_clientes',
      entityId: id,
      summary: `Termo de retirada assinado por ${signerName}. Aguardando liberação da SAB.`,
    })
    res.json({ ok: true, withdrawalStatus: 'aguardando_sab' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Não foi possível registrar o termo.' })
  }
}

export async function releaseGcRetirada(req: Request, res: Response) {
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Sessão expirada.' })
    return
  }
  try {
    if (!(await canRelease(req))) {
      res.status(403).json({
        error: 'Somente um usuário de Grandes Clientes (SAB) pode liberar a retirada.',
      })
      return
    }
    const id = String(req.params.id ?? '')
    const current = await query<{
      withdrawal_status: string
      signed_by_user_id: string | null
      meter: string
    }>(
      `SELECT withdrawal_status, signed_by_user_id, meter FROM gc_destinacoes WHERE id = $1`,
      [id],
    )
    const row = current.rows[0]
    if (!row) {
      res.status(404).json({ error: 'Destinação não encontrada.' })
      return
    }
    if (row.withdrawal_status === 'disponivel') {
      res.status(409).json({ error: 'O termo de retirada ainda não foi assinado.' })
      return
    }
    if (row.withdrawal_status === 'retirada') {
      res.status(409).json({ error: 'A retirada deste medidor já foi liberada.' })
      return
    }
    if (row.signed_by_user_id === userId && req.user?.role !== 'admin') {
      res.status(403).json({
        error:
          'Quem assinou o termo não pode liberar a própria retirada. A liberação é feita por outro usuário de Grandes Clientes (SAB).',
      })
      return
    }
    const person = await actor(userId)
    const updated = await query(
      `UPDATE gc_destinacoes
       SET withdrawal_status = 'retirada',
           released_at = NOW(),
           released_by_user_id = $2,
           released_by_name = $3,
           withdrawn_at = NOW()
       WHERE id = $1 AND withdrawal_status = 'aguardando_sab'
       RETURNING id`,
      [id, userId, person.name.slice(0, 160)],
    )
    if (!updated.rows[0]) {
      res.status(409).json({ error: 'A retirada não está mais aguardando liberação.' })
      return
    }
    await writeAuditLog(req, {
      action: 'approve',
      entityType: 'grandes_clientes',
      entityId: id,
      summary: `Retirada do medidor ${row.meter} liberada pela SAB.`,
    })
    res.json({ ok: true, withdrawalStatus: 'retirada' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Não foi possível liberar a retirada.' })
  }
}
