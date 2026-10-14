import type { Trade } from '../src/lib/schemas'

const HEADERS = [
  'Date',
  'Ticker',
  'Instrument',
  'Direction',
  'Strike',
  'Expiration',
  'Contracts',
  'Shares',
  'Entry price',
  'Exit price',
  'Entry time',
  'Exit time',
  'Fees',
  'Net P&L',
  'Result',
  'Setup',
  'Tags',
  'Rating',
  'Why I took it',
  'What went well',
  'What went wrong',
  'Lesson',
] as const

/** Quote when needed, and neutralise spreadsheet formula injection in free text. */
export function csvText(value: string): string {
  let v = value
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function dollars(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2)
}

export function tradesToCsv(trades: readonly Trade[]): string {
  const lines: string[] = [HEADERS.join(',')]
  for (const t of trades) {
    lines.push(
      [
        t.date,
        csvText(t.ticker),
        t.instrument,
        t.direction,
        dollars(t.strikeCents),
        t.expiration ?? '',
        t.contracts === null ? '' : String(t.contracts),
        t.shares === null ? '' : String(t.shares),
        dollars(t.entryPriceCents),
        dollars(t.exitPriceCents),
        t.entryTime ?? '',
        t.exitTime ?? '',
        dollars(t.feesCents),
        dollars(t.pnlCents),
        t.result,
        csvText(t.setup),
        csvText(t.tags.join('; ')),
        t.rating === null ? '' : String(t.rating),
        csvText(t.whyTaken),
        csvText(t.wentWell),
        csvText(t.wentWrong),
        csvText(t.lesson),
      ].join(','),
    )
  }
  // BOM so Excel opens it as UTF-8.
  return `﻿${lines.join('\r\n')}\r\n`
}
