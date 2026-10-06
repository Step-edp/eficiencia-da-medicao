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
  createdByUserId?: string | null
  createdByName?: string
  createdByRegistration?: string
  installation?: string
  toi?: string
  note?: string
  revokedAt?: string | null
}

export function mapRatmLaudoFromApi(record: {
  id: string
  ratmNumber: number
  meter: string
  client: string
  createdAt: string
  status: RatmLaudoStatus
  formData: Record<string, unknown>
  createdByUserId?: string | null
  createdByName?: string
  createdByRegistration?: string
  installation?: string
  toi?: string
  note?: string
  revokedAt?: string | null
}): RatmLaudo {
  return {
    id: record.id,
    ratmNumber: record.ratmNumber,
    meter: record.meter,
    client: record.client,
    createdAt: record.createdAt,
    status: record.status,
    formData: record.formData as RatmFormData,
    createdByUserId: record.createdByUserId ?? null,
    createdByName: record.createdByName || '',
    createdByRegistration: record.createdByRegistration || '',
    installation: record.installation || '',
    toi: record.toi || '',
    note: record.note || '',
    revokedAt: record.revokedAt ?? null,
  }
}

export function formatRatmLaudoNumber(ratmNumber: number, createdAt: string) {
  const date = new Date(createdAt)
  const year = Number.isNaN(date.getTime()) ? '' : String(date.getFullYear())
  const seq = String(ratmNumber).padStart(4, '0')
  return year ? `${seq}_${year}` : seq
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
