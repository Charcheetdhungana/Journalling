import type { Trade, TradeInput } from '../src/lib/schemas'

export interface TradeRow {
  id: string
  date: string
  ticker: string
  instrument: Trade['instrument']
  direction: Trade['direction']
  strike_e4: number | null
  expiration: string | null
  contracts: number | null
  shares: number | null
  entry_price_e4: number | null
  exit_price_e4: number | null
  entry_time: string | null
  exit_time: string | null
  fees_cents: number
  pnl_cents: number
  result: Trade['result']
  setup: string
  tags: string
  why_taken: string
  went_well: string
  went_wrong: string
  lesson: string
  rating: number | null
  screenshot_key: string | null
  created_at: string
  updated_at: string
}

function parseTags(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw)
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  } catch {
    // fall through
  }
  return []
}

export function rowToTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    date: row.date,
    ticker: row.ticker,
    instrument: row.instrument,
    direction: row.direction,
    strikeE4: row.strike_e4,
    expiration: row.expiration,
    contracts: row.contracts,
    shares: row.shares,
    entryPriceE4: row.entry_price_e4,
    exitPriceE4: row.exit_price_e4,
    entryTime: row.entry_time,
    exitTime: row.exit_time,
    feesCents: row.fees_cents,
    pnlCents: row.pnl_cents,
    result: row.result,
    setup: row.setup,
    tags: parseTags(row.tags),
    whyTaken: row.why_taken,
    wentWell: row.went_well,
    wentWrong: row.went_wrong,
    lesson: row.lesson,
    rating: row.rating,
    screenshotKey: row.screenshot_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const TRADE_COLUMNS = `id, date, ticker, instrument, direction, strike_e4, expiration, contracts, shares,
  entry_price_e4, exit_price_e4, entry_time, exit_time, fees_cents, pnl_cents, result, setup, tags,
  why_taken, went_well, went_wrong, lesson, rating, screenshot_key, created_at, updated_at`

const INSERT_SQL = `INSERT INTO trades (${TRADE_COLUMNS}) VALUES (${Array.from({ length: 26 }, () => '?').join(', ')})`

export function insertTradeStatement(db: D1Database, trade: Trade): D1PreparedStatement {
  return db
    .prepare(INSERT_SQL)
    .bind(
      trade.id,
      trade.date,
      trade.ticker,
      trade.instrument,
      trade.direction,
      trade.strikeE4,
      trade.expiration,
      trade.contracts,
      trade.shares,
      trade.entryPriceE4,
      trade.exitPriceE4,
      trade.entryTime,
      trade.exitTime,
      trade.feesCents,
      trade.pnlCents,
      trade.result,
      trade.setup,
      JSON.stringify(trade.tags),
      trade.whyTaken,
      trade.wentWell,
      trade.wentWrong,
      trade.lesson,
      trade.rating,
      trade.screenshotKey,
      trade.createdAt,
      trade.updatedAt,
    )
}

export function updateTradeStatement(db: D1Database, id: string, input: TradeInput, updatedAt: string): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE trades SET date = ?, ticker = ?, instrument = ?, direction = ?, strike_e4 = ?, expiration = ?,
        contracts = ?, shares = ?, entry_price_e4 = ?, exit_price_e4 = ?, entry_time = ?, exit_time = ?,
        fees_cents = ?, pnl_cents = ?, result = ?, setup = ?, tags = ?, why_taken = ?, went_well = ?,
        went_wrong = ?, lesson = ?, rating = ?, screenshot_key = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      input.date,
      input.ticker,
      input.instrument,
      input.direction,
      input.strikeE4,
      input.expiration,
      input.contracts,
      input.shares,
      input.entryPriceE4,
      input.exitPriceE4,
      input.entryTime,
      input.exitTime,
      input.feesCents,
      input.pnlCents,
      input.result,
      input.setup,
      JSON.stringify(input.tags),
      input.whyTaken,
      input.wentWell,
      input.wentWrong,
      input.lesson,
      input.rating,
      input.screenshotKey,
      updatedAt,
      id,
    )
}

export function newTrade(input: TradeInput, now: string): Trade {
  return { ...input, id: input.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now }
}

/** Deletes an R2 object unless another trade still references it. */
export async function deleteScreenshotIfUnreferenced(
  db: D1Database,
  bucket: R2Bucket,
  key: string | null,
  exceptTradeId?: string,
): Promise<void> {
  if (!key) return
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM trades WHERE screenshot_key = ? AND id != ?')
    .bind(key, exceptTradeId ?? '')
    .first<{ n: number }>()
  if (row && row.n > 0) return
  await bucket.delete(key)
}

/** Removes every R2 screenshot whose key is not in `keep`. */
export async function deleteOrphanScreenshots(bucket: R2Bucket, keep: ReadonlySet<string>): Promise<void> {
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix: 'screenshots/', cursor })
    const orphans = page.objects.map((o) => o.key).filter((k) => !keep.has(k))
    if (orphans.length > 0) await bucket.delete(orphans)
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
}
