import { describe, expect, it } from 'vitest'
import {
  daysInMonth,
  formatLongDate,
  isValidISODate,
  monthGrid,
  monthRange,
  parseISODate,
  parseMonthKey,
  shiftDay,
  shiftMonth,
  toISODate,
  todayISO,
  weekdayLabels,
} from './dates'

describe('daysInMonth', () => {
  it('returns the right count for every month of 2026 (non-leap)', () => {
    const expected = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    expected.forEach((days, i) => {
      expect(daysInMonth(2026, i + 1)).toBe(days)
    })
  })

  it('returns 28 for February 2026', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
  })

  it('returns 29 for February 2028 (leap year)', () => {
    expect(daysInMonth(2028, 2)).toBe(29)
  })

  it('handles century rules', () => {
    expect(daysInMonth(2100, 2)).toBe(28)
    expect(daysInMonth(2000, 2)).toBe(29)
  })

  it('monthRange ends on the last real day', () => {
    expect(monthRange(2028, 2)).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(monthRange(2026, 2)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange(2026, 12).to).toBe('2026-12-31')
  })
})

describe('date-string handling (timezone safe)', () => {
  it('runs in an Australian timezone for this suite', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Australia/Sydney')
  })

  it('parses a date string to the same local calendar day', () => {
    const d = parseISODate('2026-10-14')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(9)
    expect(d.getDate()).toBe(14)
    expect(d.getHours()).toBe(0)
  })

  it('round-trips every day of a leap year without shifting', () => {
    for (let month = 1; month <= 12; month += 1) {
      for (let day = 1; day <= daysInMonth(2028, month); day += 1) {
        const iso = `2028-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        expect(toISODate(parseISODate(iso))).toBe(iso)
      }
    }
  })

  it('does not shift across the Australian daylight-saving changeover', () => {
    for (const iso of ['2026-10-04', '2026-10-03', '2026-04-05', '2026-04-04']) {
      expect(toISODate(parseISODate(iso))).toBe(iso)
    }
  })

  it('formats the long date shown in the day panel', () => {
    expect(formatLongDate('2026-10-14')).toBe('Wednesday, 14 October 2026')
  })

  it('validates strings strictly', () => {
    expect(isValidISODate('2026-10-14')).toBe(true)
    expect(isValidISODate('2028-02-29')).toBe(true)
    expect(isValidISODate('2026-02-29')).toBe(false)
    expect(isValidISODate('2026-02-31')).toBe(false)
    expect(isValidISODate('2026-13-01')).toBe(false)
    expect(isValidISODate('2026-1-1')).toBe(false)
    expect(isValidISODate('2026-10-14T00:00:00Z')).toBe(false)
    expect(isValidISODate('')).toBe(false)
  })

  it('throws on invalid input rather than returning an Invalid Date', () => {
    expect(() => parseISODate('nope')).toThrow()
  })

  it('formats today as a local date string', () => {
    expect(todayISO(new Date(2026, 9, 14, 23, 59))).toBe('2026-10-14')
    expect(todayISO(new Date(2026, 9, 14, 0, 0))).toBe('2026-10-14')
  })

  it('shifts days and months across boundaries', () => {
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29')
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
  })

  it('parses month keys', () => {
    expect(parseMonthKey('2026-10')).toEqual({ year: 2026, month: 10 })
    expect(parseMonthKey('2026-13')).toBeNull()
    expect(parseMonthKey('abc')).toBeNull()
  })
})

describe('monthGrid', () => {
  it('pads to full weeks with Monday start (October 2026 starts on a Thursday)', () => {
    const cells = monthGrid(2026, 10, 1)
    expect(cells.length % 7).toBe(0)
    expect(cells.slice(0, 3)).toEqual([null, null, null])
    expect(cells[3]).toBe('2026-10-01')
    expect(cells.filter((c) => c !== null)).toHaveLength(31)
  })

  it('pads with Sunday start', () => {
    const cells = monthGrid(2026, 10, 0)
    expect(cells.slice(0, 4)).toEqual([null, null, null, null])
    expect(cells[4]).toBe('2026-10-01')
  })

  it('shows 29 days for February 2028 and 28 for 2026', () => {
    expect(monthGrid(2028, 2, 1).filter((c) => c !== null)).toHaveLength(29)
    expect(monthGrid(2026, 2, 1).filter((c) => c !== null)).toHaveLength(28)
  })

  it('has no leading padding when the month starts on the first weekday', () => {
    // 2026-06-01 is a Monday
    expect(monthGrid(2026, 6, 1)[0]).toBe('2026-06-01')
  })

  it('produces the weekday header in the chosen order', () => {
    expect(weekdayLabels(1)[0]).toBe('Mon')
    expect(weekdayLabels(1)[6]).toBe('Sun')
    expect(weekdayLabels(0)[0]).toBe('Sun')
  })
})
