import { isAutoBlocked, toDateKey } from './brazilian-holidays.js'

const SLOT_INTERVAL_MINUTES = 10
const MINIMUM_DAYS_AHEAD = 30

const TIME_WINDOWS = [
  { start: 8 * 60 + 30, end: 11 * 60 + 30 },
  { start: 14 * 60, end: 16 * 60 + 30 },
]

const BRAZIL_TIME_ZONE = 'America/Sao_Paulo'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function brazilDateTimeParts(date: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: BRAZIL_TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>
}

function getDaySlots() {
  const slots: number[] = []

  for (const window of TIME_WINDOWS) {
    for (let minutes = window.start; minutes <= window.end; minutes += SLOT_INTERVAL_MINUTES) {
      slots.push(minutes)
    }
  }

  return slots
}

export function isScheduleDayBlocked(date: Date, manualBlocks: Set<string>) {
  return isAutoBlocked(date) || manualBlocks.has(toDateKey(date))
}

export function formatAvailableSlot(date: Date) {
  const parts = brazilDateTimeParts(date)
  return `${parts.day}/${parts.month}/${parts.year} às ${parts.hour}:${parts.minute}`
}

export function formatBrazilWallClock(
  day: number,
  month: number,
  year: number,
  hour: number,
  minute: number,
) {
  return `${pad(day)}/${pad(month)}/${year} às ${pad(hour)}:${pad(minute)}`
}

export function fromBrazilWallClock(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null
  }

  const date = new Date(
    `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-03:00`,
  )
  if (Number.isNaN(date.getTime())) return null

  const parts = brazilDateTimeParts(date)
  if (
    Number(parts.year) !== year ||
    Number(parts.month) !== month ||
    Number(parts.day) !== day ||
    Number(parts.hour) !== hour ||
    Number(parts.minute) !== minute
  ) {
    return null
  }

  return date
}

export function parseBrazilDateTimeLabel(value: string | null | undefined): Date | null {
  const match = String(value ?? '').match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/,
  )
  if (!match || match[4] == null || match[5] == null) return null
  return fromBrazilWallClock(
    Number(match[3]),
    Number(match[2]),
    Number(match[1]),
    Number(match[4]),
    Number(match[5]),
  )
}

export function scheduleSlotKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function findNextAvailableSlot(
  manualBlocks: Set<string>,
  occupiedSlots: Set<string> = new Set(),
  from: Date = new Date(),
): Date | null {
  const daySlots = getDaySlots()
  const searchFrom = new Date(from)
  searchFrom.setDate(searchFrom.getDate() + MINIMUM_DAYS_AHEAD)
  searchFrom.setHours(0, 0, 0, 0)

  for (let dayOffset = 0; dayOffset < 366; dayOffset += 1) {
    const day = new Date(searchFrom)
    day.setDate(searchFrom.getDate() + dayOffset)
    day.setHours(0, 0, 0, 0)

    if (isScheduleDayBlocked(day, manualBlocks)) continue

    for (const slotMinutes of daySlots) {
      const slot = new Date(day)
      slot.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0)
      if (occupiedSlots.has(scheduleSlotKey(slot))) continue
      return slot
    }
  }

  return null
}
