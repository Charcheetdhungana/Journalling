import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search } from 'lucide-react'
import { formatShortDate, todayISO } from '../lib/dates'
import { INSTRUMENTS, RESULTS, type Trade } from '../lib/schemas'
import { ALL_TIME, useTrades } from '../hooks/queries'
import { useUi } from '../providers'
import { Button, Card, EmptyState, ErrorState, Money, ResultBadge, Skeleton } from '../components/ui'

type SortKey = 'date' | 'ticker' | 'instrument' | 'pnl' | 'result'

function compare(a: Trade, b: Trade, key: SortKey): number {
  switch (key) {
    case 'date':
      return a.date === b.date
        ? (a.entryTime ?? '99:99').localeCompare(b.entryTime ?? '99:99') || a.createdAt.localeCompare(b.createdAt)
        : a.date.localeCompare(b.date)
    case 'ticker':
      return a.ticker.localeCompare(b.ticker)
    case 'instrument':
      return a.instrument.localeCompare(b.instrument)
    case 'pnl':
      return a.pnlCents - b.pnlCents
    case 'result':
      return a.result.localeCompare(b.result)
  }
}

const COLUMNS: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'date', label: 'Date' },
  { key: 'ticker', label: 'Ticker' },
  { key: 'instrument', label: 'Instrument' },
  { key: 'pnl', label: 'P&L', align: 'right' },
  { key: 'result', label: 'Result' },
]

export function TradesPage() {
  const { openTradeForm } = useUi()
  const { data, isLoading, isError, error, refetch } = useTrades(ALL_TIME)
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [instrument, setInstrument] = useState('')
  const [result, setResult] = useState('')
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })

  const trades = useMemo<Trade[]>(() => data ?? [], [data])
  const allTags = useMemo(() => [...new Set(trades.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b)), [trades])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = trades.filter((t) => {
      if (from && t.date < from) return false
      if (to && t.date > to) return false
      if (instrument && t.instrument !== instrument) return false
      if (result && t.result !== result) return false
      if (tag && !t.tags.includes(tag)) return false
      if (q) {
        const hay = `${t.ticker} ${t.setup} ${t.tags.join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    const sign = sort.dir === 'asc' ? 1 : -1
    return filtered.sort((a, b) => sign * compare(a, b, sort.key))
  }, [trades, search, from, to, instrument, result, tag, sort])

  const net = rows.reduce((sum, t) => sum + t.pnlCents, 0)
  const hasFilters = Boolean(search || from || to || instrument || result || tag)

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' ? 'desc' : 'asc' }))

  if (isError) {
    return <ErrorState message={error instanceof Error ? error.message : 'Unknown error'} onRetry={() => void refetch()} />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Trades</h1>
          <p className="text-sm text-muted">Every trade you have logged.</p>
        </div>
        <Button variant="primary" aria-label="Add trade" onClick={() => openTradeForm({ mode: 'new', date: todayISO() })}>
          <Plus className="h-4 w-4" aria-hidden />
          Add trade
        </Button>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative sm:col-span-2">
            <label htmlFor="trade-search" className="sr-only">
              Search ticker, setup or tag
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              id="trade-search"
              className="field pl-9"
              placeholder="Search ticker, setup, tag"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="f-from" className="label">
              From
            </label>
            <input id="f-from" type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="f-to" className="label">
              To
            </label>
            <input id="f-to" type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label htmlFor="f-instrument" className="label">
              Instrument
            </label>
            <select id="f-instrument" className="field" value={instrument} onChange={(e) => setInstrument(e.target.value)}>
              <option value="">All</option>
              {INSTRUMENTS.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-result" className="label">
              Result
            </label>
            <select id="f-result" className="field" value={result} onChange={(e) => setResult(e.target.value)}>
              <option value="">All</option>
              {RESULTS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <label htmlFor="f-tag" className="label">
              Tag
            </label>
            <select id="f-tag" className="field" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">All tags</option>
              {allTags.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          {hasFilters && (
            <div className="flex items-end">
              <Button
                aria-label="Clear filters"
                onClick={() => {
                  setSearch('')
                  setFrom('')
                  setTo('')
                  setInstrument('')
                  setResult('')
                  setTag('')
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No trades logged"
            hint={hasFilters ? 'No trades match these filters.' : 'Open the calendar and add your first trade.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    {COLUMNS.map((c) => {
                      const active = sort.key === c.key
                      const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
                      return (
                        <th
                          key={c.key}
                          scope="col"
                          aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                          className={`px-4 py-3 font-medium ${c.align === 'right' ? 'text-right' : ''}`}
                        >
                          <button
                            type="button"
                            aria-label={`Sort by ${c.label}`}
                            className={`inline-flex items-center gap-1 hover:text-fg ${active ? 'text-fg' : ''}`}
                            onClick={() => toggleSort(c.key)}
                          >
                            {c.label}
                            <Icon className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </th>
                      )
                    })}
                    <th scope="col" className="px-4 py-3 font-medium">
                      Setup
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr
                      key={t.id}
                      tabIndex={0}
                      aria-label={`Edit ${t.ticker} trade on ${formatShortDate(t.date)}`}
                      className="cursor-pointer border-b border-line last:border-0 hover:bg-raised"
                      onClick={() => openTradeForm({ mode: 'edit', trade: t })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openTradeForm({ mode: 'edit', trade: t })
                        }
                      }}
                    >
                      <td className="num whitespace-nowrap px-4 py-3">{formatShortDate(t.date)}</td>
                      <td className="px-4 py-3 font-semibold">{t.ticker}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {t.instrument} · {t.direction}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        <Money cents={t.pnlCents} />
                      </td>
                      <td className="px-4 py-3">
                        <ResultBadge result={t.result} />
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-muted">{t.setup || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
              <span className="text-muted">
                {rows.length} {rows.length === 1 ? 'trade' : 'trades'}
              </span>
              <span>
                <span className="text-muted">Net </span>
                <Money cents={net} className="font-semibold" />
              </span>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
