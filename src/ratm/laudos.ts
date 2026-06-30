import type { RatmFormData } from './types'

export type RatmLaudoStatus = 'Pendente' | 'Aprovado' | 'Reprovado'

export type RatmLaudo = {
  id: string
  ratmNumber: number
  meter: string
  client: string
  createdAt: string
  status: RatmLaudoStatus
  formData: RatmFormData
}

export function mapRatmLaudoFromApi(record: {
  id: string
  ratmNumber: number
  meter: string
  client: string
  createdAt: string
  status: RatmLaudoStatus
  formData: Record<string, unknown>
}): RatmLaudo {
  return {
    id: record.id,
    ratmNumber: record.ratmNumber,
    meter: record.meter,
    client: record.client,
    createdAt: record.createdAt,
    status: record.status,
    formData: record.formData as RatmFormData,
  }
}

export function createRatmLaudos(forms: RatmFormData[]): RatmLaudo[] {
  const createdAt = new Date().toISOString()
  const batchId = Date.now()

  return forms.map((form, index) => ({
    id: `laudo-${batchId}-${index + 1}`,
    ratmNumber: index + 1,
    meter: form.meter.trim(),
    client: form.client.trim() || 'Não informado',
    createdAt,
    status: 'Pendente',
    formData: form,
  }))
}
