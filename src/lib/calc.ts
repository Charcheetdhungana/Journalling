import { PRICE_SCALE } from './money'
import type { Direction, Instrument, Result } from './schemas'

export const OPTION_MULTIPLIER = 100

export interface PnlInput {
  instrument: Instrument
  direction: Direction
  /** Prices in 1/10000 dollar units. */
  entryPriceE4: number
  exitPriceE4: number
  /** Shares for stock, contracts for options. */
  quantity: number
  feesCents: number
}

/**
 * Net P&L in integer cents.
 * gross = (exit - entry) x quantity x multiplier x (Long = +1, Short = -1); net = gross - fees.
 * Options use a 100x multiplier. All arithmetic is on integers (1/10000 dollar units); only the final
 * conversion to cents rounds (half away from zero).
 */
export function calculatePnlCents(input: PnlInput): number {
  const multiplier = input.instrument === 'Stock' ? 1 : OPTION_MULTIPLIER
  const sign = input.direction === 'Long' ? 1 : -1
  const grossE4 = (input.exitPriceE4 - input.entryPriceE4) * input.quantity * multiplier * sign
  const grossCents = Math.sign(grossE4) * Math.round(Math.abs(grossE4) / (PRICE_SCALE / 100))
  return grossCents - input.feesCents
}

export function suggestResult(pnlCents: number): Result {
  if (pnlCents > 0) return 'Win'
  if (pnlCents < 0) return 'Loss'
  return 'Breakeven'
}
