/**
 * P&L and fees are stored and computed as integer cents.
 * Prices and strikes are integer units of 1/10000 dollar (4 decimal places), so a $0.0512 stock
 * keeps its precision. Converted to dollars only for display.
 */

const numberFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** +$1,234.56 / -$55.32. An exact zero is shown without a sign: $0.00. */
export function formatMoney(cents: number, symbol = '$'): string {
  const sign = cents < 0 ? '-' : cents > 0 ? '+' : ''
  return `${sign}${symbol}${numberFormat.format(Math.abs(cents) / 100)}`
}

/** Unsigned, e.g. $1,234.56 (used for fees). */
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

/** Parse user input such as "1,234.5" or "-55.32" into cents. Returns null when empty or invalid. */
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

// ---------------------------------------------------------------- prices (1/10000 dollar)

export const PRICE_SCALE = 10_000

const priceFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

/** $1.37, $0.0512, $1,250.50: at least 2 and at most 4 decimals. */
export function formatPrice(e4: number, symbol = '$'): string {
  const sign = e4 < 0 ? '-' : ''
  return `${sign}${symbol}${priceFormat.format(Math.abs(e4) / PRICE_SCALE)}`
}

/** Parse "0.0512" or "1,250.5" into 1/10000 dollar units. Null when empty or invalid. */
export function parsePriceInput(raw: string): number | null {
  const cleaned = raw.replace(/[,$\s]/g, '')
  if (cleaned === '' || cleaned === '.' || !/^\d*\.?\d*$/.test(cleaned)) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.round(n * PRICE_SCALE + 1e-6)
}

/** Units -> plain input string without trailing zeros: 512 -> "0.0512", 13700 -> "1.37". */
export function priceToInput(e4: number | null | undefined): string {
  if (e4 === null || e4 === undefined) return ''
  return String(e4 / PRICE_SCALE)
}

/** Plain decimal string for CSV: up to 4 decimals, at least 2. */
export function priceToCsv(e4: number | null): string {
  if (e4 === null) return ''
  const fixed = (e4 / PRICE_SCALE).toFixed(4)
  return fixed.replace(/(\.\d{2}\d*?)0+$/, '$1')
}

/** Short form for tight spaces: +$8.8k, -$329, +$12k, +$1.2M. */
export function formatCompactMoney(cents: number, symbol = '$'): string {
  if (cents === 0) return `${symbol}0`
  const sign = cents < 0 ? '-' : '+'
  const dollars = Math.abs(cents) / 100
  let body: string
  if (dollars >= 1_000_000) body = `${(dollars / 1_000_000).toFixed(1)}M`
  else if (dollars >= 10_000) body = `${Math.round(dollars / 1000)}k`
  else if (dollars >= 1000) body = `${(dollars / 1000).toFixed(1)}k`
  else body = String(Math.round(dollars))
  return `${sign}${symbol}${body}`
}

