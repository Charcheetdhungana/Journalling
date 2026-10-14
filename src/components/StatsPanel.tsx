import { useMemo } from 'react'
import { computeStats, type Stats } from '../lib/stats'
import { formatPercent, formatRatio } from '../lib/money'
import type { Trade } from '../lib/schemas'
import { EmptyState, Money, StatTile } from './ui'

export function useStats(trades: readonly Trade[]): Stats {
  return useMemo(() => computeStats(trades), [trades])
}

/** Compact one-row summary used at the top of the year view. */
export function SummaryBar({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile label="Net P&L" value={<Money cents={stats.netPnlCents} />} />
      <StatTile label="Total trades" value={stats.totalTrades} />
      <StatTile label="Wins" value={<span className="text-win">{stats.wins}</span>} />
      <StatTile label="Losses" value={<span className="text-loss">{stats.losses}</span>} />
      <StatTile label="Win rate" value={formatPercent(stats.winRate)} />
      <StatTile label="Profit factor" value={formatRatio(stats.profitFactor)} />
    </div>
  )
}

export function StatsPanel({ stats, columns = 2 }: { stats: Stats; columns?: 2 | 3 | 4 }) {
  if (stats.totalTrades === 0) {
    return <EmptyState title="No trades logged" hint="Stats appear here once you log a trade." />
  }

  const grid = columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'

  return (
    <div className={`grid grid-cols-2 gap-3 ${grid}`}>
      <StatTile label="Net P&L" value={<Money cents={stats.netPnlCents} />} />
      <StatTile label="Total trades" value={stats.totalTrades} />
      <StatTile label="Win rate" value={formatPercent(stats.winRate)} sub="Excludes breakeven" />
      <StatTile label="Profit factor" value={formatRatio(stats.profitFactor)} />
      <StatTile
        label="Wins / Losses / BE"
        value={
          <>
            <span className="text-win">{stats.wins}</span>
            <span className="text-muted"> / </span>
            <span className="text-loss">{stats.losses}</span>
            <span className="text-muted"> / </span>
            <span className="text-be">{stats.breakeven}</span>
          </>
        }
      />
      <StatTile
        label="Green / Red days"
        value={
          <>
            <span className="text-win">{stats.greenDays}</span>
            <span className="text-muted"> / </span>
            <span className="text-loss">{stats.redDays}</span>
          </>
        }
      />
      <StatTile
        label="Average win"
        value={stats.avgWinCents === null ? '—' : <Money cents={Math.round(stats.avgWinCents)} />}
      />
      <StatTile
        label="Average loss"
        value={stats.avgLossCents === null ? '—' : <Money cents={Math.round(stats.avgLossCents)} />}
      />
      <StatTile
        label="Best trade"
        value={stats.bestTrade ? <Money cents={stats.bestTrade.pnlCents} /> : '—'}
        sub={stats.bestTrade?.ticker}
      />
      <StatTile
        label="Worst trade"
        value={stats.worstTrade ? <Money cents={stats.worstTrade.pnlCents} /> : '—'}
        sub={stats.worstTrade?.ticker}
      />
      <StatTile label="Win streak" value={stats.longestWinStreak} sub="Longest, by trade" />
      <StatTile label="Loss streak" value={stats.longestLossStreak} sub="Longest, by trade" />
    </div>
  )
}
