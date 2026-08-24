import type { Request, Response } from 'express'
import { query } from '../db.js'
import { requireAdmin, requireAuth } from '../auth.js'
import { writeAuditLog } from '../audit.js'

export const CATALOG_KEYS = [
  'cargo',
  'area',
  'tipo',
  'terceira',
  'localidade',
  'escopo_csd',
] as const
export type CatalogKey = (typeof CATALOG_KEYS)[number]

export const CATALOG_LABELS: Record<CatalogKey, string> = {
  cargo: 'Cargo',
  area: 'Área',
  tipo: 'Tipo',
  terceira: 'Empresa terceira',
  localidade: 'Localidade',
  escopo_csd: 'Escopo · CSD',
}

const DEFAULT_OPTIONS: Record<CatalogKey, string[]> = {
  cargo: ['Técnico', 'Analista', 'Engenheiro', 'Gestor', 'Estagiário', 'Assistente Administrativo'],
  area: [
    'Medição',
    'Telemedição',
    'CSD',
    'Consumo Irregular',
    'Grandes Clientes',
    'Qualidade',
    'COI',
  ],
  tipo: ['Própria', 'Terceira'],
  terceira: ['BMB', 'Cosampa', 'Engelmig', 'Engeserv', 'ROTARY', 'TIVIT'],
  localidade: [
    'Aparecida',
    'Biritiba-Mirim',
    'Caçapava',
    'Cachoeira Paulista',
    'Canas',
    'Caraguatatuba',
    'Cruzeiro',
    'Ferraz de Vasconcelos',
    'Guararema',
    'Guaratinguetá',
    'Guarulhos',
    'Itaquaquecetuba',
    'Jacareí',
    'Jambeiro',
    'Lorena',
    'Mogi das Cruzes',
    'Monteiro Lobato',
    'Pindamonhangaba',
    'Poá',
    'Potim',
    'Roseira',
    'Salesópolis',
    'Santa Branca',
    'São José dos Campos',
    'São Sebastião',
    'Suzano',
    'Taubaté',
    'Tremembé',
  ],
  escopo_csd: [
    'Lavratura de TOI - Equipe de Campo',
    'Lavratura de TOI - Ponto Focal',
    'Lavratura de TOI - Backoffice',
    'Leituras de faturamento',
  ],
}

type CatalogOptionRow = {
  id: number
  catalog_key: CatalogKey
  value: string
  sort_order: number
}

function mapOption(row: CatalogOptionRow) {
  return {
    id: row.id,
    catalogKey: row.catalog_key,
    value: row.value,
    sortOrder: row.sort_order,
    label: CATALOG_LABELS[row.catalog_key] ?? row.catalog_key,
  }
}

export async function ensureCatalogOptionsSeeded() {
  for (const key of CATALOG_KEYS) {
    for (const [index, value] of DEFAULT_OPTIONS[key].entries()) {
      await query(
        `INSERT INTO catalog_options (catalog_key, value, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (catalog_key, value) DO NOTHING`,
        [key, value, index],
      )
    }
  }

  // Mantém a lista de empresas terceiras alinhada ao conjunto oficial atual.
  await query(
    `DELETE FROM catalog_options
     WHERE catalog_key = 'terceira'
       AND value <> ALL($1::text[])`,
    [DEFAULT_OPTIONS.terceira],
  )

  // Renomeia escopo legado de Lavratura de TOI.
  await query(
    `UPDATE catalog_options
     SET value = 'Lavratura de TOI - Equipe de Campo'
     WHERE catalog_key = 'escopo_csd'
       AND value = 'Lavratura de TOI'`,
  )
}

export async function listCatalogValues(catalogKey: CatalogKey): Promise<string[]> {
  const result = await query<{ value: string }>(
    `SELECT value FROM catalog_options
     WHERE catalog_key = $1
     ORDER BY sort_order ASC, value ASC`,
    [catalogKey],
  )
  if (result.rows.length > 0) {
    return result.rows.map((row) => row.value)
  }
  return [...DEFAULT_OPTIONS[catalogKey]]
}

export async function listCatalogOptions(_req: Request, res: Response) {
  const result = await query<CatalogOptionRow>(
    `SELECT id, catalog_key, value, sort_order
     FROM catalog_options
     ORDER BY catalog_key ASC, sort_order ASC, value ASC`,
  )

  const catalogs = CATALOG_KEYS.map((key) => ({
    key,
    label: CATALOG_LABELS[key],
    options: result.rows.filter((row) => row.catalog_key === key).map(mapOption),
  }))

  res.json({ catalogs })
}

export async function createCatalogOption(req: Request, res: Response) {
  const { catalogKey, value } = req.body as {
    catalogKey?: string
    value?: string
  }

  if (!catalogKey || !CATALOG_KEYS.includes(catalogKey as CatalogKey)) {
    res.status(400).json({ error: 'Catálogo inválido.' })
    return
  }

  const normalized = value?.trim() ?? ''
  if (!normalized) {
    res.status(400).json({ error: 'Informe um valor para cadastrar.' })
    return
  }

  const maxOrder = await query<{ max: number | null }>(
    `SELECT MAX(sort_order) AS max FROM catalog_options WHERE catalog_key = $1`,
    [catalogKey],
  )
  const sortOrder = Number(maxOrder.rows[0]?.max ?? -1) + 1

  try {
    const insert = await query<CatalogOptionRow>(
      `INSERT INTO catalog_options (catalog_key, value, sort_order)
       VALUES ($1, $2, $3)
       RETURNING id, catalog_key, value, sort_order`,
      [catalogKey, normalized, sortOrder],
    )
    const option = mapOption(insert.rows[0])

    await writeAuditLog(req, {
      action: 'create',
      entityType: 'catalog_option',
      entityId: String(option.id),
      summary: `Opção cadastrada em ${CATALOG_LABELS[catalogKey as CatalogKey]}: ${option.value}`,
      newData: option,
    })

    res.status(201).json({ option })
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '23505') {
      res.status(409).json({ error: 'Essa opção já existe neste catálogo.' })
      return
    }
    throw error
  }
}

export async function deleteCatalogOption(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Identificador inválido.' })
    return
  }

  const existing = await query<CatalogOptionRow>(
    `SELECT id, catalog_key, value, sort_order FROM catalog_options WHERE id = $1`,
    [id],
  )
  if (!existing.rows[0]) {
    res.status(404).json({ error: 'Opção não encontrada.' })
    return
  }

  const option = mapOption(existing.rows[0])
  if (option.catalogKey === 'tipo') {
    res.status(400).json({ error: 'As opções de Tipo não podem ser excluídas.' })
    return
  }

  await query(`DELETE FROM catalog_options WHERE id = $1`, [id])

  await writeAuditLog(req, {
    action: 'delete',
    entityType: 'catalog_option',
    entityId: String(option.id),
    summary: `Opção removida de ${CATALOG_LABELS[option.catalogKey]}: ${option.value}`,
    oldData: option,
  })

  res.json({ ok: true, id: option.id })
}

export const catalogOptionRoutes = {
  list: [listCatalogOptions],
  create: [requireAuth, requireAdmin, createCatalogOption],
  remove: [requireAuth, requireAdmin, deleteCatalogOption],
}
