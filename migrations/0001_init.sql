-- Money columns are INTEGER cents. Dates are "YYYY-MM-DD" TEXT (never timestamps).
CREATE TABLE trades (
  id                TEXT PRIMARY KEY,
  date              TEXT NOT NULL,
  ticker            TEXT NOT NULL,
  instrument        TEXT NOT NULL CHECK (instrument IN ('Stock', 'Call', 'Put')),
  direction         TEXT NOT NULL CHECK (direction IN ('Long', 'Short')),
  strike_cents      INTEGER,
  expiration        TEXT,
  contracts         INTEGER,
  shares            INTEGER,
  entry_price_cents INTEGER,
  exit_price_cents  INTEGER,
  entry_time        TEXT,
  exit_time         TEXT,
  fees_cents        INTEGER NOT NULL DEFAULT 0,
  pnl_cents         INTEGER NOT NULL,
  result            TEXT NOT NULL CHECK (result IN ('Win', 'Loss', 'Breakeven')),
  setup             TEXT NOT NULL DEFAULT '',
  tags              TEXT NOT NULL DEFAULT '[]',
  why_taken         TEXT NOT NULL DEFAULT '',
  went_well         TEXT NOT NULL DEFAULT '',
  went_wrong        TEXT NOT NULL DEFAULT '',
  lesson            TEXT NOT NULL DEFAULT '',
  rating            INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  screenshot_key    TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX idx_trades_date ON trades (date);

CREATE TABLE day_notes (
  date       TEXT PRIMARY KEY,
  text       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
