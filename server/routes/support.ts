import type { Request, Response } from 'express'
import { query } from '../db.js'
import { writeAuditLog } from '../audit.js'

type SupportTicketRow = {
  id: string
  ticket_number: string
  requester_user_id: string
  requester_name: string
  requester_registration: string
  subject: string
  message: string
  status: 'aberto' | 'respondido' | 'fechado'
  response: string
  responded_by_user_id: string | null
  responded_by_name: string
  responded_at: Date | null
  created_at: Date
  updated_at: Date
}

function mapTicket(row: SupportTicketRow) {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    requesterUserId: row.requester_user_id,
    requesterName: row.requester_name,
    requesterRegistration: row.requester_registration,
    subject: row.subject,
    message: row.message,
    status: row.status,
    response: row.response,
    respondedByUserId: row.responded_by_user_id,
    respondedByName: row.responded_by_name,
    respondedAt: row.responded_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

async function nextTicketNumber() {
  const result = await query<{ n: string }>(
    `SELECT nextval('support_ticket_seq')::text AS n`,
  )
  return `SUP-${String(result.rows[0].n).padStart(5, '0')}`
}

export async function listSupportTickets(req: Request, res: Response) {
  const mineOnly = req.query.mine === '1' || req.query.mine === 'true'
  const userId = req.user?.id

  const result = mineOnly && userId
    ? await query<SupportTicketRow>(
        `SELECT *
         FROM support_tickets
         WHERE requester_user_id = $1
         ORDER BY created_at DESC`,
        [userId],
      )
    : await query<SupportTicketRow>(
        `SELECT *
         FROM support_tickets
         ORDER BY created_at DESC`,
      )

  res.json({ tickets: result.rows.map(mapTicket) })
}

export async function createSupportTicket(req: Request, res: Response) {
  const user = req.user
  if (!user) {
    res.status(401).json({ error: 'Não autenticado.' })
    return
  }

  const subject =
    typeof req.body?.subject === 'string' ? req.body.subject.trim() : ''
  const message =
    typeof req.body?.message === 'string' ? req.body.message.trim() : ''

  if (!message) {
    res.status(400).json({ error: 'Descreva sua solicitação.' })
    return
  }

  const profile = await query<{ name: string; registration: string }>(
    `SELECT name, registration FROM users WHERE id = $1`,
    [user.id],
  )

  if (!profile.rows[0]) {
    res.status(404).json({ error: 'Usuário não encontrado.' })
    return
  }

  const id = `sup-${Date.now()}`
  const ticketNumber = await nextTicketNumber()

  const insert = await query<SupportTicketRow>(
    `INSERT INTO support_tickets (
       id, ticket_number, requester_user_id, requester_name, requester_registration,
       subject, message, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'aberto')
     RETURNING *`,
    [
      id,
      ticketNumber,
      user.id,
      profile.rows[0].name,
      profile.rows[0].registration,
      subject || 'Solicitação de suporte',
      message,
    ],
  )

  const ticket = mapTicket(insert.rows[0])

  await writeAuditLog(req, {
    action: 'create',
    entityType: 'support_ticket',
    entityId: ticket.id,
    summary: `Chamado ${ticket.ticketNumber} aberto`,
    newData: ticket,
  })

  res.status(201).json({ ticket })
}

export async function replySupportTicket(req: Request, res: Response) {
  const user = req.user
  if (!user) {
    res.status(401).json({ error: 'Não autenticado.' })
    return
  }

  const { id } = req.params
  const responseText =
    typeof req.body?.response === 'string' ? req.body.response.trim() : ''

  if (!responseText) {
    res.status(400).json({ error: 'Informe a resposta do chamado.' })
    return
  }

  const existing = await query<SupportTicketRow>(
    `SELECT * FROM support_tickets WHERE id = $1`,
    [id],
  )

  if (!existing.rows[0]) {
    res.status(404).json({ error: 'Chamado não encontrado.' })
    return
  }

  const profile = await query<{ name: string }>(
    `SELECT name FROM users WHERE id = $1`,
    [user.id],
  )

  const updated = await query<SupportTicketRow>(
    `UPDATE support_tickets
     SET response = $2,
         status = 'respondido',
         responded_by_user_id = $3,
         responded_by_name = $4,
         responded_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, responseText, user.id, profile.rows[0]?.name ?? user.registration],
  )

  const previous = mapTicket(existing.rows[0])
  const ticket = mapTicket(updated.rows[0])

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'support_ticket',
    entityId: ticket.id,
    summary: `Chamado ${ticket.ticketNumber} respondido`,
    oldData: previous,
    newData: ticket,
  })

  res.json({ ticket })
}
