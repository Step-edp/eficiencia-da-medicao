import { query } from './db.js'

export type ScheduleUserRecord = {
  id: string
  name: string
  registration: string
}

const COMPANY_SUFFIXES = [
  'ENGESERV',
  'EXTERNO',
  'ENGENHARIA',
  'SERVICOS',
  'SERVIÇOS',
  'TERCEIRO',
  'TERCEIRIZADO',
]

function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '')
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripCompanySuffix(raw: string) {
  let value = normalizeWhitespace(raw)
  for (const suffix of COMPANY_SUFFIXES) {
    const pattern = new RegExp(`\\s+${suffix}$`, 'i')
    value = value.replace(pattern, '').trim()
  }
  return value
}

export function normalizePersonNameForMatch(raw: string) {
  const withoutSuffix = stripCompanySuffix(raw)
  return normalizeWhitespace(
    stripDiacritics(withoutSuffix)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' '),
  )
}

function nameTokens(raw: string) {
  return normalizePersonNameForMatch(raw)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
}

function tokenOverlapScore(left: string, right: string) {
  const leftTokens = new Set(nameTokens(left))
  const rightTokens = nameTokens(right)
  if (!leftTokens.size || !rightTokens.length) return 0

  let shared = 0
  for (const token of rightTokens) {
    if (leftTokens.has(token)) shared += 1
  }

  return shared / Math.max(leftTokens.size, rightTokens.length)
}

export function resolveUserIdFromScheduledByName(
  scheduledByName: string,
  users: ScheduleUserRecord[],
): string | null {
  const raw = scheduledByName.trim()
  if (!raw) return null

  const normalizedInput = normalizePersonNameForMatch(raw)
  if (!normalizedInput) return null

  const exactMatches = users.filter(
    (user) => normalizePersonNameForMatch(user.name) === normalizedInput,
  )
  if (exactMatches.length === 1) return exactMatches[0].id

  const containsMatches = users.filter((user) => {
    const normalizedUser = normalizePersonNameForMatch(user.name)
    if (!normalizedUser) return false
    return (
      normalizedInput.includes(normalizedUser) ||
      normalizedUser.includes(normalizedInput)
    )
  })
  if (containsMatches.length === 1) return containsMatches[0].id

  const scored = users
    .map((user) => ({
      user,
      score: tokenOverlapScore(raw, user.name),
    }))
    .filter((entry) => entry.score >= 0.75)
    .sort((a, b) => b.score - a.score)

  if (!scored.length) return null
  if (scored.length === 1) return scored[0].user.id
  if (scored[0].score - scored[1].score >= 0.15) return scored[0].user.id

  return null
}

export async function loadApprovedScheduleUsers(): Promise<ScheduleUserRecord[]> {
  const result = await query<ScheduleUserRecord>(
    `SELECT id, name, registration
     FROM users
     WHERE approval_status = 'approved'
       AND role <> 'admin'
     ORDER BY name ASC`,
  )
  return result.rows
}
