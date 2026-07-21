import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { writeAuditLog } from '../audit.js'

const MAX_ATTACHMENT_CHARS = 20_000_000

const ALLOWED_ATTACHMENT_PREFIXES = [
  'data:application/pdf',
  'data:application/vnd.ms-powerpoint',
  'data:application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'data:application/msword',
  'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'data:application/vnd.ms-excel',
  'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'data:application/vnd.oasis.opendocument.',
  'data:image/',
  'data:application/octet-stream',
]

type PresentationRow = {
  id: number
  name: string
  description: string
  link: string
  attachment: string
  attachment_name: string
  created_at: Date
  created_by_user_id: string | null
  created_by_name: string | null
  created_by_registration: string | null
}

function mapPresentation(
  row: Omit<PresentationRow, 'attachment'> & { attachment?: string },
  includeAttachment = false,
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    link: row.link || '',
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
  return ALLOWED_ATTACHMENT_PREFIXES.some((prefix) => dataUrl.startsWith(prefix))
}

export async function listPresentations(_req: Request, res: Response) {
  const result = await query<Omit<PresentationRow, 'attachment'> & { has_attachment: boolean }>(
    `SELECT p.id, p.name, p.description, p.link, p.attachment_name,
            p.created_at, p.created_by_user_id,
            (p.attachment IS NOT NULL AND p.attachment <> '') AS has_attachment,
            u.name AS created_by_name,
            u.registration AS created_by_registration
     FROM presentations p
     LEFT JOIN users u ON u.id = p.created_by_user_id
     ORDER BY p.created_at DESC, p.id DESC`,
  )

  res.json({
    presentations: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      link: row.link || '',
      attachmentName: row.attachment_name || '',
      hasAttachment: Boolean(row.has_attachment),
      createdAt: row.created_at.toISOString(),
      createdByUserId: row.created_by_user_id,
      createdByName: row.created_by_name || '',
      createdByRegistration: row.created_by_registration || '',
    })),
  })
}

export async function createPresentation(req: Request, res: Response) {
  const { name, description, link, attachment, attachmentName } = req.body as Record<
    string,
    string | undefined
  >

  if (!name?.trim()) {
    res.status(400).json({ error: 'Informe o nome da apresentação.' })
    return
  }

  if (!description?.trim()) {
    res.status(400).json({ error: 'Informe a descrição da apresentação.' })
    return
  }

  const linkValue = link?.trim() ?? ''
  if (linkValue) {
    try {
      const parsed = new URL(linkValue)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        res.status(400).json({ error: 'O link deve começar com http:// ou https://.' })
        return
      }
    } catch {
      res.status(400).json({ error: 'Informe um link válido.' })
      return
    }
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
        error:
          'Anexo inválido ou muito grande. Use PDF, PowerPoint, Word, Excel ou imagem (até ~15 MB).',
      })
      return
    }
  }

  const result = await query<Omit<PresentationRow, 'created_by_name' | 'created_by_registration'>>(
    `INSERT INTO presentations
       (name, description, link, attachment, attachment_name, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      name.trim(),
      description.trim(),
      linkValue,
      attachmentValue,
      attachmentValue ? attachmentNameValue || 'anexo' : '',
      req.user?.id ?? null,
    ],
  )

  const created = mapPresentation(
    {
      ...result.rows[0],
      created_by_name: req.user?.name ?? '',
      created_by_registration: req.user?.registration ?? '',
    },
    false,
  )

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'presentation',
    entityId: String(created.id),
    summary: `Apresentação ${created.name}`,
    newData: {
      ...created,
      attachment: attachmentValue ? '[arquivo anexado]' : '',
    },
  })

  res.status(201).json({ presentation: created })
}

export async function getPresentationAttachment(req: Request, res: Response) {
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
     FROM presentations
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

export const presentationRoutes = {
  list: [requireAuth, listPresentations],
  create: [requireAuth, createPresentation],
  attachment: [requireAuth, getPresentationAttachment],
}
