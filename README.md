# Trade Journal

A trading journal for US stocks and options: calendar (year and month), day panel, trade form,
trades table and stats. It is **only a journal** (no broker connection, no live data).

- Frontend: Vite + React + TypeScript + Tailwind, date-fns, recharts, lucide-react, TanStack Query
- Backend: one Cloudflare Worker (Hono) serving the built app and a JSON API under `/api/*`
- Data: Cloudflare **D1** (SQL) for trades, day notes and settings; **R2** for screenshots
- Auth: Cloudflare Access in front of your domain; the Worker also verifies the Access JWT on every `/api/*` call

## Run it locally

```bash
npm install
npm run dev        # applies local DB migrations, then starts http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # type-check + production build into dist/, then verifies nothing local-only ships
```

Locally the app uses a simulated D1 and R2 stored in `.wrangler/state/`, and `.dev.vars`
(`DEV_BYPASS_AUTH=true`) skips the Access check **only for requests to `localhost`**.
Open **Settings → Load sample data** to see it populated.

## Deploy

See [DEPLOY.md](DEPLOY.md) for the step-by-step guide (D1, R2, custom domain, Cloudflare Access).

## Where data is stored

| Data | Location |
| --- | --- |
| Trades, day notes, settings | D1 database `trade-journal` (P&L and fees as integer cents; prices and strikes as integers in 1/10000 dollar; dates as `YYYY-MM-DD` text) |
| Screenshots | R2 bucket `trade-journal-screenshots` (only the object key is kept in D1) |

Nothing is stored in browser storage, so it is identical on every device and survives clearing the browser.

## Back up and restore

**Settings → Export backup (.json)** downloads everything (trades, day notes, settings and
screenshots embedded as images). **Settings → Import backup** loads such a file after a
confirmation dialog and *replaces* all current data in one database transaction.
**Export trades (.csv)** gives a spreadsheet of trades.

## Rules the app follows

- Dates are plain local `YYYY-MM-DD` strings, parsed only with date-fns (never `new Date("YYYY-MM-DD")`),
  so a trade logged on the 14th always shows on the 14th, including in Australian timezones.
  The test suite runs in `Australia/Sydney` to prove it.
- Win rate = Wins / (Wins + Losses); breakeven excluded; shows “—” when there is nothing to divide.
- Profit factor = sum of winning P&L / |sum of losing P&L|; “—” when there are no losses.
- Streaks are by trade in date/time order; a Breakeven trade ends a streak.
- Win / Loss / Breakeven is the **Result** you choose (auto-suggested from the P&L sign), not the sign itself.
- P&L and fees are integer cents. Entry/exit price and strike keep 4 decimal places (integer units of 1/10000 dollar), so a $0.0512 stock x 100,000 shares calculates exactly. Auto-calculate works on integers and rounds only the final result to a cent (half away from zero).
- An exact zero is shown as `$0.00` with no sign; other amounts always show + or -.
- Backups are version 2. Version 1 backups (prices in cents) are upgraded automatically on import.

## Project layout

```
worker/        Hono API (auth, trades, notes, settings, screenshots, import/export)
migrations/    D1 SQL migrations
src/lib/       pure logic: stats.ts, dates.ts, money.ts, calc.ts, schemas.ts (all unit-tested)
src/pages/     Year, Month, Trades, Stats, Settings
src/components Day panel, trade form, charts, layout
```
