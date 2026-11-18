import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { writeAuditLog } from '../audit.js'

const MAX_ATTACHMENT_CHARS = 280_000_000

type SoftwareRow = {
  id: number
  name: string
  description: string
  version_label: string
  attachment: string
  attachment_name: string
  link_url: string
  created_at: Date
  created_by_user_id: string | null
  created_by_name: string | null
  created_by_registration: string | null
}

function mapSoftware(
  row: Omit<SoftwareRow, 'attachment'> & { attachment?: string },
  includeAttachment = false,
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    versionLabel: row.version_label || '',
    attachmentName: row.attachment_name || '',
    linkUrl: row.link_url || '',
    hasAttachment: Boolean(row.attachment && row.attachment.length > 0),
    ...(includeAttachment ? { attachment: row.attachment || '' } : {}),
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name || '',
    createdByRegistration: row.created_by_registration || '',
  }
}

function isAllowedAttachment(dataUrl: string) {
  if (!dataUrl.startsWith('data:')) return false
  const comma = dataUrl.indexOf(',')
  return comma > 5 && dataUrl.length > comma + 1
}

function linkPermitido(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export async function listSoftwares(_req: Request, res: Response) {
  const result = await query<Omit<SoftwareRow, 'attachment'> & { has_attachment: boolean }>(
    `SELECT s.id, s.name, s.description, s.version_label, s.attachment_name, s.link_url,
            s.created_at, s.created_by_user_id,
            (s.attachment IS NOT NULL AND s.attachment <> '') AS has_attachment,
            u.name AS created_by_name,
            u.registration AS created_by_registration
     FROM softwares s
     LEFT JOIN users u ON u.id = s.created_by_user_id
     ORDER BY s.created_at DESC, s.id DESC`,
  )

  res.json({
    softwares: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      versionLabel: row.version_label || '',
      attachmentName: row.attachment_name || '',
      linkUrl: row.link_url || '',
      hasAttachment: Boolean(row.has_attachment),
      createdAt: row.created_at.toISOString(),
      createdByUserId: row.created_by_user_id,
      createdByName: row.created_by_name || '',
      createdByRegistration: row.created_by_registration || '',
    })),
  })
}

export async function createSoftware(req: Request, res: Response) {
  const { name, description, versionLabel, attachment, attachmentName, linkUrl } = req.body as Record<
    string,
    string | undefined
  >

  if (!name?.trim()) {
    res.status(400).json({ error: 'Informe o nome do software.' })
    return
  }

  const attachmentValue = typeof attachment === 'string' ? attachment.trim() : ''
  const attachmentNameValue =
    typeof attachmentName === 'string' ? attachmentName.trim() : ''
  const linkValue = typeof linkUrl === 'string' ? linkUrl.trim() : ''
  const temArquivo = attachmentValue.length > 0
  const temLink = linkValue.length > 0

  if (!temArquivo && !temLink) {
    res.status(400).json({ error: 'Anexe um arquivo ou informe um link.' })
    return
  }
  if (temArquivo && attachmentValue.length > MAX_ATTACHMENT_CHARS) {
    res.status(400).json({ error: 'O arquivo passa do limite de 200 MB.' })
    return
  }
  if (temArquivo && !isAllowedAttachment(attachmentValue)) {
    res.status(400).json({
      error: 'Não foi possível ler o arquivo. Selecione de novo.',
    })
    return
  }
  if (temLink && (linkValue.length > 2000 || !linkPermitido(linkValue))) {
    res.status(400).json({ error: 'Informe um link que comece com http:// ou https://.' })
    return
  }

  const result = await query<
    Omit<SoftwareRow, 'created_by_name' | 'created_by_registration'>
  >(
    `INSERT INTO softwares
       (name, description, version_label, attachment, attachment_name, link_url, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      name.trim(),
      description?.trim() || '',
      versionLabel?.trim() || '',
      attachmentValue,
      temArquivo ? attachmentNameValue || 'arquivo' : '',
      linkValue,
      req.user?.id ?? null,
    ],
  )

  const created = mapSoftware(
    {
      ...result.rows[0],
      created_by_name: '',
      created_by_registration: req.user?.registration ?? '',
    },
    false,
  )

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'software',
    entityId: String(created.id),
    summary: `Software ${created.name}`,
    newData: {
      ...created,
      attachment: attachmentValue ? '[arquivo anexado]' : '',
      linkUrl: linkValue,
    },
  })

  res.status(201).json({ software: created })
}

export async function getSoftwareAttachment(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Identificador inválido.' })
    return
  }

  const result = await query<{
    attachment: string
    attachment_name: string
  }>(
    `SELECT attachment, attachment_name
     FROM softwares
     WHERE id = $1`,
    [id],
  )

  const row = result.rows[0]
  if (!row || !row.attachment) {
    res.status(404).json({ error: 'Anexo não encontrado.' })
    return
  }

  res.json({
    attachment: row.attachment,
    attachmentName: row.attachment_name || 'anexo',
  })
}

export const softwareRoutes = {
  list: [requireAuth, listSoftwares],
  create: [requireAuth, createSoftware],
  attachment: [requireAuth, getSoftwareAttachment],
}
