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

function diskErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return ''
  return String((error as { code?: unknown }).code ?? '')
}

function diskErrorText(error: unknown, depth = 0): string {
  if (!error || typeof error !== 'object' || depth > 4) return ''
  const message = error instanceof Error ? error.message : ''
  const cause =
    'cause' in error ? diskErrorText((error as { cause?: unknown }).cause, depth + 1) : ''
  return `${message}\n${cause}`
}

export function isDiskFullError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 4) return false
  if (diskErrorCode(error) === '53100') return true
  if (/no space left on device|could not extend file|disco cheio/i.test(diskErrorText(error))) {
    return true
  }
  if ('cause' in error) return isDiskFullError((error as { cause?: unknown }).cause, depth + 1)
  return false
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
  attempt = 0,
): Promise<pg.QueryResult<T>> {
  try {
    return await pool.query<T>(text, params)
  } catch (error) {
    if (attempt > 0 || !isDiskFullError(error)) throw error
    const { reclaimDiskOnce } = await import('./reclaim-disk.js')
    const freed = await reclaimDiskOnce()
    if (!freed) throw error
    return query<T>(text, params, attempt + 1)
  }
}
