import {
  addDays,
  addMonths,
  format,
  getDaysInMonth,
  isValid,
  parse,
  startOfMonth,
} from 'date-fns'

/**
 * All trade dates are plain local "YYYY-MM-DD" strings.
 * NEVER call new Date("YYYY-MM-DD"): that parses as UTC and shifts the day in timezones
 * like Australia. Everything here uses date-fns parse/format in local time.
 */
export const ISO_DATE_FORMAT = 'yyyy-MM-dd'
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** A fixed local reference date so parse() never depends on "now". */
const REFERENCE = new Date(2000, 0, 1)

export function isValidISODate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  const parsed = parse(value, ISO_DATE_FORMAT, REFERENCE)
  // Round-trip guards against overflow such as 2026-02-31.
  return isValid(parsed) && format(parsed, ISO_DATE_FORMAT) === value
}

/** Parse a "YYYY-MM-DD" string into a local-midnight Date. Throws on invalid input. */
export function parseISODate(value: string): Date {
  if (!isValidISODate(value)) throw new Error(`Invalid date string: ${value}`)
  return parse(value, ISO_DATE_FORMAT, REFERENCE)
}

export function toISODate(date: Date): string {
  return format(date, ISO_DATE_FORMAT)
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now)
}

/** Number of days in a month. `month` is 1-12. Never hardcoded: handles leap years. */
export function daysInMonth(year: number, month: number): number {
  return getDaysInMonth(new Date(year, month - 1, 1))
}

export function monthKey(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

/** "2026-10" -> { year: 2026, month: 10 }, or null when malformed. */
export function parseMonthKey(key: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return { year, month }
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  const last = daysInMonth(year, month)
  return {
    from: `${monthKey(year, month)}-01`,
    to: `${monthKey(year, month)}-${String(last).padStart(2, '0')}`,
  }
}

export function yearRange(year: number): { from: string; to: string } {
  const y = String(year).padStart(4, '0')
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = addMonths(new Date(year, month - 1, 1), delta)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function shiftDay(iso: string, delta: number): string {
  return toISODate(addDays(parseISODate(iso), delta))
}

/** Cells of a month grid; null = padding cell. Length is always a multiple of 7. */
export function monthGrid(year: number, month: number, weekStartsOn: 0 | 1): (string | null)[] {
  const first = startOfMonth(new Date(year, month - 1, 1))
  const lead = (first.getDay() - weekStartsOn + 7) % 7
  const total = daysInMonth(year, month)
  const cells: (string | null)[] = []
  for (let i = 0; i < lead; i += 1) cells.push(null)
  for (let day = 1; day <= total; day += 1) {
    cells.push(`${monthKey(year, month)}-${String(day).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function weekdayLabels(weekStartsOn: 0 | 1, style: 'short' | 'narrow' = 'short'): string[] {
  const sunday = new Date(2023, 0, 1) // a Sunday (local)
  const out: string[] = []
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(sunday, (weekStartsOn + i) % 7)
    out.push(format(d, style === 'short' ? 'EEE' : 'EEEEE'))
  }
  return out
}

export function formatLongDate(iso: string): string {
  return format(parseISODate(iso), 'EEEE, d MMMM yyyy')
}

export function formatMonthName(month: number, pattern: 'MMMM' | 'MMM' = 'MMMM'): string {
  return format(new Date(2000, month - 1, 1), pattern)
}

export function formatShortDate(iso: string): string {
  return format(parseISODate(iso), 'd MMM yyyy')
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}
