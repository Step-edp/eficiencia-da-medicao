import type { Request, Response } from 'express'
import { query } from '../db.js'
import { writeAuditLog } from '../audit.js'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type ManualBlockRow = {
  blocked_date: string
  reason: string
}

function mapBlock(row: ManualBlockRow) {
  return {
    date: row.blocked_date.slice(0, 10),
    reason: row.reason,
  }
}

export async function listManualBlocks(_req: Request, res: Response) {
  const result = await query<ManualBlockRow>(
    `SELECT blocked_date::text, reason
     FROM ensaios_manual_blocks
     ORDER BY blocked_date`,
  )
  res.json({ blocks: result.rows.map(mapBlock) })
}

export async function toggleManualBlock(req: Request, res: Response) {
  const date = String(req.body?.date ?? '')
  const reason = String(req.body?.reason ?? '').trim()

  if (!DATE_PATTERN.test(date)) {
    res.status(400).json({ error: 'Data inválida. Use o formato YYYY-MM-DD.' })
    return
  }

  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    res.status(400).json({ error: 'Data inválida.' })
    return
  }

  const existing = await query<ManualBlockRow>(
    `SELECT blocked_date::text, reason
     FROM ensaios_manual_blocks
     WHERE blocked_date = $1::date`,
    [date],
  )

  if (existing.rowCount) {
    const previous = mapBlock(existing.rows[0])

    await query(`DELETE FROM ensaios_manual_blocks WHERE blocked_date = $1::date`, [date])

    await writeAuditLog(req, {
      action: 'unblock',
      entityType: 'ensaios_manual_block',
      entityId: date,
      summary: `Desbloqueio manual: ${date}`,
      oldData: previous,
    })
  } else {
    if (!reason) {
      res.status(400).json({ error: 'Informe o motivo do bloqueio manual.' })
      return
    }

    await query(
      `INSERT INTO ensaios_manual_blocks (blocked_date, reason, created_by_user_id)
       VALUES ($1::date, $2, $3)`,
      [date, reason, req.user?.id ?? null],
    )

    await writeAuditLog(req, {
      action: 'block',
      entityType: 'ensaios_manual_block',
      entityId: date,
      summary: `Bloqueio manual: ${date}`,
      newData: { date, reason },
    })
  }

  const all = await query<ManualBlockRow>(
    `SELECT blocked_date::text, reason
     FROM ensaios_manual_blocks
     ORDER BY blocked_date`,
  )

  res.json({
    blocks: all.rows.map(mapBlock),
    blocked: !existing.rowCount,
  })
}
