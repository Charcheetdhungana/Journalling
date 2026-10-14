import { calculatePnlCents, suggestResult } from './calc'
import { shiftDay, todayISO } from './dates'
import type { TradeInput } from './schemas'

/** Small deterministic PRNG so sample data is repeatable. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TICKERS = ['AAPL', 'NVDA', 'TSLA', 'SPY', 'QQQ', 'AMD', 'MSFT', 'META', 'AMZN', 'PLTR']
const SETUPS = ['Opening range breakout', 'VWAP reclaim', 'Gap and go', 'Pullback to 9 EMA', 'Earnings drift']
const TAGS = ['followed plan', 'FOMO', 'revenge trade', 'early exit', 'oversized', 'chased entry']
const WHY = [
  'Clean break of the opening range on rising volume.',
  'Held VWAP on the retest, sector was strong.',
  'Gapped on news with a tight base above the premarket high.',
  'Pulled back to the 9 EMA in an uptrend, defined risk.',
]
const WELL = ['Sized correctly and honoured the stop.', 'Waited for confirmation.', 'Took profit into strength.', '']
const WRONG = ['Chased the entry.', 'Held through my exit level.', 'Ignored the broader market weakness.', '']
const LESSON = [
  'Wait for the retest, not the first push.',
  'Do not add to a loser.',
  'The plan works when I follow it.',
  '',
]

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)] as T
}

/** About 90 days of plausible trades ending today (weekdays only), 0-4 trades per day. */
export function generateSampleTrades(today: string = todayISO()): TradeInput[] {
  const rand = mulberry32(20261014)
  const trades: TradeInput[] = []

  for (let back = 90; back >= 0; back -= 1) {
    const date = shiftDay(today, -back)
    const [y, m, d] = date.split('-').map(Number) as [number, number, number]
    const weekday = new Date(y, m - 1, d).getDay()
    if (weekday === 0 || weekday === 6) continue
    if (rand() < 0.22) continue

    const count = 1 + Math.floor(rand() * 4)
    for (let i = 0; i < count; i += 1) {
      const instrument = pick(['Stock', 'Call', 'Put', 'Call'] as const, rand)
      const direction = rand() < 0.88 ? 'Long' : 'Short'
      const isOption = instrument !== 'Stock'
      const entry = isOption ? 80 + Math.floor(rand() * 420) : 5000 + Math.floor(rand() * 40000)
      // ~55% winners; wins slightly larger than losses on average.
      const win = rand() < 0.55
      const movePct = win ? 0.04 + rand() * 0.22 : -(0.03 + rand() * 0.16)
      const signed = direction === 'Long' ? movePct : -movePct
      const exit = Math.max(1, Math.round(entry * (1 + signed)))
      const quantity = isOption ? 1 + Math.floor(rand() * 5) : 5 * (1 + Math.floor(rand() * 8))
      const fees = isOption ? 65 * quantity : 0
      const pnl = calculatePnlCents({
        instrument,
        direction,
        entryPriceE4: entry * 100,
        exitPriceE4: exit * 100,
        quantity,
        feesCents: fees,
      })
      const hour = 9 + Math.floor(rand() * 6)
      const minute = Math.floor(rand() * 60)
      const entryTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      const exitTime = `${String(Math.min(15, hour + 1)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      const tagCount = Math.floor(rand() * 3)
      const tags = Array.from(new Set(Array.from({ length: tagCount }, () => pick(TAGS, rand))))

      trades.push({
        date,
        ticker: pick(TICKERS, rand),
        instrument,
        direction,
        strikeE4: isOption ? (Math.round(entry / 5) * 500 + 10000) * 100 : null,
        expiration: isOption ? shiftDay(date, 7 - (weekday % 5)) : null,
        contracts: isOption ? quantity : null,
        shares: isOption ? null : quantity,
        entryPriceE4: entry * 100,
        exitPriceE4: exit * 100,
        entryTime,
        exitTime,
        feesCents: fees,
        pnlCents: pnl,
        result: suggestResult(pnl),
        setup: pick(SETUPS, rand),
        tags,
        whyTaken: pick(WHY, rand),
        wentWell: pick(WELL, rand),
        wentWrong: pick(WRONG, rand),
        lesson: pick(LESSON, rand),
        rating: 1 + Math.floor(rand() * 5),
        screenshotKey: null,
      })
    }
  }
  return trades
}
