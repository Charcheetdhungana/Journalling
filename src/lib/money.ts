/** Money is stored and computed as integer cents; converted to dollars only for display. */

const numberFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** +$1,234.56 / -$55.32 / +$0.00 (the sign is always shown). */
export function formatMoney(cents: number, symbol = '$'): string {
  const sign = cents < 0 ? '-' : '+'
  return `${sign}${symbol}${numberFormat.format(Math.abs(cents) / 100)}`
}

/** Unsigned, e.g. $1,234.56 (used for prices and fees). */
export function formatPlainMoney(cents: number, symbol = '$'): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}${symbol}${numberFormat.format(Math.abs(cents) / 100)}`
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}%`
}

export function formatRatio(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

export function dollarsToCents(dollars: number): number {
  // The 1e-8 nudge fixes binary-float cases such as 1.005 * 100 = 100.49999999999999.
  return Math.sign(dollars) * Math.round(Math.abs(dollars) * 100 + 1e-8)
}

export function centsToDollars(cents: number): number {
  return cents / 100
}

/** Parse user input such as "1,234.5" or "-55.32". Returns null when empty or invalid. */
export function parseDollarInput(raw: string): number | null {
  const cleaned = raw.replace(/[,$\s]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '+') return null
  if (!/^[+-]?\d*\.?\d*$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? dollarsToCents(n) : null
}

/** Cents -> plain input string, e.g. 12345 -> "123.45". */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  const value = cents / 100
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}
