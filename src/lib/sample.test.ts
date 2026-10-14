import { describe, expect, it } from 'vitest'
import { generateSampleTrades } from './sample'
import { tradeInputSchema } from './schemas'

describe('generateSampleTrades', () => {
  const trades = generateSampleTrades('2026-10-14')

  it('produces a useful amount of data', () => {
    expect(trades.length).toBeGreaterThan(40)
  })

  it('every sample trade passes the same validation as the API', () => {
    for (const t of trades) {
      expect(tradeInputSchema.safeParse(t).success).toBe(true)
    }
  })

  it('never lands on a weekend and stays within the window', () => {
    for (const t of trades) {
      const [y, m, d] = t.date.split('-').map(Number) as [number, number, number]
      const day = new Date(y, m - 1, d).getDay()
      expect([0, 6]).not.toContain(day)
      expect(t.date <= '2026-10-14').toBe(true)
    }
  })

  it('is deterministic', () => {
    expect(generateSampleTrades('2026-10-14')).toEqual(trades)
  })
})
