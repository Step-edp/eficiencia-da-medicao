import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'

type PasswordRow = {
  id: string
  meter: string
  password: string
  manufacturer: string
  material_type: string
  order_number: string
  password_type: string
  digits: number
  created_at: Date
}

function mapPassword(row: PasswordRow) {
  return {
    id: row.id,
    meter: row.meter,
    password: row.password,
    manufacturer: row.manufacturer,
    materialType: row.material_type,
    orderNumber: row.order_number,
    passwordType: row.password_type as 'alphanumeric' | 'letters' | 'numbers',
    digits: row.digits,
    createdAt: row.created_at.toISOString(),
  }
}

export async function listPasswordRecords(_req: Request, res: Response) {
  const result = await query<PasswordRow>(
    'SELECT * FROM password_records ORDER BY created_at DESC',
  )
  res.json({ records: result.rows.map(mapPassword) })
}

export async function listManufacturers(_req: Request, res: Response) {
  const result = await query<{ name: string }>('SELECT name FROM manufacturers ORDER BY name')
  res.json({ manufacturers: result.rows.map((row) => row.name) })
}

export async function addManufacturer(req: Request, res: Response) {
  const { name } = req.body as { name?: string }
  const trimmed = name?.trim()

  if (!trimmed) {
    res.status(400).json({ error: 'Digite o nome do fabricante.' })
    return
  }

  try {
    await query('INSERT INTO manufacturers (name) VALUES ($1)', [trimmed])
    res.status(201).json({ name: trimmed })
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '23505') {
      res.status(409).json({ error: 'Este fabricante já está na lista.' })
      return
    }
    throw error
  }
}

export async function generatePasswords(req: Request, res: Response) {
  const {
    meters,
    passwordDigits,
    passwordType,
    manufacturer,
    materialType,
    orderNumber,
  } = req.body as {
    meters?: string[]
    passwordDigits?: number
    passwordType?: 'alphanumeric' | 'letters' | 'numbers'
    manufacturer?: string
    materialType?: string
    orderNumber?: string
  }

  if (
    !meters?.length ||
    !passwordDigits ||
    !passwordType ||
    !manufacturer?.trim() ||
    !materialType?.trim() ||
    !orderNumber?.trim()
  ) {
    res.status(400).json({ error: 'Preencha todos os campos antes de gerar as senhas.' })
    return
  }

  if (!Number.isInteger(passwordDigits) || passwordDigits < 1 || passwordDigits > 100) {
    res.status(400).json({ error: 'Defina entre 1 e 100 dígitos para a senha.' })
    return
  }

  const charSets = {
    alphanumeric: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789',
    letters: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
    numbers: '0123456789',
  }
  const selectedCharSet = charSets[passwordType]

  const existing = await query<{ meter: string; created_at: Date }>(
    'SELECT meter, created_at FROM password_records',
  )
  const existingMeters = new Map(
    existing.rows.map((row) => [row.meter.trim().toLowerCase(), row.created_at.toISOString()]),
  )

  const results: Array<{
    meter: string
    password: string
    status: 'generated' | 'duplicate'
    createdAt: string
  }> = []
  const newRecords: PasswordRow[] = []
  const processedMeters = new Set<string>()

  for (const meter of meters) {
    const trimmed = meter.trim()
    const normalized = trimmed.toLowerCase()

    if (!/^\d+$/.test(trimmed)) {
      res.status(400).json({ error: `Medidor inválido: ${trimmed}. Informe somente números.` })
      return
    }

    const existingCreatedAt = existingMeters.get(normalized)
    if (existingCreatedAt || processedMeters.has(normalized)) {
      results.push({
        meter: trimmed,
        password: 'Medidor já possui senha',
        status: 'duplicate',
        createdAt: existingCreatedAt ?? new Date().toISOString(),
      })
      continue
    }

    processedMeters.add(normalized)
    const randomBlock = Array.from({ length: passwordDigits }, () =>
      selectedCharSet[Math.floor(Math.random() * selectedCharSet.length)],
    ).join('')
    const createdAt = new Date()
    const id = `${Date.now()}-${results.length}-${trimmed}`

    const record: PasswordRow = {
      id,
      meter: trimmed,
      password: randomBlock,
      manufacturer: manufacturer.trim(),
      material_type: materialType.trim(),
      order_number: orderNumber.trim(),
      password_type: passwordType,
      digits: passwordDigits,
      created_at: createdAt,
    }

    await query(
      `INSERT INTO password_records
       (id, meter, password, manufacturer, material_type, order_number, password_type, digits, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        record.id,
        record.meter,
        record.password,
        record.manufacturer,
        record.material_type,
        record.order_number,
        record.password_type,
        record.digits,
        record.created_at,
      ],
    )

    newRecords.push(record)
    results.push({
      meter: trimmed,
      password: randomBlock,
      status: 'generated',
      createdAt: createdAt.toISOString(),
    })
  }

  res.json({
    results,
    records: newRecords.map(mapPassword),
  })
}

export const passwordRoutes = {
  list: [requireAuth, listPasswordRecords],
  manufacturers: [requireAuth, listManufacturers],
  addManufacturer: [requireAuth, addManufacturer],
  generate: [requireAuth, generatePasswords],
}
