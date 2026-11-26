import type { Request, Response } from 'express'
import { inflateRawSync } from 'node:zlib'
import { query } from '../db.js'
import { requireAuth, requireAdmin } from '../auth.js'
import { writeAuditLog } from '../audit.js'
import {
  fillOriginalWorkbook,
  parsePasswordBuffer,
  randomPassword,
} from '../password-sheet.js'

type PasswordRow = {
  id: string
  meter: string
  password: string
  password_ak?: string | null
  password_ek?: string | null
  password_lls?: string | null
  password_complement?: string | null
  password_hex?: string | null
  password_extra?: string | null
  master_password?: string | null
  manufacturer: string
  material_type: string
  order_number: string
  password_type: string
  digits: number
  source?: string | null
  created_at: Date
}

function mergePasswordExtras(
  current: string | null | undefined,
  incoming: Array<{ label: string; value: string }>,
) {
  const merged = parsePasswordExtras(current)
  const labels = new Set(merged.map((item) => item.label))
  for (const item of incoming) {
    if (!item.value || labels.has(item.label)) continue
    merged.push(item)
    labels.add(item.label)
  }
  return JSON.stringify(merged)
}

function parsePasswordExtras(value?: string | null) {
  if (!value) return [] as Array<{ label: string; value: string }>
  try {
    const parsed = JSON.parse(value) as Array<{ label?: unknown; value?: unknown }>
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => ({
        label: String(item?.label ?? '').trim(),
        value: String(item?.value ?? '').trim(),
      }))
      .filter((item) => item.label && item.value)
  } catch {
    return []
  }
}

function mapPassword(row: PasswordRow) {
  const source =
    row.source === 'passivo' || row.id.startsWith('passivo-') ? 'passivo' : 'generated'
  return {
    id: row.id,
    meter: row.meter,
    password: row.password,
    passwordAk: row.password_ak?.trim() ?? '',
    passwordEk: row.password_ek?.trim() ?? '',
    passwordLls: row.password_lls?.trim() ?? '',
    passwordComplement: row.password_complement?.trim() ?? '',
    passwordHex: row.password_hex?.trim() ?? '',
    passwordExtras: parsePasswordExtras(row.password_extra),
    masterPassword: row.master_password?.trim() ?? '',
    manufacturer: row.manufacturer,
    materialType: row.material_type,
    orderNumber: row.order_number,
    passwordType: row.password_type as 'alphanumeric' | 'letters' | 'numbers',
    digits: row.digits,
    source,
    isPassive: source === 'passivo',
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

    await writeAuditLog(req, {
      action: 'create',
      entityType: 'manufacturer',
      entityId: trimmed,
      summary: `Fabricante ${trimmed}`,
      newData: { name: trimmed },
    })

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
      source: 'generated',
      created_at: createdAt,
    }

    await query(
      `INSERT INTO password_records
       (id, meter, password, manufacturer, material_type, order_number, password_type, digits, source, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        record.id,
        record.meter,
        record.password,
        record.manufacturer,
        record.material_type,
        record.order_number,
        record.password_type,
        record.digits,
        record.source,
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

  if (newRecords.length) {
    await writeAuditLog(req, {
      action: 'create',
      entityType: 'password_record',
      summary: `${newRecords.length} senha(s) gerada(s)`,
      newData: {
        meters: newRecords.map((record) => record.meter),
        manufacturer: manufacturer.trim(),
        materialType: materialType.trim(),
        orderNumber: orderNumber.trim(),
        passwordType,
        digits: passwordDigits,
        generatedCount: newRecords.length,
        duplicateCount: results.filter((item) => item.status === 'duplicate').length,
      },
    })
  }

  res.json({
    results,
    records: newRecords.map(mapPassword),
  })
}

function detectPasswordType(password: string): 'alphanumeric' | 'letters' | 'numbers' {
  const hasLetter = /[A-Za-z]/.test(password)
  const hasNumber = /\d/.test(password)
  if (hasLetter && hasNumber) return 'alphanumeric'
  if (hasLetter) return 'letters'
  return 'numbers'
}

function parsePasswordType(
  value: unknown,
): 'alphanumeric' | 'letters' | 'numbers' | '' {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!raw) return ''
  if (
    raw === 'alphanumeric' ||
    raw === 'alphanumerico' ||
    raw === 'alphanumérico' ||
    raw === 'alfa' ||
    raw === 'misto'
  ) {
    return 'alphanumeric'
  }
  if (
    raw === 'letters' ||
    raw === 'letras' ||
    raw === 'só letras' ||
    raw === 'so letras'
  ) {
    return 'letters'
  }
  if (
    raw === 'numbers' ||
    raw === 'numeros' ||
    raw === 'números' ||
    raw === 'só números' ||
    raw === 'so numeros'
  ) {
    return 'numbers'
  }
  return ''
}

/** Cadastro individual/em massa de senhas já existentes (passivo) — exclusivo do administrador. */
export async function createPassivePasswords(req: Request, res: Response) {
  const {
    records,
    manufacturer,
    materialType,
    orderNumber,
    passwordType,
  } = req.body as {
    records?: Array<{
      meter?: string
      password?: string
      manufacturer?: string
      materialType?: string
      orderNumber?: string
      passwordType?: string
      digits?: number | string
    }>
    manufacturer?: string
    materialType?: string
    orderNumber?: string
    passwordType?: 'alphanumeric' | 'letters' | 'numbers' | ''
  }

  const items = Array.isArray(records) ? records : []
  if (!items.length) {
    res.status(400).json({ error: 'Informe ao menos um medidor e senha.' })
    return
  }
  if (items.length > 5000) {
    res.status(400).json({ error: 'Limite de 5000 registros por importação.' })
    return
  }

  const defaultManufacturer = String(manufacturer ?? '').trim()
  const defaultMaterialType = String(materialType ?? '').trim()
  const defaultOrderNumber = String(orderNumber ?? '').trim()
  const defaultPasswordType = parsePasswordType(passwordType)

  const existing = await query<{ meter: string; password: string }>(
    'SELECT meter, password FROM password_records',
  )
  const existingByMeter = new Map(
    existing.rows.map((row) => [row.meter.trim().toLowerCase(), row.password]),
  )

  const results: Array<{
    meter: string
    password: string
    status: 'created' | 'duplicate' | 'invalid'
    error?: string
  }> = []
  const newRecords: PasswordRow[] = []
  const processed = new Map<string, string>()

  for (const item of items) {
    const meter = String(item?.meter ?? '').trim()
    const password = String(item?.password ?? '').trim()
    const rowManufacturer =
      String(item?.manufacturer ?? '').trim() || defaultManufacturer
    const rowMaterialType =
      String(item?.materialType ?? '').trim() || defaultMaterialType
    const rowOrderNumber =
      String(item?.orderNumber ?? '').trim() || defaultOrderNumber
    const rowPasswordType =
      parsePasswordType(item?.passwordType) || defaultPasswordType

    if (!meter || !password) {
      results.push({
        meter: meter || '—',
        password: password || '—',
        status: 'invalid',
        error: 'Medidor e senha são obrigatórios.',
      })
      continue
    }

    if (!rowManufacturer || !rowMaterialType || !rowOrderNumber) {
      results.push({
        meter,
        password,
        status: 'invalid',
        error: 'Fabricante, código de material e número de pedido são obrigatórios.',
      })
      continue
    }

    if (!/^\d+$/.test(meter)) {
      results.push({
        meter,
        password,
        status: 'invalid',
        error: 'Medidor deve conter somente números.',
      })
      continue
    }

    if (password.length < 1 || password.length > 100) {
      results.push({
        meter,
        password,
        status: 'invalid',
        error: 'Senha deve ter entre 1 e 100 caracteres.',
      })
      continue
    }

    const digitsRaw = item?.digits
    let digits = password.length
    if (digitsRaw !== undefined && digitsRaw !== null && String(digitsRaw).trim() !== '') {
      const parsedDigits = Number(digitsRaw)
      if (!Number.isInteger(parsedDigits) || parsedDigits < 1 || parsedDigits > 100) {
        results.push({
          meter,
          password,
          status: 'invalid',
          error: 'Dígitos deve ser um inteiro entre 1 e 100.',
        })
        continue
      }
      digits = parsedDigits
    }

    const normalized = meter.toLowerCase()
    const existingPassword =
      existingByMeter.get(normalized) ?? processed.get(normalized) ?? null
    if (existingPassword !== null) {
      results.push({
        meter,
        password,
        status: 'duplicate',
        error:
          existingPassword === password
            ? 'Esse medidor já está cadastrado com a mesma senha'
            : 'Esse medidor já está cadastrado com outra senha',
      })
      continue
    }

    processed.set(normalized, password)
    const type =
      rowPasswordType === 'alphanumeric' ||
      rowPasswordType === 'letters' ||
      rowPasswordType === 'numbers'
        ? rowPasswordType
        : detectPasswordType(password)

    const createdAt = new Date()
    const record: PasswordRow = {
      id: `passivo-${Date.now()}-${newRecords.length}-${meter}`,
      meter,
      password,
      manufacturer: rowManufacturer,
      material_type: rowMaterialType,
      order_number: rowOrderNumber,
      password_type: type,
      digits,
      source: 'passivo',
      created_at: createdAt,
    }

    await query(
      `INSERT INTO password_records
       (id, meter, password, manufacturer, material_type, order_number, password_type, digits, source, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        record.id,
        record.meter,
        record.password,
        record.manufacturer,
        record.material_type,
        record.order_number,
        record.password_type,
        record.digits,
        record.source,
        record.created_at,
      ],
    )

    existingByMeter.set(normalized, password)
    newRecords.push(record)
    results.push({ meter, password, status: 'created' })
  }

  if (newRecords.length) {
    await writeAuditLog(req, {
      action: 'create',
      entityType: 'password_record',
      summary: `${newRecords.length} senha(s) passiva(s) cadastrada(s)`,
      newData: {
        meters: newRecords.map((record) => record.meter),
        manufacturer: defaultManufacturer || undefined,
        materialType: defaultMaterialType || undefined,
        orderNumber: defaultOrderNumber || undefined,
        createdCount: newRecords.length,
        duplicateCount: results.filter((item) => item.status === 'duplicate').length,
        invalidCount: results.filter((item) => item.status === 'invalid').length,
      },
      metadata: { source: 'passivo' },
    })
  }

  res.status(201).json({
    results,
    records: newRecords.map(mapPassword),
    createdCount: newRecords.length,
    duplicateCount: results.filter((item) => item.status === 'duplicate').length,
    invalidCount: results.filter((item) => item.status === 'invalid').length,
  })
}

export async function deletePasswordRecords(req: Request, res: Response) {
  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : []
  const ids = [
    ...new Set(
      rawIds
        .map((id: unknown) => (typeof id === 'string' ? id.trim() : ''))
        .filter(Boolean),
    ),
  ]

  if (!ids.length) {
    res.status(400).json({ error: 'Informe a senha que deseja excluir.' })
    return
  }

  const existing = await query<PasswordRow>(
    'SELECT * FROM password_records WHERE id = ANY($1::text[])',
    [ids],
  )

  if (!existing.rows.length) {
    res.status(404).json({ error: 'Senha não encontrada.' })
    return
  }

  const deletedIds = existing.rows.map((row) => row.id)
  await query('DELETE FROM password_records WHERE id = ANY($1::text[])', [deletedIds])

  await writeAuditLog(req, {
    action: 'delete',
    entityType: 'password_record',
    summary:
      deletedIds.length === 1
        ? `Senha do medidor ${existing.rows[0]?.meter} excluída`
        : `${deletedIds.length} senha(s) excluída(s)`,
    oldData: {
      records: existing.rows.map((row) => ({
        id: row.id,
        meter: row.meter,
        manufacturer: row.manufacturer,
        materialType: row.material_type,
        orderNumber: row.order_number,
        source: row.source ?? 'generated',
      })),
    },
  })

  res.json({ deletedIds })
}

function storedSheetPassword(
  row: PasswordRow,
  key: 'password' | 'ak' | 'ek' | 'lls',
) {
  if (key === 'ak') return row.password_ak?.trim() ?? ''
  if (key === 'ek') return row.password_ek?.trim() ?? ''
  if (key === 'lls') return row.password_lls?.trim() ?? ''
  return row.password?.trim() ?? ''
}

type ArchiveDraft = {
  meter: string
  manufacturer: string
  materialCode: string
  orderNumber: string
  password: string
  ak: string
  ek: string
  lls: string
  complement: string
  hex: string
  master: string
  extras: Array<{ label: string; value: string }>
  rank: number
  expected: number
}

function fileRank(name: string) {
  const date = name.match(/(\d{4})-(\d{2})-(\d{2})/)
  const stamp = date ? Number(`${date[1]}${date[2]}${date[3]}`) : 0
  return stamp * 10 + (/_2_/.test(name) ? 0 : 1)
}

function chooseFilled(
  current: string,
  incoming: string,
  currentRank: number,
  incomingRank: number,
  expected = 0,
) {
  if (!incoming) return current
  if (!current) return incoming
  if (expected > 0 && current.length === expected && incoming.length !== expected) return current
  if (expected > 0 && incoming.length === expected && current.length !== expected) return incoming
  if (incoming.length !== current.length) return incoming.length > current.length ? incoming : current
  return incomingRank >= currentRank ? incoming : current
}

function findZipEocd(buffer: Buffer) {
  const min = Math.max(0, buffer.length - 22 - 65535)
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  }
  return -1
}

function zipEntryName(rawName: Buffer, flags: number) {
  return (flags & 0x800 ? rawName.toString('utf8') : rawName.toString('latin1')).replace(/\\/g, '/')
}

function pushSpreadsheet(
  files: Array<{ name: string; data: Buffer }>,
  fullName: string,
  method: number,
  compressed: Buffer,
) {
  const name = fullName.split('/').pop() ?? ''
  if (!name.toLowerCase().endsWith('.xlsx') || fullName.includes('__MACOSX')) return
  if (method === 0) files.push({ name, data: Buffer.from(compressed) })
  else if (method === 8) files.push({ name, data: inflateRawSync(compressed) })
}

function unzipSpreadsheets(buffer: Buffer) {
  const files: Array<{ name: string; data: Buffer }> = []
  const eocd = findZipEocd(buffer)
  if (eocd >= 0) {
    const total = buffer.readUInt16LE(eocd + 10)
    let cursor = buffer.readUInt32LE(eocd + 16)
    for (let index = 0; index < total && cursor + 46 <= buffer.length; index += 1) {
      if (buffer.readUInt32LE(cursor) !== 0x02014b50) break
      const flags = buffer.readUInt16LE(cursor + 8)
      const method = buffer.readUInt16LE(cursor + 10)
      const compressedSize = buffer.readUInt32LE(cursor + 20)
      const nameLength = buffer.readUInt16LE(cursor + 28)
      const extraLength = buffer.readUInt16LE(cursor + 30)
      const commentLength = buffer.readUInt16LE(cursor + 32)
      const localOffset = buffer.readUInt32LE(cursor + 42)
      const fullName = zipEntryName(buffer.subarray(cursor + 46, cursor + 46 + nameLength), flags)
      cursor += 46 + nameLength + extraLength + commentLength
      if (localOffset === 0xffffffff || compressedSize === 0xffffffff) continue
      if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) continue
      const localNameLength = buffer.readUInt16LE(localOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + localNameLength + localExtraLength
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
      if (compressed.length !== compressedSize) continue
      try {
        pushSpreadsheet(files, fullName, method, compressed)
      } catch {
        // Entrada compactada inválida não impede as outras planilhas do zip.
      }
    }
    return files
  }

  let offset = 0
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const flags = buffer.readUInt16LE(offset + 6)
    const method = buffer.readUInt16LE(offset + 8)
    const compressedSize = buffer.readUInt32LE(offset + 18)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const fullName = zipEntryName(buffer.subarray(nameStart, nameStart + nameLength), flags)
    const dataStart = nameStart + nameLength + extraLength
    if (flags & 0x8 || dataStart + compressedSize > buffer.length) break
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    offset = dataStart + compressedSize
    if (!compressed.length) continue
    try {
      pushSpreadsheet(files, fullName, method, compressed)
    } catch {
      // Entrada compactada inválida não impede as outras planilhas do zip.
    }
  }
  return files
}

async function importPasswordZip(req: Request, res: Response, buffer: Buffer) {
  const spreadsheets = unzipSpreadsheets(buffer)
  if (!spreadsheets.length) {
    res.status(400).json({ error: 'O zip não contém planilhas .xlsx.' })
    return
  }

  const drafts = new Map<string, ArchiveDraft>()
  const skipped: Array<{ name: string; reason: string }> = []
  for (const file of spreadsheets) {
    try {
      const parsed = await parsePasswordBuffer(file.data, file.name)
      const rank = fileRank(file.name)
      let kept = 0
      for (const item of parsed.meters) {
        const byKey = Object.fromEntries(item.passwords.map((slot) => [slot.key, slot.existing || '']))
        const extras = (item.extras ?? []).filter((extra) => extra.value)
        const password =
          byKey.password || byKey.ak || extras.find((extra) => extra.value)?.value || ''
        if (!password) continue
        kept += 1
        const incoming: ArchiveDraft = {
          meter: item.meter,
          manufacturer: parsed.manufacturer,
          materialCode: parsed.materialCode,
          orderNumber: parsed.orderNumber,
          password,
          ak: byKey.ak || '',
          ek: byKey.ek || '',
          lls: byKey.lls || '',
          complement: item.complement ?? '',
          hex: item.hex ?? '',
          master: parsed.existingMaster,
          extras,
          rank,
          expected: parsed.profile.columns[0]?.digits ?? 0,
        }
        const current = drafts.get(item.meter)
        if (!current) {
          drafts.set(item.meter, incoming)
          continue
        }
        const passwordValue = chooseFilled(
          current.password,
          incoming.password,
          current.rank,
          incoming.rank,
          current.expected || incoming.expected,
        )
        const mergedExtras = new Map(current.extras.map((extra) => [extra.label, extra.value]))
        for (const extra of incoming.extras) {
          mergedExtras.set(
            extra.label,
            chooseFilled(mergedExtras.get(extra.label) || '', extra.value, current.rank, incoming.rank),
          )
        }
        const base = passwordValue === incoming.password ? incoming : current
        drafts.set(item.meter, {
          ...base,
          password: passwordValue,
          ak: chooseFilled(current.ak, incoming.ak, current.rank, incoming.rank, 16),
          ek: chooseFilled(current.ek, incoming.ek, current.rank, incoming.rank, 16),
          lls: chooseFilled(current.lls, incoming.lls, current.rank, incoming.rank, 8),
          complement: chooseFilled(current.complement, incoming.complement, current.rank, incoming.rank),
          hex: chooseFilled(current.hex, incoming.hex, current.rank, incoming.rank),
          master: chooseFilled(current.master, incoming.master, current.rank, incoming.rank, 16),
          extras: [...mergedExtras.entries()]
            .filter(([, value]) => value)
            .map(([label, value]) => ({ label, value })),
          rank: Math.max(current.rank, incoming.rank),
          expected: current.expected || incoming.expected,
        })
      }
      if (!kept) skipped.push({ name: file.name, reason: 'Nenhuma senha preenchida.' })
    } catch (error) {
      skipped.push({
        name: file.name,
        reason: error instanceof Error ? error.message : 'Não foi possível ler a planilha.',
      })
    }
  }

  const meters = [...drafts.values()]
  const existingByMeter = new Map<string, PasswordRow>()
  for (let index = 0; index < meters.length; index += 2000) {
    const chunk = meters.slice(index, index + 2000).map((item) => item.meter)
    const existing = await query<PasswordRow>(
      `SELECT id, meter, password, password_ak, password_ek, password_lls, password_complement,
              password_hex, password_extra, master_password, manufacturer, material_type, order_number,
              password_type, digits, source, created_at
       FROM password_records
       WHERE meter = ANY($1::text[])`,
      [chunk],
    )
    for (const row of existing.rows) existingByMeter.set(row.meter.trim(), row)
  }

  let generatedCount = 0
  let existingCount = 0
  const pending: ArchiveDraft[] = []
  for (const item of meters) {
    const current = existingByMeter.get(item.meter)
    if (!current) {
      pending.push(item)
      continue
    }
    existingCount += 1
    const sets: string[] = []
    const params: unknown[] = []
    const remember = (column: string, next: string, stored: string) => {
      if (stored.trim() || !next) return
      params.push(next)
      sets.push(`${column} = $${params.length}`)
    }
    remember('password_ak', item.ak, current.password_ak || '')
    remember('password_ek', item.ek, current.password_ek || '')
    remember('password_lls', item.lls, current.password_lls || '')
    remember('password_complement', item.complement, current.password_complement || '')
    remember('password_hex', item.hex, current.password_hex || '')
    remember('master_password', item.master, current.master_password || '')
    const mergedExtras = mergePasswordExtras(current.password_extra, item.extras)
    if (item.extras.length && mergedExtras !== (current.password_extra || '[]') && mergedExtras !== (current.password_extra || '')) {
      params.push(mergedExtras)
      sets.push(`password_extra = $${params.length}`)
    }
    if (sets.length) {
      params.push(current.id)
      await query(`UPDATE password_records SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
    }
  }

  const createdAt = new Date()
  for (let index = 0; index < pending.length; index += 200) {
    const chunk = pending.slice(index, index + 200)
    const params: unknown[] = []
    const values = chunk.map((item, itemIndex) => {
      const base = params.length
      params.push(
        `sheet-${createdAt.getTime()}-${index + itemIndex}-${item.meter}`,
        item.meter,
        item.password,
        item.ak,
        item.ek,
        item.lls,
        item.complement,
        item.hex,
        JSON.stringify(item.extras),
        item.master,
        item.manufacturer,
        item.materialCode,
        item.orderNumber,
        'alphanumeric',
        item.password.length,
        'generated',
        createdAt,
      )
      const placeholders = Array.from({ length: 17 }, (_, place) => `$${base + place + 1}`)
      return `(${placeholders.join(',')})`
    })
    await query(
      `INSERT INTO password_records
       (id, meter, password, password_ak, password_ek, password_lls, password_complement,
        password_hex, password_extra, master_password, manufacturer, material_type, order_number,
        password_type, digits, source, created_at)
       VALUES ${values.join(',')}`,
      params,
    )
    generatedCount += chunk.length
  }

  if (generatedCount) {
    await writeAuditLog(req, {
      action: 'create',
      entityType: 'password_record',
      summary: `${generatedCount} senha(s) importada(s) do pacote de planilhas`,
      newData: { generatedCount, existingCount, skipped: skipped.length },
    })
  }

  res.json({
    fileName: '',
    fileBase64: '',
    model: 'planilhas',
    passwordSummary: 'as senhas já preenchidas, sem gerar senha nova onde a célula estava vazia',
    masterDigits: 0,
    generatedCount,
    existingCount,
    skipped,
    records: [],
  })
}

export async function importPasswordSheet(req: Request, res: Response) {
  const { fileName, fileBase64 } = req.body as { fileName?: string; fileBase64?: string }
  const base64 = String(fileBase64 ?? '').replace(/^data:.*?;base64,/, '').trim()
  if (!base64) {
    res.status(400).json({ error: 'Envie a planilha no formato .xlsx.' })
    return
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(base64, 'base64')
  } catch {
    res.status(400).json({ error: 'Não foi possível ler a planilha.' })
    return
  }
  const lowerName = String(fileName ?? '').toLowerCase()
  // .xlsx e .xlsm também começam com o cabeçalho PK de zip. Só um arquivo .zip
  // é um pacote de várias planilhas.
  const isZip = lowerName.endsWith('.zip')
  if (!buffer.length || buffer.length > (isZip ? 40_000_000 : 15_000_000)) {
    res.status(400).json({ error: 'A planilha está vazia ou passou do tamanho aceito.' })
    return
  }
  if (isZip) {
    await importPasswordZip(req, res, buffer)
    return
  }

  let parsed
  try {
    parsed = await parsePasswordBuffer(buffer, String(fileName ?? ''))
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Não foi possível ler a planilha.',
    })
    return
  }

  const { profile } = parsed
  const existing = await query<PasswordRow>(
    `SELECT id, meter, password, password_ak, password_ek, password_lls, password_complement,
            password_hex, password_extra, master_password, manufacturer, material_type, order_number,
            password_type, digits, source, created_at
     FROM password_records
     WHERE meter = ANY($1::text[])`,
    [parsed.meters.map((item) => item.meter)],
  )
  const existingByMeter = new Map(existing.rows.map((row) => [row.meter.trim(), row]))

  let masterPassword = ''
  if (profile.masterDigits > 0) {
    const knownMaster = existing.rows
      .map((row) => row.master_password?.trim() ?? '')
      .find((value) => value.length === profile.masterDigits)
    masterPassword = parsed.existingMaster
    if (!masterPassword) {
      masterPassword = knownMaster || (parsed.keepFormulas ? '' : randomPassword(profile.masterDigits))
    }
  }

  const planned: Array<{
    meter: string
    existing: PasswordRow | null
    fields: Array<{ key: 'password' | 'ak' | 'ek' | 'lls'; cell: string; value: string }>
    complement: string
    hex: string
    extras: Array<{ label: string; value: string }>
  }> = []
  for (const item of parsed.meters) {
    const current = existingByMeter.get(item.meter) ?? null
    const fields = []
    for (const slot of item.passwords) {
      let value = slot.existing
      const stored = current ? storedSheetPassword(current, slot.key) : ''
      if (stored) value = stored
      else if (!value && !parsed.keepFormulas) value = randomPassword(slot.digits)
      fields.push({ key: slot.key, cell: slot.cell, value })
    }
    planned.push({
      meter: item.meter,
      existing: current,
      fields,
      complement: item.complement ?? '',
      hex: item.hex ?? '',
      extras: item.extras ?? [],
    })
  }

  const results: Array<{ meter: string; status: 'generated' | 'existing' }> = []
  const saved: PasswordRow[] = []

  for (const item of planned) {
    if (item.existing) {
      const sets: string[] = []
      const params: unknown[] = []
      const remember = (column: string, next: string, current: string, apply: (value: string) => void) => {
        if (current.trim() || !next) return
        params.push(next)
        sets.push(`${column} = $${params.length}`)
        apply(next)
      }
      const byKey = Object.fromEntries(item.fields.map((field) => [field.key, field.value]))
      remember('password_ak', byKey.ak || '', item.existing.password_ak || '', (value) => {
        item.existing!.password_ak = value
      })
      remember('password_ek', byKey.ek || '', item.existing.password_ek || '', (value) => {
        item.existing!.password_ek = value
      })
      remember('password_lls', byKey.lls || '', item.existing.password_lls || '', (value) => {
        item.existing!.password_lls = value
      })
      remember('password_complement', item.complement, item.existing.password_complement || '', (value) => {
        item.existing!.password_complement = value
      })
      remember('password_hex', item.hex, item.existing.password_hex || '', (value) => {
        item.existing!.password_hex = value
      })
      remember('master_password', masterPassword, item.existing.master_password || '', (value) => {
        item.existing!.master_password = value
      })
      const mergedExtras = mergePasswordExtras(item.existing.password_extra, item.extras)
      if (mergedExtras !== (item.existing.password_extra || '') && item.extras.length) {
        params.push(mergedExtras)
        sets.push(`password_extra = $${params.length}`)
        item.existing.password_extra = mergedExtras
      }
      if (sets.length) {
        params.push(item.existing.id)
        await query(
          `UPDATE password_records SET ${sets.join(', ')} WHERE id = $${params.length}`,
          params,
        )
      }
      saved.push(item.existing)
      results.push({ meter: item.meter, status: 'existing' })
      continue
    }

    const createdAt = new Date()
    const byKey = Object.fromEntries(item.fields.map((field) => [field.key, field.value]))
    const password =
      byKey.password || byKey.ak || item.extras.find((extra) => extra.value)?.value || ''
    if (!password) continue
    const record: PasswordRow = {
      id: `sheet-${createdAt.getTime()}-${item.meter}`,
      meter: item.meter,
      password,
      password_ak: byKey.ak || '',
      password_ek: byKey.ek || '',
      password_lls: byKey.lls || '',
      password_complement: item.complement,
      password_hex: item.hex,
      password_extra: JSON.stringify(item.extras),
      master_password: masterPassword,
      manufacturer: parsed.manufacturer,
      material_type: parsed.materialCode,
      order_number: parsed.orderNumber,
      password_type: profile.passwordType,
      digits: password.length,
      source: 'generated',
      created_at: createdAt,
    }
    await query(
      `INSERT INTO password_records
       (id, meter, password, password_ak, password_ek, password_lls, password_complement,
        password_hex, password_extra, master_password, manufacturer, material_type, order_number,
        password_type, digits, source, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        record.id,
        record.meter,
        record.password,
        record.password_ak,
        record.password_ek,
        record.password_lls,
        record.password_complement,
        record.password_hex,
        record.password_extra,
        masterPassword,
        record.manufacturer,
        record.material_type,
        record.order_number,
        record.password_type,
        record.digits,
        record.source,
        record.created_at,
      ],
    )
    saved.push(record)
    results.push({ meter: item.meter, status: 'generated' })
  }

  const filled = parsed.keepFormulas
    ? buffer
    : await fillOriginalWorkbook(buffer, [
        ...(parsed.masterCell ? [{ cell: parsed.masterCell, value: masterPassword }] : []),
        ...parsed.uniquePasswordCells.map((cell) => ({ cell, value: '' })),
        ...planned.flatMap((item) =>
          item.fields.map((field) => ({ cell: field.cell, value: field.value })),
        ),
      ])

  const generatedCount = results.filter((item) => item.status === 'generated').length
  const existingCount = results.length - generatedCount
  if (generatedCount) {
    await writeAuditLog(req, {
      action: 'create',
      entityType: 'password_record',
      summary: `${generatedCount} senha(s) do modelo ${profile.label} importada(s) da planilha`,
      newData: {
        model: profile.label,
        manufacturer: parsed.manufacturer,
        materialType: parsed.materialCode,
        orderNumber: parsed.orderNumber,
        masterDigits: profile.masterDigits,
        generatedCount,
        existingCount,
      },
    })
  }

  const originalName = String(fileName ?? 'senhas.xlsx').replace(/\.(xlsx|xlsm)$/i, '')
  res.json({
    fileName: `${originalName}-preenchido.xlsx`,
    fileBase64: filled.toString('base64'),
    model: profile.label,
    passwordSummary:
      profile.id === 'nansen-nsx'
        ? 'senha de 10 caracteres, senha de produção e senha AK e EK'
        : profile.id === 'pantheon'
          ? 'senhas coletivas do Pantheon'
          : profile.id === 'dr-ng'
            ? 'senhas do DR NG'
            : [
            ...profile.columns.map((column) => `${column.label} de ${column.digits} dígitos`),
            ...(profile.masterDigits ? [`senha mestra de ${profile.masterDigits} dígitos`] : []),
          ].join(', '),
    masterDigits: profile.masterDigits,
    generatedCount,
    existingCount,
    records: saved.map(mapPassword),
  })
}

export const passwordRoutes = {
  list: [requireAuth, listPasswordRecords],
  manufacturers: [requireAuth, listManufacturers],
  addManufacturer: [requireAuth, addManufacturer],
  generate: [requireAuth, generatePasswords],
  createPassive: [requireAuth, requireAdmin, createPassivePasswords],
  deleteRecords: [requireAuth, requireAdmin, deletePasswordRecords],
  importSheet: [requireAuth, importPasswordSheet],
}
