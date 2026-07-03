import type { Request } from 'express'
import { query } from './db.js'

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'register'
  | 'block'
  | 'unblock'

export type AuditEntityType =
  | 'user'
  | 'homologation_request'
  | 'material'
  | 'manufacturer'
  | 'password_record'
  | 'ratm_laudo'
  | 'ensaios_manual_block'
  | 'csd'
  | 'satisfaction_survey'
  | 'meter_schedule'
  | 'demm_document'

export type AuditLogEntry = {
  action: AuditAction
  entityType: AuditEntityType
  entityId?: string | null
  summary?: string
  oldData?: unknown
  newData?: unknown
  metadata?: Record<string, unknown>
}

function redactSensitiveValue(key: string, value: unknown): unknown {
  if (/password/i.test(key) || key === 'password_hash' || key === 'cpf') {
    return '[oculto]'
  }

  if (value && typeof value === 'object') {
    return sanitizeAuditPayload(value)
  }

  return value
}

export function sanitizeAuditPayload(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditPayload(item))
  }

  if (!data || typeof data !== 'object') {
    return data
  }

  const record = data as Record<string, unknown>
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(record)) {
    sanitized[key] = redactSensitiveValue(key, value)
  }

  return sanitized
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? null
  }
  return req.ip ?? null
}

export async function writeAuditLog(req: Request, entry: AuditLogEntry): Promise<void> {
  try {
    const user = req.user

    await query(
      `INSERT INTO audit_logs (
        user_id, user_registration, user_role, action, entity_type, entity_id,
        summary, ip_address, user_agent, old_data, new_data, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb)`,
      [
        user?.id ?? null,
        user?.registration ?? null,
        user?.role ?? null,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.summary ?? null,
        getClientIp(req),
        typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        entry.oldData ? JSON.stringify(sanitizeAuditPayload(entry.oldData)) : null,
        entry.newData ? JSON.stringify(sanitizeAuditPayload(entry.newData)) : null,
        JSON.stringify(entry.metadata ?? {}),
      ],
    )
  } catch (error) {
    console.error('Falha ao registrar auditoria:', error)
  }
}
