import { isAutoBlocked, toDateKey } from './brazilianHolidays'

const SLOT_INTERVAL_MINUTES = 10

const TIME_WINDOWS = [
  { start: 8 * 60 + 30, end: 11 * 60 + 30 },
  { start: 14 * 60, end: 16 * 60 + 30 },
]

function pad(value: number) {
  return String(value).padStart(2, '0')
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
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} às ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function findNextAvailableSlot(
  manualBlocks: Set<string>,
  from: Date = new Date(),
): Date | null {
  const daySlots = getDaySlots()

  for (let dayOffset = 0; dayOffset < 366; dayOffset += 1) {
    const day = new Date(from)
    day.setDate(from.getDate() + dayOffset)
    day.setHours(0, 0, 0, 0)

    if (isScheduleDayBlocked(day, manualBlocks)) continue

    const minMinutes =
      dayOffset === 0
        ? Math.ceil((from.getHours() * 60 + from.getMinutes()) / SLOT_INTERVAL_MINUTES) *
          SLOT_INTERVAL_MINUTES
        : daySlots[0]

    for (const slotMinutes of daySlots) {
      if (slotMinutes < minMinutes) continue

      const slot = new Date(day)
      slot.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0)
      return slot
    }
  }

  return null
}
