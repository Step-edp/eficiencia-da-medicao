import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { writeAuditLog } from '../audit.js'

const FIELD_TYPES = ['text', 'textarea', 'date', 'number'] as const
type FieldType = (typeof FIELD_TYPES)[number]

export type DocumentTemplateField = {
  key: string
  label: string
  type: FieldType
}

export type DocumentTemplateConfig = {
  code: string
  title: string
  subtitle: string
  fields: DocumentTemplateField[]
  showFieldsTable: boolean
  body: string
  signatures: string[]
  footer: string
}

type DocumentTemplateRow = {
  id: number
  name: string
  config: DocumentTemplateConfig
  created_at: Date
  updated_at: Date
  created_by_user_id: string | null
  created_by_name: string | null
}

const MAX_FIELDS = 60
const MAX_SIGNATURES = 6
const MAX_TEXT = 20_000

function asText(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function sanitizeConfig(raw: unknown): DocumentTemplateConfig | string {
  if (!raw || typeof raw !== 'object') return 'Configuração do modelo inválida.'
  const input = raw as Record<string, unknown>

  const title = asText(input.title, 200)
  if (!title) return 'Informe o título do documento.'

  const rawFields = Array.isArray(input.fields) ? input.fields : []
  if (rawFields.length > MAX_FIELDS) {
    return `O modelo pode ter no máximo ${MAX_FIELDS} campos.`
  }

  const seenKeys = new Set<string>()
  const fields: DocumentTemplateField[] = []
  for (const item of rawFields) {
    if (!item || typeof item !== 'object') continue
    const field = item as Record<string, unknown>
    const label = asText(field.label, 120)
    const key = asText(field.key, 60)
    if (!label || !key) return 'Todos os campos precisam de nome.'
    if (!/^[a-z0-9_]+$/.test(key)) return `Chave de campo inválida: ${key}.`
    if (seenKeys.has(key)) return `Campo repetido: ${label}.`
    seenKeys.add(key)
    const type = FIELD_TYPES.includes(field.type as FieldType)
      ? (field.type as FieldType)
      : 'text'
    fields.push({ key, label, type })
  }

  const signatures = (Array.isArray(input.signatures) ? input.signatures : [])
    .map((value) => asText(value, 120))
    .filter(Boolean)
    .slice(0, MAX_SIGNATURES)

  return {
    code: asText(input.code, 60),
    title,
    subtitle: asText(input.subtitle, 300),
    fields,
    showFieldsTable: input.showFieldsTable !== false,
    body: asText(input.body, MAX_TEXT),
    signatures,
    footer: asText(input.footer, 500),
  }
}

function mapTemplate(row: DocumentTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    config: row.config,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name || '',
  }
}

async function loadTemplate(id: number) {
  const result = await query<DocumentTemplateRow>(
    `SELECT t.id, t.name, t.config, t.created_at, t.updated_at,
            t.created_by_user_id, u.name AS created_by_name
     FROM document_templates t
     LEFT JOIN users u ON u.id = t.created_by_user_id
     WHERE t.id = $1`,
    [id],
  )
  return result.rows[0] ?? null
}

function parseId(req: Request) {
  const id = Number(req.params.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function listDocumentTemplates(_req: Request, res: Response) {
  const result = await query<DocumentTemplateRow>(
    `SELECT t.id, t.name, t.config, t.created_at, t.updated_at,
            t.created_by_user_id, u.name AS created_by_name
     FROM document_templates t
     LEFT JOIN users u ON u.id = t.created_by_user_id
     ORDER BY t.name ASC, t.id ASC`,
  )
  res.json({ templates: result.rows.map(mapTemplate) })
}

export async function createDocumentTemplate(req: Request, res: Response) {
  const name = asText(req.body?.name, 120)
  if (!name) {
    res.status(400).json({ error: 'Informe o nome do modelo.' })
    return
  }
  const config = sanitizeConfig(req.body?.config)
  if (typeof config === 'string') {
    res.status(400).json({ error: config })
    return
  }

  const inserted = await query<{ id: number }>(
    `INSERT INTO document_templates (name, config, created_by_user_id)
     VALUES ($1, $2::jsonb, $3)
     RETURNING id`,
    [name, JSON.stringify(config), req.user?.id ?? null],
  )
  const row = await loadTemplate(inserted.rows[0].id)
  const template = mapTemplate(row!)

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'document_template',
    entityId: String(template.id),
    summary: `Modelo de documento ${name}`,
    newData: template,
  })

  res.status(201).json({ template })
}

export async function updateDocumentTemplate(req: Request, res: Response) {
  const id = parseId(req)
  if (!id) {
    res.status(400).json({ error: 'Identificador inválido.' })
    return
  }
  const previous = await loadTemplate(id)
  if (!previous) {
    res.status(404).json({ error: 'Modelo não encontrado.' })
    return
  }
  const name = asText(req.body?.name, 120)
  if (!name) {
    res.status(400).json({ error: 'Informe o nome do modelo.' })
    return
  }
  const config = sanitizeConfig(req.body?.config)
  if (typeof config === 'string') {
    res.status(400).json({ error: config })
    return
  }

  await query(
    `UPDATE document_templates
     SET name = $1, config = $2::jsonb, updated_at = NOW()
     WHERE id = $3`,
    [name, JSON.stringify(config), id],
  )
  const template = mapTemplate((await loadTemplate(id))!)

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'document_template',
    entityId: String(id),
    summary: `Modelo de documento ${name} atualizado`,
    oldData: mapTemplate(previous),
    newData: template,
  })

  res.json({ template })
}

export async function deleteDocumentTemplate(req: Request, res: Response) {
  const id = parseId(req)
  if (!id) {
    res.status(400).json({ error: 'Identificador inválido.' })
    return
  }
  const previous = await loadTemplate(id)
  if (!previous) {
    res.status(404).json({ error: 'Modelo não encontrado.' })
    return
  }

  await query(`DELETE FROM document_templates WHERE id = $1`, [id])

  await writeAuditLog(req, {
    action: 'delete',
    entityType: 'document_template',
    entityId: String(id),
    summary: `Modelo de documento ${previous.name} excluído`,
    oldData: mapTemplate(previous),
  })

  res.json({ ok: true })
}

export const documentTemplateRoutes = {
  list: [requireAuth, listDocumentTemplates],
  create: [requireAuth, createDocumentTemplate],
  update: [requireAuth, updateDocumentTemplate],
  remove: [requireAuth, deleteDocumentTemplate],
}
