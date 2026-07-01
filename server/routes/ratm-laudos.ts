import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { generateRatmLaudoPdf } from '../ratm-laudo-pdf.js'

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
      ) VALUES ($1, $2, $3, $4, 'Pendente', $5::jsonb, $6)
      RETURNING *`,
      [id, index + 1, meter, client, JSON.stringify(forms[index]), req.user?.id ?? null],
    )

    createdLaudos.push(mapRatmLaudo(result.rows[0]))
  }

  res.status(201).json({ laudos: createdLaudos })
}

export async function updateRatmLaudo(req: Request, res: Response) {
  const { id } = req.params
  const form = req.body?.formData as { meter?: string; client?: string } | undefined

  if (!form || typeof form !== 'object') {
    res.status(400).json({ error: 'Informe os dados do laudo para edição.' })
    return
  }

  if (!form.meter?.trim()) {
    res.status(400).json({ error: 'Informe o medidor antes de salvar.' })
    return
  }

  const result = await query<RatmLaudoRow>(
    `UPDATE ratm_laudos
     SET form_data = $1::jsonb,
         meter = $2,
         client = $3
     WHERE id = $4 AND status = 'Pendente'
     RETURNING *`,
    [
      JSON.stringify(form),
      form.meter.trim(),
      form.client?.trim() || 'Não informado',
      id,
    ],
  )

  if (!result.rows[0]) {
    res.status(404).json({ error: 'Laudo pendente não encontrado para edição.' })
    return
  }

  res.json({ laudo: mapRatmLaudo(result.rows[0]) })
}

export async function approveRatmLaudo(req: Request, res: Response) {
  const { id } = req.params
  const clientPresent = req.body?.clientPresent

  if (clientPresent !== 'Sim' && clientPresent !== 'Não') {
    res.status(400).json({ error: 'Informe se o cliente está presente (Sim ou Não).' })
    return
  }

  const existing = await query<RatmLaudoRow>(
    'SELECT * FROM ratm_laudos WHERE id = $1 AND status = $2',
    [id, 'Pendente'],
  )

  if (!existing.rows[0]) {
    res.status(404).json({ error: 'Laudo pendente não encontrado para aprovação.' })
    return
  }

  const formData = {
    ...existing.rows[0].form_data,
    clientAccompanied: clientPresent,
  }

  const result = await query<RatmLaudoRow>(
    `UPDATE ratm_laudos
     SET status = 'Aprovado',
         form_data = $1::jsonb
     WHERE id = $2 AND status = 'Pendente'
     RETURNING *`,
    [JSON.stringify(formData), id],
  )

  res.json({ laudo: mapRatmLaudo(result.rows[0]) })
}

export async function downloadRatmLaudoPdf(req: Request, res: Response) {
  const { id } = req.params

  try {
    const result = await query<RatmLaudoRow>('SELECT * FROM ratm_laudos WHERE id = $1', [id])

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Laudo não encontrado.' })
      return
    }

    const laudo = mapRatmLaudo(result.rows[0])
    const filename = `laudo-ratm-${laudo.ratmNumber}-${laudo.meter}.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
    generateRatmLaudoPdf(laudo, res)
  } catch (error) {
    console.error('Erro ao gerar PDF do laudo:', error)

    if (!res.headersSent) {
      res.status(500).json({ error: 'Não foi possível gerar o laudo em PDF.' })
    }
  }
}

export const ratmLaudoRoutes = {
  list: [requireAuth, listRatmLaudos],
  create: [requireAuth, createRatmLaudos],
  update: [requireAuth, updateRatmLaudo],
  approve: [requireAuth, approveRatmLaudo],
  pdf: [requireAuth, downloadRatmLaudoPdf],
}
