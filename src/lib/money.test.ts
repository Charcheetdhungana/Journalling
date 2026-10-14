import { describe, expect, it } from 'vitest'
import { calculatePnlCents, suggestResult } from './calc'
import { centsToInput, dollarsToCents, formatMoney, formatPercent, parseDollarInput } from './money'
import { tradeInputSchema } from './schemas'

describe('formatMoney', () => {
  it('always shows the sign', () => {
    expect(formatMoney(123456)).toBe('+$1,234.56')
    expect(formatMoney(-5532)).toBe('-$55.32')
    expect(formatMoney(0)).toBe('+$0.00')
  })
  it('uses a custom currency symbol', () => {
    expect(formatMoney(1000, '£')).toBe('+£10.00')
  })
  it('formats percentages and missing values', () => {
    expect(formatPercent(66.666)).toBe('66.7%')
    expect(formatPercent(null)).toBe('—')
  })
})

describe('cents conversion', () => {
  it('rounds binary float edge cases correctly', () => {
    expect(dollarsToCents(1.005)).toBe(101)
    expect(dollarsToCents(0.1 + 0.2)).toBe(30)
    expect(dollarsToCents(-55.32)).toBe(-5532)
    expect(dollarsToCents(19.99)).toBe(1999)
  })
  it('parses user input', () => {
    expect(parseDollarInput('1,234.50')).toBe(123450)
    expect(parseDollarInput('-55.32')).toBe(-5532)
    expect(parseDollarInput('')).toBeNull()
    expect(parseDollarInput('abc')).toBeNull()
    expect(parseDollarInput('-')).toBeNull()
  })
  it('renders cents for inputs', () => {
    expect(centsToInput(12345)).toBe('123.45')
    expect(centsToInput(1200)).toBe('12')
    expect(centsToInput(null)).toBe('')
  })
})

describe('calculatePnlCents', () => {
  it('long stock', () => {
    expect(
      calculatePnlCents({
        instrument: 'Stock',
        direction: 'Long',
        entryPriceCents: 10000,
        exitPriceCents: 10250,
        quantity: 100,
        feesCents: 200,
      }),
    ).toBe(24800) // 2.50 * 100 - 2.00
  })
  it('short stock profits when price falls', () => {
    expect(
      calculatePnlCents({
        instrument: 'Stock',
        direction: 'Short',
        entryPriceCents: 5000,
        exitPriceCents: 4900,
        quantity: 10,
        feesCents: 0,
      }),
    ).toBe(1000)
  })
  it('options use a 100x multiplier', () => {
    expect(
      calculatePnlCents({
        instrument: 'Call',
        direction: 'Long',
        entryPriceCents: 150,
        exitPriceCents: 250,
        quantity: 2,
        feesCents: 130,
      }),
    ).toBe(19870) // 1.00 * 2 * 100 - 1.30
  })
  it('suggests a result from the sign', () => {
    expect(suggestResult(1)).toBe('Win')
    expect(suggestResult(-1)).toBe('Loss')
    expect(suggestResult(0)).toBe('Breakeven')
  })
})

describe('tradeInputSchema', () => {
  const base = {
    date: '2026-10-14',
    ticker: ' aapl ',
    instrument: 'Stock',
    direction: 'Long',
    strikeCents: null,
    expiration: null,
    contracts: null,
    shares: 10,
    entryPriceCents: 100,
    exitPriceCents: 110,
    entryTime: '09:31',
    exitTime: null,
    feesCents: 0,
    pnlCents: 100,
    result: 'Win',
    setup: '',
    tags: [],
    whyTaken: '',
    wentWell: '',
    wentWrong: '',
    lesson: '',
    rating: 4,
    screenshotKey: null,
  }
  it('uppercases and trims the ticker', () => {
    const parsed = tradeInputSchema.parse(base)
    expect(parsed.ticker).toBe('AAPL')
  })
  it('rejects an impossible date', () => {
    expect(tradeInputSchema.safeParse({ ...base, date: '2026-02-30' }).success).toBe(false)
  })
  it('rejects non-integer cents', () => {
    expect(tradeInputSchema.safeParse({ ...base, pnlCents: 10.5 }).success).toBe(false)
  })
  it('rejects a missing ticker', () => {
    expect(tradeInputSchema.safeParse({ ...base, ticker: '  ' }).success).toBe(false)
  })
  it('rejects a bad screenshot key', () => {
    expect(tradeInputSchema.safeParse({ ...base, screenshotKey: '../../etc/passwd' }).success).toBe(false)
  })
})
