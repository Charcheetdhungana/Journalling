import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReactNode } from 'react'
import { formatMonthName } from '../lib/dates'
import type { CumulativePoint, GroupStat, YearMonthPoint } from '../lib/stats'
import { formatMoney } from '../lib/money'
import { EmptyState } from './ui'

const WIN = '#3b8bff'
const LOSS = '#f05252'
const GRID = '#1e2638'
const MUTED = '#8b95a7'

const tooltipStyle = {
  contentStyle: {
    background: '#141b2b',
    border: '1px solid #1e2638',
    borderRadius: 8,
    color: '#e6eaf2',
    fontSize: 12,
  },
  labelStyle: { color: '#8b95a7' },
  itemStyle: { color: '#e6eaf2' },
  cursor: { fill: 'rgba(139,149,167,0.08)' },
} as const

const axisProps = {
  stroke: MUTED,
  tick: { fill: MUTED, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: GRID },
} as const

function money(symbol: string) {
  return (value: number) => formatMoney(value * 100, symbol)
}

function axisMoney(symbol: string) {
  return (value: number) => `${value < 0 ? '-' : ''}${symbol}${Math.abs(value).toLocaleString('en-US')}`
}

export function ChartCard({
  title,
  empty,
  children,
}: {
  title: string
  empty: boolean
  children: ReactNode
}) {
  return (
    <section className="rounded-card border border-line bg-card p-4" aria-label={title}>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {empty ? <EmptyState title="No trades logged" /> : children}
    </section>
  )
}

export function CumulativeChart({
  points,
  symbol,
  height = 220,
  dateLabel,
}: {
  points: { label: string; value: number }[]
  symbol: string
  height?: number
  dateLabel?: (label: string) => string
}) {
  const data = points.map((p) => ({ label: p.label, value: p.value / 100 }))
  const last = data[data.length - 1]?.value ?? 0
  const color = last < 0 ? LOSS : WIN
  return (
    <div style={{ height }} role="img" aria-label="Cumulative P&L line chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...axisProps} minTickGap={24} tickFormatter={dateLabel} />
          <YAxis {...axisProps} width={56} tickFormatter={axisMoney(symbol)} />
          <ReferenceLine y={0} stroke={MUTED} strokeDasharray="3 3" />
          <Tooltip
            {...tooltipStyle}
            formatter={(v) => [money(symbol)(Number(v)), 'Cumulative P&L']}
            labelFormatter={(l) => (dateLabel ? dateLabel(String(l)) : String(l))}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function cumulativeToPoints(series: CumulativePoint[]): { label: string; value: number }[] {
  return series.map((p) => ({ label: p.date, value: p.cumulativeCents }))
}

export function MonthlyBarChart({ points, symbol }: { points: YearMonthPoint[]; symbol: string }) {
  const data = points.map((p) => ({
    label: `${formatMonthName(Number(p.key.slice(5, 7)), 'MMM')} ${p.key.slice(2, 4)}`,
    value: p.pnlCents / 100,
  }))
  return (
    <div style={{ height: 240 }} role="img" aria-label="P&L by month bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} width={56} tickFormatter={axisMoney(symbol)} />
          <ReferenceLine y={0} stroke={MUTED} />
          <Tooltip {...tooltipStyle} formatter={(v) => [money(symbol)(Number(v)), 'Net P&L']} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value < 0 ? LOSS : WIN} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function WinRateBySetupChart({ groups }: { groups: GroupStat[] }) {
  const data = groups.slice(0, 10).map((g) => ({
    label: g.key,
    rate: g.winRate === null ? 0 : Math.round(g.winRate * 10) / 10,
    trades: g.trades,
    known: g.winRate !== null,
  }))
  return (
    <div style={{ height: Math.max(180, data.length * 38 + 30) }} role="img" aria-label="Win rate by setup bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} {...axisProps} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="label" {...axisProps} width={130} />
          <Tooltip
            {...tooltipStyle}
            formatter={(v, _n, item) => {
              const row = item.payload as (typeof data)[number]
              return [row.known ? `${v}% (${row.trades} trades)` : `— (${row.trades} trades)`, 'Win rate']
            }}
          />
          <Bar dataKey="rate" fill={WIN} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function InstrumentChart({ groups, symbol }: { groups: GroupStat[]; symbol: string }) {
  const data = groups.map((g) => ({ label: g.key, value: g.pnlCents / 100, trades: g.trades }))
  return (
    <div style={{ height: 220 }} role="img" aria-label="P&L by instrument bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} width={56} tickFormatter={axisMoney(symbol)} />
          <ReferenceLine y={0} stroke={MUTED} />
          <Tooltip
            {...tooltipStyle}
            formatter={(v, _n, item) => [
              `${money(symbol)(Number(v))} (${(item.payload as (typeof data)[number]).trades} trades)`,
              'Net P&L',
            ]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value < 0 ? LOSS : WIN} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
