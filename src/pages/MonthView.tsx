import { useEffect, useMemo } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  daysInMonth,
  formatMonthName,
  monthGrid,
  monthKey,
  monthRange,
  parseMonthKey,
  shiftMonth,
  todayISO,
  weekdayLabels,
} from '../lib/dates'
import { dailyPnl, type StatTrade } from '../lib/stats'
import { dayTint } from '../lib/tint'
import type { Trade } from '../lib/schemas'
import { useSettings, useTrades } from '../hooks/queries'
import { useUi } from '../providers'
import { CumulativeChart, ChartCard } from '../components/charts'
import { StatsPanel, useStats } from '../components/StatsPanel'
import { Button, Card, ErrorState, Money, Skeleton } from '../components/ui'

export function MonthView() {
  const params = useParams()
  const parsed = parseMonthKey(params.monthKey ?? '')
  if (!parsed) return <Navigate to="/" replace />
  return <MonthContent year={parsed.year} month={parsed.month} />
}

function MonthContent({ year, month }: { year: number; month: number }) {
  const navigate = useNavigate()
  const { setYear, openDayPanel } = useUi()
  const { settings } = useSettings()
  const range = useMemo(() => monthRange(year, month), [year, month])
  const { data, isLoading, isError, error, refetch } = useTrades(range)
  const trades = useMemo<Trade[]>(() => data ?? [], [data])
  const stats = useStats(trades)
  const today = todayISO()

  useEffect(() => setYear(year), [year, setYear])

  const daily = useMemo(() => dailyPnl(trades as StatTrade[]), [trades])
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of trades) map.set(t.date, (map.get(t.date) ?? 0) + 1)
    return map
  }, [trades])
  const maxAbs = useMemo(() => Math.max(0, ...[...daily.values()].map(Math.abs)), [daily])

  const cells = useMemo(() => monthGrid(year, month, settings.weekStartsOn), [year, month, settings.weekStartsOn])
  const labels = useMemo(() => weekdayLabels(settings.weekStartsOn), [settings.weekStartsOn])

  const chartPoints = useMemo(() => {
    let running = 0
    return Array.from({ length: daysInMonth(year, month) }, (_, i) => {
      const iso = `${monthKey(year, month)}-${String(i + 1).padStart(2, '0')}`
      running += daily.get(iso) ?? 0
      return { label: iso, value: running }
    })
  }, [daily, year, month])

  const prev = shiftMonth(year, month, -1)
  const next = shiftMonth(year, month, 1)
  const title = `${formatMonthName(month)} ${year}`

  if (isError) {
    return <ErrorState message={error instanceof Error ? error.message : 'Unknown error'} onRetry={() => void refetch()} />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/"
          aria-label="Back to year"
          className="inline-flex items-center gap-2 rounded-ctl border border-line bg-raised px-3 py-2 text-sm hover:border-muted"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to year
        </Link>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            aria-label="Previous month"
            className="!px-2"
            onClick={() => navigate(`/month/${monthKey(prev.year, prev.month)}`)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <h1 className="min-w-[10rem] text-center text-lg font-semibold">{title}</h1>
          <Button
            variant="ghost"
            aria-label="Next month"
            className="!px-2"
            onClick={() => navigate(`/month/${monthKey(next.year, next.month)}`)}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        {!isLoading && stats.totalTrades > 0 && (
          <div className="ml-auto text-sm">
            <span className="text-muted">Net </span>
            <Money cents={stats.netPnlCents} className="font-semibold" />
          </div>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-3 sm:p-4">
          {isLoading ? (
            <Skeleton className="h-[480px]" />
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 sm:gap-2" role="grid" aria-label={`${title} calendar`}>
                {labels.map((l) => (
                  <div key={l} role="columnheader" className="pb-1 text-center text-[11px] font-medium text-muted sm:text-xs">
                    {l}
                  </div>
                ))}
                {cells.map((iso, i) => {
                  if (!iso) return <div key={i} role="gridcell" aria-hidden className="min-h-[56px] sm:min-h-[92px]" />
                  const pnl = daily.get(iso)
                  const count = counts.get(iso) ?? 0
                  const isToday = iso === today
                  const day = Number(iso.slice(8))
                  const money = pnl === undefined ? '' : `, net ${pnl / 100} dollars`
                  return (
                    <button
                      key={i}
                      type="button"
                      role="gridcell"
                      aria-label={`${day} ${formatMonthName(month)} ${year}, ${count} ${count === 1 ? 'trade' : 'trades'}${money}`}
                      onClick={() => openDayPanel(iso)}
                      className={`flex min-h-[56px] flex-col items-stretch justify-between rounded-ctl border p-1.5 text-left transition-colors hover:border-muted sm:min-h-[92px] sm:p-2.5 ${
                        isToday ? 'border-accent ring-1 ring-accent' : 'border-line'
                      }`}
                      style={{ background: pnl === undefined ? 'rgb(var(--c-raised))' : dayTint(pnl, maxAbs) }}
                    >
                      <span className="num text-xs font-medium sm:text-sm">{day}</span>
                      {pnl !== undefined && (
                        <span className="flex flex-col">
                          <Money cents={pnl} className="text-[10px] font-semibold !text-fg sm:text-sm" />
                          <span className="num hidden text-xs text-fg/70 sm:block">
                            {count} {count === 1 ? 'trade' : 'trades'}
                          </span>
                          <span className="num text-[10px] text-fg/70 sm:hidden">{count}t</span>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {stats.totalTrades === 0 && (
                <p className="mt-4 text-center text-sm text-muted">
                  No trades logged in {title}. Click a day to add one.
                </p>
              )}
            </>
          )}
        </Card>

        <div className="space-y-5">
          <section aria-label="Monthly stats" className="rounded-card border border-line bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Monthly stats</h2>
            {isLoading ? <Skeleton className="h-64" /> : <StatsPanel stats={stats} columns={2} />}
          </section>
          <ChartCard title="Cumulative P&L" empty={!isLoading && stats.totalTrades === 0}>
            {isLoading ? (
              <Skeleton className="h-40" />
            ) : (
              <CumulativeChart
                points={chartPoints}
                symbol={settings.currencySymbol}
                height={170}
                dateLabel={(l) => String(Number(l.slice(8)))}
              />
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
