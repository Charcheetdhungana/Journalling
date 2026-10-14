import { describe, expect, it } from 'vitest'
import { upgradeBackup } from './backup'
import { calculatePnlCents, suggestResult } from './calc'
import {
  centsToInput,
  dollarsToCents,
  formatCompactMoney,
  formatMoney,
  formatPercent,
  formatPrice,
  parseDollarInput,
  parsePriceInput,
  priceToCsv,
  priceToInput,
} from './money'
import { backupSchema, tradeInputSchema } from './schemas'

describe('formatMoney', () => {
  it('shows the sign, except for an exact zero', () => {
    expect(formatMoney(123456)).toBe('+$1,234.56')
    expect(formatMoney(-5532)).toBe('-$55.32')
    expect(formatMoney(0)).toBe('$0.00')
  })
  it('uses a custom currency symbol', () => {
    expect(formatMoney(1000, '£')).toBe('+£10.00')
    expect(formatMoney(0, '£')).toBe('£0.00')
  })
  it('formats percentages and missing values', () => {
    expect(formatPercent(66.666)).toBe('66.7%')
    expect(formatPercent(null)).toBe('—')
  })
})

describe('formatCompactMoney', () => {
  it('shortens amounts for narrow cells', () => {
    expect(formatCompactMoney(881815)).toBe('+$8.8k')
    expect(formatCompactMoney(-32920)).toBe('-$329')
    expect(formatCompactMoney(1203120)).toBe('+$12k')
    expect(formatCompactMoney(250_000_00)).toBe('+$250k')
    expect(formatCompactMoney(0)).toBe('$0')
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

describe('prices (1/10000 dollar precision)', () => {
  it('parses up to four decimals exactly', () => {
    expect(parsePriceInput('0.0512')).toBe(512)
    expect(parsePriceInput('1.37')).toBe(13700)
    expect(parsePriceInput('1,250.5')).toBe(12_505_000)
    expect(parsePriceInput('0.1235')).toBe(1235)
    expect(parsePriceInput('')).toBeNull()
    expect(parsePriceInput('abc')).toBeNull()
    expect(parsePriceInput('-1')).toBeNull()
  })
  it('formats with 2 to 4 decimals', () => {
    expect(formatPrice(512)).toBe('$0.0512')
    expect(formatPrice(13700)).toBe('$1.37')
    expect(formatPrice(12_505_000)).toBe('$1,250.50')
    expect(formatPrice(1_000_000, '£')).toBe('£100.00')
  })
  it('round-trips through input strings and CSV', () => {
    expect(priceToInput(512)).toBe('0.0512')
    expect(priceToInput(13700)).toBe('1.37')
    expect(priceToInput(null)).toBe('')
    expect(priceToCsv(512)).toBe('0.0512')
    expect(priceToCsv(13700)).toBe('1.37')
    expect(priceToCsv(10000)).toBe('1.00')
    expect(priceToCsv(null)).toBe('')
  })
})

describe('calculatePnlCents', () => {
  it('long stock', () => {
    expect(
      calculatePnlCents({
        instrument: 'Stock',
        direction: 'Long',
        entryPriceE4: 1_000_000,
        exitPriceE4: 1_025_000,
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
        entryPriceE4: 500_000,
        exitPriceE4: 490_000,
        quantity: 10,
        feesCents: 0,
      }),
    ).toBe(1000) // $1.00 x 10 shares
  })

  it('a $0.0512 stock x 100,000 shares keeps sub-cent precision', () => {
    const entry = parsePriceInput('0.0512') as number
    const exit = parsePriceInput('0.0587') as number
    // (0.0587 - 0.0512) x 100,000 = $750.00 exactly. Cent-rounded prices would give $500 or $1,000.
    expect(
      calculatePnlCents({
        instrument: 'Stock',
        direction: 'Long',
        entryPriceE4: entry,
        exitPriceE4: exit,
        quantity: 100_000,
        feesCents: 0,
      }),
    ).toBe(75_000)
    // Position value: 100,000 x $0.0512 = $5,120.00 = 512,000 cents
    expect((entry * 100_000) / 100).toBe(512_000)
  })

  it('a $1.37 option x 5 contracts uses the 100x multiplier', () => {
    const entry = parsePriceInput('1.37') as number
    const exit = parsePriceInput('2.05') as number
    // (2.05 - 1.37) x 5 x 100 = $340.00, minus $3.25 fees
    expect(
      calculatePnlCents({
        instrument: 'Call',
        direction: 'Long',
        entryPriceE4: entry,
        exitPriceE4: exit,
        quantity: 5,
        feesCents: 325,
      }),
    ).toBe(33_675)
    // The same prices as a short put reverse the sign
    expect(
      calculatePnlCents({
        instrument: 'Put',
        direction: 'Short',
        entryPriceE4: entry,
        exitPriceE4: exit,
        quantity: 5,
        feesCents: 0,
      }),
    ).toBe(-34_000)
  })

  it('rounds half a cent away from zero', () => {
    // 0.0001 x 150 shares = $0.015 = 1.5 cents
    const gain = calculatePnlCents({
      instrument: 'Stock',
      direction: 'Long',
      entryPriceE4: 512,
      exitPriceE4: 513,
      quantity: 150,
      feesCents: 0,
    })
    const loss = calculatePnlCents({
      instrument: 'Stock',
      direction: 'Long',
      entryPriceE4: 513,
      exitPriceE4: 512,
      quantity: 150,
      feesCents: 0,
    })
    expect(gain).toBe(2)
    expect(loss).toBe(-2)
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
    strikeE4: null,
    expiration: null,
    contracts: null,
    shares: 100_000,
    entryPriceE4: 512,
    exitPriceE4: 587,
    entryTime: '09:31',
    exitTime: null,
    feesCents: 0,
    pnlCents: 75_000,
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
    expect(tradeInputSchema.parse(base).ticker).toBe('AAPL')
  })
  it('accepts sub-cent prices as integer units', () => {
    expect(tradeInputSchema.safeParse(base).success).toBe(true)
  })
  it('rejects fractional units and negative prices', () => {
    expect(tradeInputSchema.safeParse({ ...base, entryPriceE4: 512.5 }).success).toBe(false)
    expect(tradeInputSchema.safeParse({ ...base, entryPriceE4: -1 }).success).toBe(false)
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

describe('upgradeBackup (v1 cents -> v2 1/10000 units)', () => {
  const v1Trade = {
    id: '11111111-1111-4111-8111-111111111111',
    date: '2026-10-14',
    ticker: 'SPY',
    instrument: 'Call',
    direction: 'Long',
    strikeCents: 55000,
    expiration: '2026-10-16',
    contracts: 5,
    shares: null,
    entryPriceCents: 137,
    exitPriceCents: 205,
    entryTime: null,
    exitTime: null,
    feesCents: 325,
    pnlCents: 33675,
    result: 'Win',
    setup: '',
    tags: [],
    whyTaken: '',
    wentWell: '',
    wentWrong: '',
    lesson: '',
    rating: null,
    screenshotKey: null,
    createdAt: '2026-10-14T00:00:00.000Z',
    updatedAt: '2026-10-14T00:00:00.000Z',
  }
  const v1 = {
    app: 'trade-journal',
    version: 1,
    exportedAt: '2026-10-14T00:00:00.000Z',
    trades: [v1Trade],
    dayNotes: [],
    settings: { weekStartsOn: 1, currencySymbol: '$' },
  }

  it('converts prices and validates against the current schema', () => {
    const upgraded = backupSchema.parse(upgradeBackup(v1))
    expect(upgraded.version).toBe(2)
    const t = upgraded.trades[0]
    expect(t?.strikeE4).toBe(5_500_000)
    expect(t?.entryPriceE4).toBe(13700)
    expect(t?.exitPriceE4).toBe(20500)
    expect(t?.pnlCents).toBe(33675)
    expect(t?.feesCents).toBe(325)
  })

  it('does not touch a v2 backup or non-objects', () => {
    const v2 = { ...v1, version: 2 }
    expect(upgradeBackup(v2)).toBe(v2)
    expect(upgradeBackup(null)).toBeNull()
    expect(upgradeBackup('x')).toBe('x')
  })
})
