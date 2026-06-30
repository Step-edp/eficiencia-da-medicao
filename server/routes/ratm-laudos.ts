import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'

type RatmLaudoRow = {
  id: string
  ratm_number: number
  meter: string
  client: string
  created_at: Date
  status: 'Pendente' | 'Aprovado' | 'Reprovado'
  form_data: Record<string, unknown>
}

function mapRatmLaudo(row: RatmLaudoRow) {
  return {
    id: row.id,
    ratmNumber: row.ratm_number,
    meter: row.meter,
    client: row.client,
    createdAt: row.created_at.toISOString(),
    status: row.status,
    formData: row.form_data,
  }
}

export async function listRatmLaudos(_req: Request, res: Response) {
  const result = await query<RatmLaudoRow>(
    'SELECT * FROM ratm_laudos ORDER BY created_at DESC',
  )

  res.json({ laudos: result.rows.map(mapRatmLaudo) })
}

export async function createRatmLaudos(req: Request, res: Response) {
  const forms = req.body?.forms

  if (!Array.isArray(forms) || forms.length === 0) {
    res.status(400).json({ error: 'Informe os formulários RATM para gerar os laudos.' })
    return
  }

  const batchId = Date.now()
  const createdLaudos = []

  for (let index = 0; index < forms.length; index += 1) {
    const form = forms[index] as { meter?: string; client?: string }

    if (!form.meter?.trim()) {
      res.status(400).json({ error: `Informe o medidor no RATM ${index + 1}.` })
      return
    }

    const id = `laudo-${batchId}-${index + 1}`
    const meter = form.meter.trim()
    const client = form.client?.trim() || 'Não informado'

    const result = await query<RatmLaudoRow>(
      `INSERT INTO ratm_laudos (
        id, ratm_number, meter, client, status, form_data, created_by_user_id
      ) VALUES ($1, $2, $3, $4, 'Pendente', $5, $6)
      RETURNING *`,
      [id, index + 1, meter, client, forms[index], req.user?.id ?? null],
    )

    createdLaudos.push(mapRatmLaudo(result.rows[0]))
  }

  res.status(201).json({ laudos: createdLaudos })
}

export const ratmLaudoRoutes = {
  list: [requireAuth, listRatmLaudos],
  create: [requireAuth, createRatmLaudos],
}
