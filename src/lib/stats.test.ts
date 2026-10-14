import { describe, expect, it } from 'vitest'
import {
  computeStats,
  cumulativeSeries,
  longestStreak,
  pnlByMonth,
  pnlByYearMonth,
  sortChronologically,
  statsByInstrument,
  statsBySetup,
  winRate,
  type StatTrade,
} from './stats'
import type { Instrument, Result } from './schemas'

let seq = 0
function trade(overrides: Partial<StatTrade> & { pnlCents: number; result?: Result }): StatTrade {
  seq += 1
  const result: Result = overrides.result ?? (overrides.pnlCents > 0 ? 'Win' : overrides.pnlCents < 0 ? 'Loss' : 'Breakeven')
  return {
    id: `t${String(seq).padStart(4, '0')}`,
    date: '2026-10-14',
    entryTime: null,
    createdAt: `2026-10-14T00:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    ticker: 'AAPL',
    instrument: 'Stock' as Instrument,
    setup: '',
    ...overrides,
    result,
  }
}

describe('computeStats', () => {
  it('handles zero trades without NaN', () => {
    const s = computeStats([])
    expect(s.totalTrades).toBe(0)
    expect(s.wins).toBe(0)
    expect(s.losses).toBe(0)
    expect(s.breakeven).toBe(0)
    expect(s.winRate).toBeNull()
    expect(s.netPnlCents).toBe(0)
    expect(s.avgWinCents).toBeNull()
    expect(s.avgLossCents).toBeNull()
    expect(s.profitFactor).toBeNull()
    expect(s.bestTrade).toBeNull()
    expect(s.worstTrade).toBeNull()
    expect(s.longestWinStreak).toBe(0)
    expect(s.longestLossStreak).toBe(0)
    expect(s.greenDays).toBe(0)
    expect(s.redDays).toBe(0)
  })

  it('computes win rate excluding breakeven trades', () => {
    const s = computeStats([
      trade({ pnlCents: 10000 }),
      trade({ pnlCents: 5000 }),
      trade({ pnlCents: -3000 }),
      trade({ pnlCents: 0 }),
      trade({ pnlCents: 0 }),
    ])
    expect(s.totalTrades).toBe(5)
    expect(s.wins).toBe(2)
    expect(s.losses).toBe(1)
    expect(s.breakeven).toBe(2)
    // 2 / (2 + 1), NOT 2 / 5
    expect(s.winRate).toBeCloseTo(66.6667, 3)
  })

  it('returns a null win rate when only breakeven trades exist', () => {
    const s = computeStats([trade({ pnlCents: 0 }), trade({ pnlCents: 0 })])
    expect(s.winRate).toBeNull()
    expect(s.totalTrades).toBe(2)
  })

  it('computes net P&L, averages and profit factor', () => {
    const s = computeStats([
      trade({ pnlCents: 30000 }),
      trade({ pnlCents: 10000 }),
      trade({ pnlCents: -5000 }),
      trade({ pnlCents: -15000 }),
    ])
    expect(s.netPnlCents).toBe(20000)
    expect(s.avgWinCents).toBe(20000)
    expect(s.avgLossCents).toBe(-10000)
    expect(s.profitFactor).toBeCloseTo(2, 10) // 40000 / 20000
  })

  it('returns a null profit factor when there are no losses', () => {
    const s = computeStats([trade({ pnlCents: 10000 }), trade({ pnlCents: 2000 })])
    expect(s.profitFactor).toBeNull()
    expect(s.avgLossCents).toBeNull()
    expect(s.winRate).toBe(100)
  })

  it('handles all-loss data', () => {
    const s = computeStats([trade({ pnlCents: -1000 }), trade({ pnlCents: -2000 })])
    expect(s.winRate).toBe(0)
    expect(s.profitFactor).toBe(0)
    expect(s.avgWinCents).toBeNull()
  })

  it('finds best and worst trades', () => {
    const best = trade({ pnlCents: 99900, ticker: 'NVDA' })
    const worst = trade({ pnlCents: -88800, ticker: 'TSLA' })
    const s = computeStats([trade({ pnlCents: 100 }), best, worst])
    expect(s.bestTrade?.ticker).toBe('NVDA')
    expect(s.worstTrade?.ticker).toBe('TSLA')
  })

  it('counts green and red days by daily net P&L', () => {
    const s = computeStats([
      trade({ date: '2026-10-12', pnlCents: 5000 }),
      trade({ date: '2026-10-12', pnlCents: -1000 }), // net +4000 -> green
      trade({ date: '2026-10-13', pnlCents: -2000 }), // red
      trade({ date: '2026-10-14', pnlCents: 1000 }),
      trade({ date: '2026-10-14', pnlCents: -1000 }), // net 0 -> neither
    ])
    expect(s.greenDays).toBe(1)
    expect(s.redDays).toBe(1)
    expect(s.flatDays).toBe(1)
  })

  it('computes streaks in date/time order regardless of input order', () => {
    const trades = [
      trade({ date: '2026-10-05', pnlCents: 1 }),
      trade({ date: '2026-10-01', pnlCents: 1 }),
      trade({ date: '2026-10-02', pnlCents: 1 }),
      trade({ date: '2026-10-03', pnlCents: -1 }),
      trade({ date: '2026-10-04', pnlCents: -1 }),
      trade({ date: '2026-10-06', pnlCents: -1 }),
      trade({ date: '2026-10-07', pnlCents: -1 }),
    ]
    const s = computeStats(trades)
    // order: W W L L W L L -> win streak 2, loss streak 2
    expect(s.longestWinStreak).toBe(2)
    expect(s.longestLossStreak).toBe(2)
  })

  it('orders same-day trades by entry time', () => {
    const a = trade({ date: '2026-10-14', entryTime: '14:00', pnlCents: -1 })
    const b = trade({ date: '2026-10-14', entryTime: '09:30', pnlCents: 1 })
    const c = trade({ date: '2026-10-14', entryTime: null, pnlCents: 1 })
    expect(sortChronologically([a, c, b]).map((t) => t.id)).toEqual([b.id, a.id, c.id])
  })

  it('a breakeven trade ends a streak', () => {
    const t = [
      trade({ date: '2026-10-01', pnlCents: 1 }),
      trade({ date: '2026-10-02', pnlCents: 0 }),
      trade({ date: '2026-10-03', pnlCents: 1 }),
    ]
    expect(longestStreak(sortChronologically(t), 'Win')).toBe(1)
  })

  it('uses the Result field, not the sign of P&L', () => {
    const s = computeStats([trade({ pnlCents: 500, result: 'Breakeven' })])
    expect(s.breakeven).toBe(1)
    expect(s.wins).toBe(0)
  })
})

describe('winRate', () => {
  it('is null when nothing decided', () => {
    expect(winRate(0, 0)).toBeNull()
  })
  it('is a percentage', () => {
    expect(winRate(1, 3)).toBe(25)
  })
})

describe('chart helpers', () => {
  it('builds a cumulative series by date', () => {
    const series = cumulativeSeries([
      trade({ date: '2026-10-02', pnlCents: -500 }),
      trade({ date: '2026-10-01', pnlCents: 1000 }),
      trade({ date: '2026-10-01', pnlCents: 200 }),
    ])
    expect(series).toEqual([
      { date: '2026-10-01', dayPnlCents: 1200, cumulativeCents: 1200 },
      { date: '2026-10-02', dayPnlCents: -500, cumulativeCents: 700 },
    ])
  })

  it('groups P&L by month', () => {
    const months = pnlByMonth([
      trade({ date: '2026-01-15', pnlCents: 100 }),
      trade({ date: '2026-01-20', pnlCents: 50 }),
      trade({ date: '2026-12-31', pnlCents: -25 }),
    ])
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ month: 1, pnlCents: 150, trades: 2 })
    expect(months[11]).toEqual({ month: 12, pnlCents: -25, trades: 1 })
    expect(months[5]).toEqual({ month: 6, pnlCents: 0, trades: 0 })
  })

  it('groups by setup, treating blanks as "No setup"', () => {
    const groups = statsBySetup([
      trade({ setup: 'ORB', pnlCents: 100 }),
      trade({ setup: 'ORB', pnlCents: -50 }),
      trade({ setup: '', pnlCents: 10 }),
    ])
    const orb = groups.find((g) => g.key === 'ORB')
    expect(orb).toMatchObject({ trades: 2, wins: 1, losses: 1, winRate: 50, pnlCents: 50 })
    expect(groups.find((g) => g.key === 'No setup')?.trades).toBe(1)
  })

  it('always returns Stock, Call and Put', () => {
    const groups = statsByInstrument([trade({ instrument: 'Call', pnlCents: 100 })])
    expect(groups.map((g) => g.key)).toEqual(['Stock', 'Call', 'Put'])
    expect(groups[1]?.pnlCents).toBe(100)
    expect(groups[0]?.trades).toBe(0)
  })
})

describe('pnlByYearMonth', () => {
  it('spans years in order', () => {
    const points = pnlByYearMonth([
      trade({ date: '2027-01-02', pnlCents: 5 }),
      trade({ date: '2026-12-30', pnlCents: 10 }),
      trade({ date: '2026-12-31', pnlCents: -4 }),
    ])
    expect(points).toEqual([
      { key: '2026-12', pnlCents: 6, trades: 2 },
      { key: '2027-01', pnlCents: 5, trades: 1 },
    ])
  })
})
