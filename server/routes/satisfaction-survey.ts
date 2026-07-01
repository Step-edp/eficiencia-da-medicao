import type { Request, Response } from 'express'
import { query } from '../db.js'

type RatmLaudoRow = {
  id: string
  ratm_number: number
  meter: string
  client: string
  status: string
  form_data: Record<string, unknown>
}

export async function getSatisfactionSurvey(req: Request, res: Response) {
  const { laudoId } = req.params

  const result = await query<RatmLaudoRow>(
    `SELECT id, ratm_number, meter, client, status, form_data
     FROM ratm_laudos
     WHERE id = $1`,
    [laudoId],
  )

  const laudo = result.rows[0]

  if (!laudo || laudo.status !== 'Aprovado') {
    res.status(404).json({ error: 'Pesquisa de satisfação não disponível para este laudo.' })
    return
  }

  if (laudo.form_data.clientAccompanied !== 'Sim') {
    res.status(404).json({ error: 'Pesquisa de satisfação não disponível para este laudo.' })
    return
  }

  const existingResponse = laudo.form_data.satisfactionResponse

  res.json({
    laudoId: laudo.id,
    ratmNumber: laudo.ratm_number,
    meter: laudo.meter,
    client: laudo.client,
    alreadySubmitted: Boolean(existingResponse),
    response: existingResponse ?? null,
  })
}

export async function submitSatisfactionSurvey(req: Request, res: Response) {
  const { laudoId } = req.params
  const rating = Number(req.body?.rating)
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : ''

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'Selecione uma nota de 1 a 5 para a pesquisa.' })
    return
  }

  const result = await query<RatmLaudoRow>(
    `SELECT id, status, form_data
     FROM ratm_laudos
     WHERE id = $1`,
    [laudoId],
  )

  const laudo = result.rows[0]

  if (!laudo || laudo.status !== 'Aprovado' || laudo.form_data.clientAccompanied !== 'Sim') {
    res.status(404).json({ error: 'Pesquisa de satisfação não disponível para este laudo.' })
    return
  }

  if (laudo.form_data.satisfactionResponse) {
    res.status(409).json({ error: 'Esta pesquisa de satisfação já foi respondida.' })
    return
  }

  const formData = {
    ...laudo.form_data,
    satisfactionResponse: {
      rating,
      comment,
      submittedAt: new Date().toISOString(),
    },
  }

  await query(
    `UPDATE ratm_laudos
     SET form_data = $1::jsonb
     WHERE id = $2`,
    [JSON.stringify(formData), laudoId],
  )

  res.status(201).json({ message: 'Pesquisa enviada com sucesso. Obrigado!' })
}
