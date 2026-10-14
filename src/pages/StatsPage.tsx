import { useMemo, useState } from 'react'
import { monthRange, todayISO, yearRange } from '../lib/dates'
import { cumulativeSeries, pnlByYearMonth, statsByInstrument, statsBySetup } from '../lib/stats'
import type { Trade } from '../lib/schemas'
import { ALL_TIME, useSettings, useTrades } from '../hooks/queries'
import { useUi } from '../providers'
import {
  ChartCard,
  CumulativeChart,
  InstrumentChart,
  MonthlyBarChart,
  WinRateBySetupChart,
  cumulativeToPoints,
} from '../components/charts'
import { StatsPanel, useStats } from '../components/StatsPanel'
import { Card, ErrorState, Skeleton } from '../components/ui'
import { formatShortDate } from '../lib/dates'

type Mode = 'thisMonth' | 'month' | 'year' | 'all'

export function StatsPage() {
  const { year } = useUi()
  const { settings } = useSettings()
  const [mode, setMode] = useState<Mode>('thisMonth')
  const [month, setMonth] = useState(() => todayISO().slice(0, 7))

  const range = useMemo(() => {
    if (mode === 'all') return ALL_TIME
    if (mode === 'year') return yearRange(year)
    const key = mode === 'thisMonth' ? todayISO().slice(0, 7) : month
    const y = Number(key.slice(0, 4))
    const m = Number(key.slice(5, 7))
    if (!y || m < 1 || m > 12) return monthRange(Number(todayISO().slice(0, 4)), Number(todayISO().slice(5, 7)))
    return monthRange(y, m)
  }, [mode, month, year])

  const { data, isLoading, isError, error, refetch } = useTrades(range)
  const trades = useMemo<Trade[]>(() => data ?? [], [data])
  const stats = useStats(trades)
  const cumulative = useMemo(() => cumulativeSeries(trades), [trades])
  const monthly = useMemo(() => pnlByYearMonth(trades), [trades])
  const bySetup = useMemo(() => statsBySetup(trades), [trades])
  const byInstrument = useMemo(() => statsByInstrument(trades), [trades])

  const subtitle =
    mode === 'all'
      ? 'All time'
      : `${formatShortDate(range.from)} – ${formatShortDate(range.to)}`
  const empty = !isLoading && stats.totalTrades === 0

  const modes: { id: Mode; label: string }[] = [
    { id: 'thisMonth', label: 'This month' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: `Year ${year}` },
    { id: 'all', label: 'All time' },
  ]

  if (isError) {
    return <ErrorState message={error instanceof Error ? error.message : 'Unknown error'} onRetry={() => void refetch()} />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Stats</h1>
          <p className="num text-sm text-muted">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label="Stats range" className="flex gap-1 rounded-ctl border border-line bg-raised p-1">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                aria-label={`Range: ${m.label}`}
                onClick={() => setMode(m.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === m.id ? 'bg-accent text-white' : 'text-muted hover:text-fg'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {mode === 'month' && (
            <div>
              <label htmlFor="stats-month" className="sr-only">
                Choose month
              </label>
              <input
                id="stats-month"
                type="month"
                className="field"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      <Card className="p-4">
        {isLoading ? <Skeleton className="h-48" /> : <StatsPanel stats={stats} columns={4} />}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Cumulative P&L" empty={empty}>
          {isLoading ? (
            <Skeleton className="h-[220px]" />
          ) : (
            <CumulativeChart
              points={cumulativeToPoints(cumulative)}
              symbol={settings.currencySymbol}
              dateLabel={(l) => formatShortDate(l)}
            />
          )}
        </ChartCard>
        <ChartCard title="P&L by month" empty={empty}>
          {isLoading ? <Skeleton className="h-[240px]" /> : <MonthlyBarChart points={monthly} symbol={settings.currencySymbol} />}
        </ChartCard>
        <ChartCard title="Win rate by setup" empty={empty}>
          {isLoading ? <Skeleton className="h-[220px]" /> : <WinRateBySetupChart groups={bySetup} />}
        </ChartCard>
        <ChartCard title="P&L by instrument" empty={empty}>
          {isLoading ? (
            <Skeleton className="h-[220px]" />
          ) : (
            <InstrumentChart groups={byInstrument} symbol={settings.currencySymbol} />
          )}
        </ChartCard>
      </div>
    </div>
  )
}
