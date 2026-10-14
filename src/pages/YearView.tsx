import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { formatMonthName, monthGrid, monthKey, weekdayLabels, yearRange } from '../lib/dates'
import { dailyPnl, computeStats, type Stats } from '../lib/stats'
import { formatPercent } from '../lib/money'
import { dayTint } from '../lib/tint'
import type { Trade } from '../lib/schemas'
import { useSettings, useTrades } from '../hooks/queries'
import { useUi } from '../providers'
import { SummaryBar, useStats } from '../components/StatsPanel'
import { Card, ErrorState, Money, Skeleton } from '../components/ui'

interface MonthSummary {
  stats: Stats
  daily: Map<string, number>
}

function MiniMonth({
  year,
  month,
  summary,
  weekStartsOn,
  maxAbs,
}: {
  year: number
  month: number
  summary: MonthSummary
  weekStartsOn: 0 | 1
  maxAbs: number
}) {
  const cells = useMemo(() => monthGrid(year, month, weekStartsOn), [year, month, weekStartsOn])
  const labels = useMemo(() => weekdayLabels(weekStartsOn, 'narrow'), [weekStartsOn])
  const { stats, daily } = summary
  const name = formatMonthName(month)

  return (
    <Link
      to={`/month/${monthKey(year, month)}`}
      aria-label={`${name} ${year}: ${stats.totalTrades} trades. Open month view`}
      className="block rounded-card border border-line bg-card p-4 transition-colors hover:border-accent"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{name}</h3>
        {stats.totalTrades > 0 ? (
          <Money cents={stats.netPnlCents} className="text-sm font-semibold" />
        ) : (
          <span className="text-xs text-muted">No trades logged</span>
        )}
      </div>
      <div className="num mt-0.5 flex h-4 gap-3 text-xs text-muted">
        {stats.totalTrades > 0 && (
          <>
            <span>{stats.totalTrades} trades</span>
            <span>Win rate {formatPercent(stats.winRate, 0)}</span>
          </>
        )}
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1" aria-hidden>
        {labels.map((l, i) => (
          <div key={i} className="text-center text-[10px] text-muted">
            {l}
          </div>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} />
          const pnl = daily.get(iso)
          const day = Number(iso.slice(8))
          return (
            <div
              key={i}
              title={pnl === undefined ? undefined : `${iso}: ${pnl / 100}`}
              className="num flex aspect-square items-center justify-center rounded text-[10px] text-muted"
              style={pnl === undefined ? undefined : { background: dayTint(pnl, maxAbs), color: '#e6eaf2' }}
            >
              {day}
            </div>
          )
        })}
      </div>
    </Link>
  )
}

export function YearView() {
  const { year } = useUi()
  const range = useMemo(() => yearRange(year), [year])
  const { data, isLoading, isError, error, refetch } = useTrades(range)
  const { settings } = useSettings()
  const trades = useMemo<Trade[]>(() => data ?? [], [data])
  const yearStats = useStats(trades)

  const months = useMemo(() => {
    const byMonth: Trade[][] = Array.from({ length: 12 }, () => [])
    for (const t of trades) byMonth[Number(t.date.slice(5, 7)) - 1]?.push(t)
    return byMonth.map((list): MonthSummary => ({ stats: computeStats(list), daily: dailyPnl(list) }))
  }, [trades])

  const maxAbs = useMemo(() => {
    let max = 0
    for (const m of months) for (const v of m.daily.values()) max = Math.max(max, Math.abs(v))
    return max
  }, [months])

  if (isError) {
    return <ErrorState message={error instanceof Error ? error.message : 'Unknown error'} onRetry={() => void refetch()} />
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{year}</h1>
        <p className="text-sm text-muted">Year overview. Select a month to open it.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[74px]" />
          ))}
        </div>
      ) : (
        <SummaryBar stats={yearStats} />
      )}

      {!isLoading && yearStats.totalTrades === 0 && (
        <Card className="px-4 py-3 text-sm text-muted">
          No trades logged in {year} yet. Open any month and click a day to add one, or load sample data from Settings.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-[250px]" />)
          : months.map((summary, i) => (
              <MiniMonth
                key={i}
                year={year}
                month={i + 1}
                summary={summary}
                weekStartsOn={settings.weekStartsOn}
                maxAbs={maxAbs}
              />
            ))}
      </div>
    </div>
  )
}
