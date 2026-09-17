import { isAutoBlocked, toDateKey } from './brazilianHolidays'

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

function brazilYmd(date: Date) {
  const parts = brazilDateTimeParts(date)
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

function fromBrazilWallClock(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date | null {
  const date = new Date(
    `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-03:00`,
  )
  if (Number.isNaN(date.getTime())) return null
  return date
}

function addBrazilCalendarDays(year: number, month: number, day: number, offset: number) {
  const noon = fromBrazilWallClock(year, month, day, 12, 0)
  if (!noon) return null
  const shifted = new Date(noon.getTime() + offset * 24 * 60 * 60 * 1000)
  const parts = brazilYmd(shifted)
  return { year: parts.year, month: parts.month, day: parts.day }
}

export function scheduleSlotKey(date: Date) {
  const parts = brazilYmd(date)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}-${pad(parts.hour)}:${pad(parts.minute)}`
}

export function listAllowedScheduleTimes() {
  return getDaySlots().map((minutes) => {
    const hour = pad(Math.floor(minutes / 60))
    const minute = pad(minutes % 60)
    return { hour, minute, label: `${hour}:${minute}` }
  })
}

export function isAllowedScheduleSlot(date: Date) {
  const parts = brazilYmd(date)
  const minutes = parts.hour * 60 + parts.minute
  if (minutes % SLOT_INTERVAL_MINUTES !== 0) return false
  return TIME_WINDOWS.some((window) => minutes >= window.start && minutes <= window.end)
}

export function findNextAvailableSlot(
  manualBlocks: Set<string>,
  occupiedSlots: Set<string> = new Set(),
  from: Date = new Date(),
): Date | null {
  const daySlots = getDaySlots()
  const fromParts = brazilYmd(from)
  const start = addBrazilCalendarDays(
    fromParts.year,
    fromParts.month,
    fromParts.day,
    MINIMUM_DAYS_AHEAD,
  )
  if (!start) return null

  for (let dayOffset = 0; dayOffset < 366; dayOffset += 1) {
    const day = addBrazilCalendarDays(start.year, start.month, start.day, dayOffset)
    if (!day) continue
    const noon = fromBrazilWallClock(day.year, day.month, day.day, 12, 0)
    if (!noon || isScheduleDayBlocked(noon, manualBlocks)) continue

    for (const slotMinutes of daySlots) {
      const slot = fromBrazilWallClock(
        day.year,
        day.month,
        day.day,
        Math.floor(slotMinutes / 60),
        slotMinutes % 60,
      )
      if (!slot) continue
      if (occupiedSlots.has(scheduleSlotKey(slot))) continue
      return slot
    }
  }

  return null
}
