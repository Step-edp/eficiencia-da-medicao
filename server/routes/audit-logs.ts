import type { Request, Response } from 'express'
import { query } from '../db.js'

type AuditLogRow = {
  id: string
  occurred_at: Date
  user_id: string | null
  user_registration: string | null
  user_role: string | null
  action: string
  entity_type: string
  entity_id: string | null
  summary: string | null
  ip_address: string | null
  user_agent: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}

function mapAuditLog(row: AuditLogRow) {
  return {
    id: String(row.id),
    occurredAt: row.occurred_at.toISOString(),
    userId: row.user_id,
    userRegistration: row.user_registration,
    userRole: row.user_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    oldData: row.old_data,
    newData: row.new_data,
    metadata: row.metadata ?? {},
  }
}

export async function listAuditLogs(req: Request, res: Response) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const entityType =
    typeof req.query.entityType === 'string' ? req.query.entityType.trim() : ''
  const action = typeof req.query.action === 'string' ? req.query.action.trim() : ''

  const conditions: string[] = []
  const params: Array<string | number> = []

  if (entityType) {
    params.push(entityType)
    conditions.push(`entity_type = $${params.length}`)
  }

  if (action) {
    params.push(action)
    conditions.push(`action = $${params.length}`)
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  params.push(limit)
  const limitParam = `$${params.length}`
  params.push(offset)
  const offsetParam = `$${params.length}`

  const result = await query<AuditLogRow>(
    `SELECT id, occurred_at, user_id, user_registration, user_role, action, entity_type,
            entity_id, summary, ip_address, user_agent, old_data, new_data, metadata
     FROM audit_logs
     ${whereClause}
     ORDER BY occurred_at DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
  )

  const countResult = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM audit_logs ${whereClause}`,
    params.slice(0, params.length - 2),
  )

  res.json({
    logs: result.rows.map(mapAuditLog),
    total: Number(countResult.rows[0]?.total ?? 0),
    limit,
    offset,
  })
}
