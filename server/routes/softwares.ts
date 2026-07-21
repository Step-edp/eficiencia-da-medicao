import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { writeAuditLog } from '../audit.js'

const MAX_ATTACHMENT_CHARS = 20_000_000

type SoftwareRow = {
  id: number
  name: string
  description: string
  attachment: string
  attachment_name: string
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
    attachmentName: row.attachment_name || '',
    hasAttachment: Boolean(row.attachment_name || (row.attachment && row.attachment.length > 0)),
    ...(includeAttachment ? { attachment: row.attachment || '' } : {}),
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name || '',
    createdByRegistration: row.created_by_registration || '',
  }
}

function isAllowedAttachment(dataUrl: string) {
  return dataUrl.startsWith('data:') && dataUrl.includes(';base64,')
}

export async function listSoftwares(_req: Request, res: Response) {
  const result = await query<Omit<SoftwareRow, 'attachment'> & { has_attachment: boolean }>(
    `SELECT s.id, s.name, s.description, s.attachment_name,
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
      attachmentName: row.attachment_name || '',
      hasAttachment: Boolean(row.has_attachment),
      createdAt: row.created_at.toISOString(),
      createdByUserId: row.created_by_user_id,
      createdByName: row.created_by_name || '',
      createdByRegistration: row.created_by_registration || '',
    })),
  })
}

export async function createSoftware(req: Request, res: Response) {
  const { name, description, attachment, attachmentName } = req.body as Record<
    string,
    string | undefined
  >

  if (!name?.trim()) {
    res.status(400).json({ error: 'Informe o nome do software.' })
    return
  }

  if (!description?.trim()) {
    res.status(400).json({ error: 'Informe a descrição do software.' })
    return
  }

  const attachmentValue = typeof attachment === 'string' ? attachment.trim() : ''
  const attachmentNameValue =
    typeof attachmentName === 'string' ? attachmentName.trim() : ''

  if (attachmentValue) {
    if (
      !isAllowedAttachment(attachmentValue) ||
      attachmentValue.length > MAX_ATTACHMENT_CHARS
    ) {
      res.status(400).json({
        error: 'Anexo inválido ou muito grande. Use um arquivo de até 15 MB.',
      })
      return
    }
  }

  const result = await query<
    Omit<SoftwareRow, 'created_by_name' | 'created_by_registration'>
  >(
    `INSERT INTO softwares
       (name, description, attachment, attachment_name, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      name.trim(),
      description.trim(),
      attachmentValue,
      attachmentValue ? attachmentNameValue || 'anexo' : '',
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
