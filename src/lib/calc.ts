import type { Direction, Instrument, Result } from './schemas'

export const OPTION_MULTIPLIER = 100

export interface PnlInput {
  instrument: Instrument
  direction: Direction
  /** Prices in cents. */
  entryPriceCents: number
  exitPriceCents: number
  /** Shares for stock, contracts for options. */
  quantity: number
  feesCents: number
}

/**
 * Net P&L in integer cents.
 * gross = (exit - entry) x quantity x multiplier x (Long = +1, Short = -1); net = gross - fees.
 * Options use a 100x multiplier.
 */
export function calculatePnlCents(input: PnlInput): number {
  const multiplier = input.instrument === 'Stock' ? 1 : OPTION_MULTIPLIER
  const sign = input.direction === 'Long' ? 1 : -1
  const gross = (input.exitPriceCents - input.entryPriceCents) * input.quantity * multiplier * sign
  return Math.round(gross) - input.feesCents
}

export function suggestResult(pnlCents: number): Result {
  if (pnlCents > 0) return 'Win'
  if (pnlCents < 0) return 'Loss'
  return 'Breakeven'
}
