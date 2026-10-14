import type { Instrument, Result } from './schemas'

/** The minimal trade shape the stats need (money in integer cents). */
export interface StatTrade {
  id: string
  date: string
  entryTime: string | null
  createdAt: string
  ticker: string
  instrument: Instrument
  result: Result
  pnlCents: number
  setup: string
}

export interface Stats {
  totalTrades: number
  wins: number
  losses: number
  breakeven: number
  /** Percentage 0-100, or null when wins + losses = 0. */
  winRate: number | null
  netPnlCents: number
  avgWinCents: number | null
  avgLossCents: number | null
  /** null when there are no losses. */
  profitFactor: number | null
  bestTrade: StatTrade | null
  worstTrade: StatTrade | null
  longestWinStreak: number
  longestLossStreak: number
  greenDays: number
  redDays: number
  flatDays: number
}

/** Chronological order: date, then entry time (missing times last), then creation time. */
export function sortChronologically<T extends StatTrade>(trades: readonly T[]): T[] {
  return [...trades].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    const ta = a.entryTime ?? '99:99'
    const tb = b.entryTime ?? '99:99'
    if (ta !== tb) return ta < tb ? -1 : 1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export function winRate(wins: number, losses: number): number | null {
  const decided = wins + losses
  if (decided === 0) return null
  return (wins / decided) * 100
}

/** Net P&L per date. */
export function dailyPnl(trades: readonly StatTrade[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of trades) map.set(t.date, (map.get(t.date) ?? 0) + t.pnlCents)
  return map
}

/**
 * Streaks are counted by trade in chronological order. A Breakeven trade (or a trade of the
 * opposite result) ends the current streak.
 */
export function longestStreak(ordered: readonly StatTrade[], result: Result): number {
  let best = 0
  let current = 0
  for (const t of ordered) {
    if (t.result === result) {
      current += 1
      if (current > best) best = current
    } else {
      current = 0
    }
  }
  return best
}

export function computeStats(trades: readonly StatTrade[]): Stats {
  const ordered = sortChronologically(trades)
  let wins = 0
  let losses = 0
  let breakeven = 0
  let net = 0
  let winSum = 0
  let lossSum = 0
  let best: StatTrade | null = null
  let worst: StatTrade | null = null

  for (const t of ordered) {
    net += t.pnlCents
    if (t.result === 'Win') {
      wins += 1
      winSum += t.pnlCents
    } else if (t.result === 'Loss') {
      losses += 1
      lossSum += t.pnlCents
    } else {
      breakeven += 1
    }
    if (best === null || t.pnlCents > best.pnlCents) best = t
    if (worst === null || t.pnlCents < worst.pnlCents) worst = t
  }

  let greenDays = 0
  let redDays = 0
  let flatDays = 0
  for (const pnl of dailyPnl(ordered).values()) {
    if (pnl > 0) greenDays += 1
    else if (pnl < 0) redDays += 1
    else flatDays += 1
  }

  const absLoss = Math.abs(lossSum)

  return {
    totalTrades: ordered.length,
    wins,
    losses,
    breakeven,
    winRate: winRate(wins, losses),
    netPnlCents: net,
    avgWinCents: wins > 0 ? winSum / wins : null,
    avgLossCents: losses > 0 ? lossSum / losses : null,
    profitFactor: losses > 0 && absLoss > 0 ? winSum / absLoss : null,
    bestTrade: best,
    worstTrade: worst,
    longestWinStreak: longestStreak(ordered, 'Win'),
    longestLossStreak: longestStreak(ordered, 'Loss'),
    greenDays,
    redDays,
    flatDays,
  }
}

export interface CumulativePoint {
  date: string
  dayPnlCents: number
  cumulativeCents: number
}

/** Cumulative P&L, one point per date that has trades, in date order. */
export function cumulativeSeries(trades: readonly StatTrade[]): CumulativePoint[] {
  const daily = [...dailyPnl(trades).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  let running = 0
  return daily.map(([date, dayPnlCents]) => {
    running += dayPnlCents
    return { date, dayPnlCents, cumulativeCents: running }
  })
}

export interface MonthlyPoint {
  month: number
  pnlCents: number
  trades: number
}

/** P&L per calendar month (1-12) for the trades of a single year. */
export function pnlByMonth(trades: readonly StatTrade[]): MonthlyPoint[] {
  const out: MonthlyPoint[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, pnlCents: 0, trades: 0 }))
  for (const t of trades) {
    const month = Number(t.date.slice(5, 7))
    const slot = out[month - 1]
    if (slot) {
      slot.pnlCents += t.pnlCents
      slot.trades += 1
    }
  }
  return out
}

export interface GroupStat {
  key: string
  trades: number
  wins: number
  losses: number
  winRate: number | null
  pnlCents: number
}

function groupBy(trades: readonly StatTrade[], keyOf: (t: StatTrade) => string): GroupStat[] {
  const map = new Map<string, GroupStat>()
  for (const t of trades) {
    const key = keyOf(t)
    let g = map.get(key)
    if (!g) {
      g = { key, trades: 0, wins: 0, losses: 0, winRate: null, pnlCents: 0 }
      map.set(key, g)
    }
    g.trades += 1
    g.pnlCents += t.pnlCents
    if (t.result === 'Win') g.wins += 1
    if (t.result === 'Loss') g.losses += 1
  }
  const groups = [...map.values()]
  for (const g of groups) g.winRate = winRate(g.wins, g.losses)
  return groups
}

export function statsBySetup(trades: readonly StatTrade[]): GroupStat[] {
  return groupBy(trades, (t) => (t.setup.trim() === '' ? 'No setup' : t.setup.trim())).sort(
    (a, b) => b.trades - a.trades || a.key.localeCompare(b.key),
  )
}

export function statsByInstrument(trades: readonly StatTrade[]): GroupStat[] {
  const order: Instrument[] = ['Stock', 'Call', 'Put']
  const groups = groupBy(trades, (t) => t.instrument)
  return order.map(
    (key) =>
      groups.find((g) => g.key === key) ?? { key, trades: 0, wins: 0, losses: 0, winRate: null, pnlCents: 0 },
  )
}

export interface YearMonthPoint {
  /** "YYYY-MM" */
  key: string
  pnlCents: number
  trades: number
}

/** P&L per "YYYY-MM", in order. Used for ranges that can span several years. */
export function pnlByYearMonth(trades: readonly StatTrade[]): YearMonthPoint[] {
  const map = new Map<string, YearMonthPoint>()
  for (const t of trades) {
    const key = t.date.slice(0, 7)
    const point = map.get(key) ?? { key, pnlCents: 0, trades: 0 }
    point.pnlCents += t.pnlCents
    point.trades += 1
    map.set(key, point)
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
}
