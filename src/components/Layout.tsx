import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, ListOrdered, Menu, Settings, X } from 'lucide-react'
import { useUi } from '../providers'
import { useEscape } from '../hooks/useEscape'
import { parseMonthKey, monthKey } from '../lib/dates'
import { DayPanel } from './DayPanel'
import { TradeForm } from './TradeForm'

const NAV = [
  { to: '/', label: 'Calendar', icon: CalendarDays, end: true },
  { to: '/trades', label: 'Trades', icon: ListOrdered, end: false },
  { to: '/stats', label: 'Stats', icon: BarChart3, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
] as const

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          aria-label={label}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-ctl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'bg-nav-active text-accent-hover' : 'text-muted hover:bg-raised hover:text-fg'
            }`
          }
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { year, setYear } = useUi()
  const location = useLocation()
  const navigate = useNavigate()

  useEscape(() => setMenuOpen(false), menuOpen)
  useEffect(() => setMenuOpen(false), [location.pathname])

  const changeYear = (next: number) => {
    setYear(next)
    const match = /^\/month\/(\d{4}-\d{2})$/.exec(location.pathname)
    const parsed = match?.[1] ? parseMonthKey(match[1]) : null
    if (parsed) navigate(`/month/${monthKey(next, parsed.month)}`)
  }

  return (
    <div className="flex h-full bg-app">
      <aside className="hidden w-56 shrink-0 border-r border-line bg-sidebar lg:block">
        <div className="flex h-14 items-center gap-2 border-b border-line px-5 text-sm font-semibold">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
          Trade Journal
        </div>
        <NavItems />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => setMenuOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-line bg-sidebar animate-fade-in">
            <div className="flex h-14 items-center justify-between border-b border-line px-5">
              <span className="text-sm font-semibold">Trade Journal</span>
              <button type="button" aria-label="Close menu" className="text-muted hover:text-fg" onClick={() => setMenuOpen(false)}>
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <NavItems onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-sidebar px-4">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="rounded-ctl p-1.5 text-muted hover:bg-raised hover:text-fg lg:hidden"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <div className="text-sm font-semibold lg:hidden">Trade Journal</div>
          <div className="hidden text-sm font-semibold lg:block">Trading Journal</div>

          <div className="ml-auto flex items-center gap-1" role="group" aria-label="Year selector">
            <button
              type="button"
              aria-label="Previous year"
              className="rounded-ctl p-1.5 text-muted hover:bg-raised hover:text-fg"
              onClick={() => changeYear(year - 1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <span className="num min-w-[3.5rem] text-center text-sm font-semibold" aria-live="polite">
              {year}
            </span>
            <button
              type="button"
              aria-label="Next year"
              className="rounded-ctl p-1.5 text-muted hover:bg-raised hover:text-fg"
              onClick={() => changeYear(year + 1)}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>

      <DayPanel />
      <TradeForm />
    </div>
  )
}
