import type { Request, Response } from 'express'
import { query } from '../db.js'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function listManualBlocks(_req: Request, res: Response) {
  const result = await query<{ blocked_date: string }>(
    `SELECT blocked_date::text FROM ensaios_manual_blocks ORDER BY blocked_date`,
  )
  res.json({ dates: result.rows.map((row) => row.blocked_date.slice(0, 10)) })
}

export async function toggleManualBlock(req: Request, res: Response) {
  const date = String(req.body?.date ?? '')

  if (!DATE_PATTERN.test(date)) {
    res.status(400).json({ error: 'Data inválida. Use o formato YYYY-MM-DD.' })
    return
  }

  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    res.status(400).json({ error: 'Data inválida.' })
    return
  }

  const existing = await query<{ blocked_date: string }>(
    `SELECT blocked_date::text FROM ensaios_manual_blocks WHERE blocked_date = $1::date`,
    [date],
  )

  if (existing.rowCount) {
    await query(`DELETE FROM ensaios_manual_blocks WHERE blocked_date = $1::date`, [date])
  } else {
    await query(
      `INSERT INTO ensaios_manual_blocks (blocked_date, created_by_user_id)
       VALUES ($1::date, $2)`,
      [date, req.user?.id ?? null],
    )
  }

  const all = await query<{ blocked_date: string }>(
    `SELECT blocked_date::text FROM ensaios_manual_blocks ORDER BY blocked_date`,
  )

  res.json({
    dates: all.rows.map((row) => row.blocked_date.slice(0, 10)),
    blocked: !existing.rowCount,
  })
}
