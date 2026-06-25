import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAdmin, requireAuth } from '../auth.js'

type RequestRow = {
  id: string
  requester_user_id: string
  requester_name: string
  requester_registration: string
  requester_email: string
  requester_area: string
  order_number: string
  manufacturer: string
  justification: string
  requested_at: Date
  status: string
}

type ItemRow = {
  request_id: string
  equipment_type: string
  material_code: string
  quantity: number
  description: string
}

function mapRequest(row: RequestRow, items: ItemRow[]) {
  return {
    id: row.id,
    requesterUserId: row.requester_user_id,
    requesterName: row.requester_name,
    requesterRegistration: row.requester_registration,
    requesterEmail: row.requester_email,
    requesterArea: row.requester_area as 'Compras',
    orderNumber: row.order_number,
    manufacturer: row.manufacturer,
    items: items
      .filter((item) => item.request_id === row.id)
      .map((item) => ({
        equipmentType: item.equipment_type,
        materialCode: item.material_code,
        quantity: item.quantity,
        description: item.description,
      })),
    justification: row.justification,
    requestedAt: row.requested_at.toISOString(),
    status: row.status as 'Recebido',
  }
}

export async function listHomologationRequests(_req: Request, res: Response) {
  const requests = await query<RequestRow>(
    'SELECT * FROM homologation_requests ORDER BY requested_at DESC',
  )
  const items = await query<ItemRow>(
    'SELECT request_id, equipment_type, material_code, quantity, description FROM homologation_request_items',
  )
  res.json({
    requests: requests.rows.map((row) => mapRequest(row, items.rows)),
  })
}

export async function createHomologationRequest(req: Request, res: Response) {
  const { orderNumber, manufacturer, items, justification } = req.body as {
    orderNumber?: string
    manufacturer?: string
    items?: Array<{
      equipmentType: string
      materialCode: string
      quantity: number
      description: string
    }>
    justification?: string
  }

  if (!orderNumber?.trim() || !manufacturer?.trim() || !items?.length) {
    res.status(400).json({ error: 'Preencha os campos obrigatórios do pedido.' })
    return
  }

  const validItems = items.filter(
    (item) =>
      item.equipmentType?.trim() &&
      item.materialCode?.trim() &&
      item.description?.trim() &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0,
  )

  if (!validItems.length) {
    res.status(400).json({ error: 'Informe ao menos um item válido.' })
    return
  }

  const userResult = await query<{
    id: string
    name: string
    registration: string
    email: string
  }>('SELECT id, name, registration, email FROM users WHERE id = $1', [req.user!.id])

  const user = userResult.rows[0]
  if (!user) {
    res.status(401).json({ error: 'Usuário não encontrado.' })
    return
  }

  const id = `${Date.now()}-${user.id}`

  await query(
    `INSERT INTO homologation_requests (
      id, requester_user_id, requester_name, requester_registration,
      requester_email, order_number, manufacturer, justification
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      user.id,
      user.name,
      user.registration,
      user.email,
      orderNumber.trim(),
      manufacturer.trim(),
      justification?.trim() ?? '',
    ],
  )

  for (const item of validItems) {
    await query(
      `INSERT INTO homologation_request_items
       (request_id, equipment_type, material_code, quantity, description)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        id,
        item.equipmentType.trim(),
        item.materialCode.trim(),
        item.quantity,
        item.description.trim(),
      ],
    )
  }

  const created = await query<RequestRow>('SELECT * FROM homologation_requests WHERE id = $1', [id])
  const createdItems = await query<ItemRow>(
    'SELECT request_id, equipment_type, material_code, quantity, description FROM homologation_request_items WHERE request_id = $1',
    [id],
  )

  res.status(201).json({
    request: mapRequest(created.rows[0], createdItems.rows),
  })
}

export const homologationRoutes = {
  list: [requireAuth, requireAdmin, listHomologationRequests],
  create: [requireAuth, createHomologationRequest],
}
