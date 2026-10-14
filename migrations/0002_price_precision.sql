-- Prices and strikes move from integer cents to integer units of 1/10000 dollar (4 decimal places).
-- P&L and fees stay in integer cents.
ALTER TABLE trades RENAME COLUMN strike_cents TO strike_e4;
ALTER TABLE trades RENAME COLUMN entry_price_cents TO entry_price_e4;
ALTER TABLE trades RENAME COLUMN exit_price_cents TO exit_price_e4;

-- Existing values were whole cents: 1 cent = 100 units.
UPDATE trades SET
  strike_e4 = strike_e4 * 100,
  entry_price_e4 = entry_price_e4 * 100,
  exit_price_e4 = exit_price_e4 * 100;
