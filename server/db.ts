import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 30_000,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined,
})

export function isDiskFullError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      String((error as { code?: unknown }).code) === '53100',
  )
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
  attempt = 0,
): Promise<pg.QueryResult<T>> {
  try {
    return await pool.query<T>(text, params)
  } catch (error) {
    if (!isDiskFullError(error) || attempt > 0) throw error
    try {
      const { reclaimDiskForWrite } = await import('./reclaim-disk.js')
      const freed = await reclaimDiskForWrite()
      if (!freed) throw error
    } catch (reclaimError) {
      if (reclaimError !== error) {
        console.error('Falha ao liberar espaço em disco:', reclaimError)
      }
      throw error
    }
    return query<T>(text, params, attempt + 1)
  }
}
