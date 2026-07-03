function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function getNationalHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>()

  const fixed: Array<[number, number, string]> = [
    [1, 1, 'Ano Novo'],
    [4, 21, 'Tiradentes'],
    [5, 1, 'Dia do Trabalho'],
    [9, 7, 'Independência do Brasil'],
    [10, 12, 'Nossa Senhora Aparecida'],
    [11, 2, 'Finados'],
    [11, 15, 'Proclamação da República'],
    [11, 20, 'Consciência Negra'],
    [12, 25, 'Natal'],
  ]

  for (const [month, day, name] of fixed) {
    holidays.set(toDateKey(new Date(year, month - 1, day)), name)
  }

  const easter = easterSunday(year)
  const movable: Array<[number, string]> = [
    [-48, 'Carnaval (segunda-feira)'],
    [-47, 'Carnaval (terça-feira)'],
    [-2, 'Sexta-feira Santa'],
    [60, 'Corpus Christi'],
  ]

  for (const [offset, name] of movable) {
    holidays.set(toDateKey(addDays(easter, offset)), name)
  }

  return holidays
}

export function isAutoBlocked(date: Date) {
  const day = date.getDay()
  if (day === 0 || day === 5 || day === 6) return true

  const holiday = getNationalHolidays(date.getFullYear()).get(toDateKey(date))
  return Boolean(holiday)
}
