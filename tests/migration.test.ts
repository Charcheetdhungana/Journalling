import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')

describe('migration 0002_price_precision', () => {
  it('converts existing cent values to 1/10000 dollar units and leaves P&L and fees alone', () => {
    const db = new DatabaseSync(':memory:')
    db.exec(read('0001_init.sql'))
    const insert = db.prepare(
      `INSERT INTO trades (id, date, ticker, instrument, direction, strike_cents, entry_price_cents,
         exit_price_cents, fees_cents, pnl_cents, result, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'c', 'u')`,
    )
    insert.run('a', '2026-10-14', 'SPY', 'Call', 'Long', 55000, 137, 205, 325, 33675, 'Win')
    insert.run('b', '2026-10-14', 'AAPL', 'Stock', 'Long', null, 10000, null, 0, -5, 'Loss')

    db.exec(read('0002_price_precision.sql'))

    const a = db.prepare('SELECT * FROM trades WHERE id = ?').get('a') as Record<string, unknown>
    expect(a.strike_e4).toBe(5_500_000)
    expect(a.entry_price_e4).toBe(13700)
    expect(a.exit_price_e4).toBe(20500)
    expect(a.fees_cents).toBe(325)
    expect(a.pnl_cents).toBe(33675)

    const b = db.prepare('SELECT * FROM trades WHERE id = ?').get('b') as Record<string, unknown>
    expect(b.strike_e4).toBeNull()
    expect(b.entry_price_e4).toBe(1_000_000)
    expect(b.exit_price_e4).toBeNull()
    expect('entry_price_cents' in a).toBe(false)
    db.close()
  })
})
