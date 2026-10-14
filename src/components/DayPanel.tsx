import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2, X } from 'lucide-react'
import { formatLongDate, shiftDay } from '../lib/dates'
import { formatPercent } from '../lib/money'
import type { Trade } from '../lib/schemas'
import { useDayNotes, useDeleteTrade, useSaveTrade, useTrades } from '../hooks/queries'
import { useSaveDayNote } from '../hooks/queries'
import { useEscape } from '../hooks/useEscape'
import { useConfirm, useToast, useUi } from '../providers'
import { useStats } from './StatsPanel'
import { Button, EmptyState, Money, ResultBadge, Skeleton, StatTile } from './ui'

export function DayPanel() {
  const { dayPanelDate, closeDayPanel } = useUi()
  if (!dayPanelDate) return null
  return <DayPanelContent key={dayPanelDate} date={dayPanelDate} onClose={closeDayPanel} />
}

function DayPanelContent({ date, onClose }: { date: string; onClose: () => void }) {
  const { openDayPanel, openTradeForm, tradeForm } = useUi()
  const confirm = useConfirm()
  const toast = useToast()
  const range = useMemo(() => ({ from: date, to: date }), [date])
  const { data, isLoading } = useTrades(range)
  const notesQuery = useDayNotes(range)
  const saveTrade = useSaveTrade()
  const deleteTrade = useDeleteTrade()
  const saveNote = useSaveDayNote()
  const trades = useMemo<Trade[]>(() => data ?? [], [data])
  const stats = useStats(trades)
  const panelRef = useRef<HTMLDivElement>(null)

  // Esc closes the panel, unless a dialog or the trade form is stacked above it.
  useEscape(onClose, tradeForm === null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => previous?.focus?.()
  }, [])

  const serverNote = notesQuery.data?.find((n) => n.date === date)?.text ?? ''
  const [note, setNote] = useState('')
  const [noteLoaded, setNoteLoaded] = useState(false)
  const lastSaved = useRef('')

  useEffect(() => {
    if (!noteLoaded && notesQuery.isSuccess) {
      setNote(serverNote)
      lastSaved.current = serverNote
      setNoteLoaded(true)
    }
  }, [noteLoaded, notesQuery.isSuccess, serverNote])

  const persistNote = (text: string) => {
    if (!noteLoaded || text === lastSaved.current) return
    lastSaved.current = text
    saveNote.mutate({ date, text })
  }

  // Debounced autosave while typing, plus save on blur and on close.
  const noteRef = useRef(note)
  noteRef.current = note
  const persistRef = useRef(persistNote)
  persistRef.current = persistNote
  useEffect(() => {
    if (!noteLoaded) return undefined
    const timer = window.setTimeout(() => persistRef.current(note), 900)
    return () => window.clearTimeout(timer)
  }, [note, noteLoaded])
  useEffect(() => () => persistRef.current(noteRef.current), [])

  const duplicate = (trade: Trade) => {
    const now = new Date().toISOString()
    const copy: Trade = {
      ...trade,
      id: crypto.randomUUID(),
      // A copy never shares the screenshot: deleting one trade would delete the image of the other.
      screenshotKey: null,
      createdAt: now,
      updatedAt: now,
    }
    saveTrade.mutate({ trade: copy, isNew: true }, { onSuccess: () => toast.success('Trade duplicated') })
  }

  const remove = async (trade: Trade) => {
    const ok = await confirm({
      title: 'Delete trade?',
      message: `${trade.ticker} ${trade.instrument} (${trade.result}) will be permanently deleted${
        trade.screenshotKey ? ', along with its screenshot' : ''
      }.`,
      confirmLabel: 'Delete trade',
      danger: true,
    })
    if (ok) deleteTrade.mutate(trade.id, { onSuccess: () => toast.success('Trade deleted') })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Day panel for ${formatLongDate(date)}`}
        className="relative flex h-full w-full flex-col border-l border-line bg-card outline-none animate-slide-in sm:w-[540px]"
      >
        <header className="border-b border-line p-4">
          <div className="flex items-center gap-1">
            <Button variant="ghost" aria-label="Previous day" className="!px-2" onClick={() => openDayPanel(shiftDay(date, -1))}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <h2 className="min-w-0 flex-1 text-center text-base font-semibold">{formatLongDate(date)}</h2>
            <Button variant="ghost" aria-label="Next day" className="!px-2" onClick={() => openDayPanel(shiftDay(date, 1))}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="ghost" aria-label="Close day panel" className="!px-2" onClick={onClose}>
              <X className="h-5 w-5" aria-hidden />
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatTile
              label="Net P&L"
              value={<Money cents={stats.netPnlCents} />}
              className="col-span-2 sm:col-span-1"
            />
            <StatTile label="Trades" value={stats.totalTrades} />
            <StatTile label="Win rate" value={formatPercent(stats.winRate, 0)} />
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <div>
            <label htmlFor="day-notes" className="label">
              Day notes
            </label>
            <textarea
              id="day-notes"
              rows={4}
              className="field resize-y"
              placeholder="Market conditions, mood, plan..."
              value={note}
              disabled={!noteLoaded}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => persistNote(note)}
              maxLength={10000}
            />
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Trades</h3>
              <Button
                variant="primary"
                aria-label="Add trade"
                onClick={() => openTradeForm({ mode: 'new', date })}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add trade
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-[72px]" />
                <Skeleton className="h-[72px]" />
              </div>
            ) : trades.length === 0 ? (
              <div className="rounded-card border border-dashed border-line">
                <EmptyState title="No trades logged" hint="Use “Add trade” to log one for this day." />
              </div>
            ) : (
              <ul className="space-y-2">
                {trades.map((trade) => (
                  <li key={trade.id} className="rounded-card border border-line bg-raised">
                    <button
                      type="button"
                      aria-label={`Edit ${trade.ticker} ${trade.instrument} trade`}
                      className="flex w-full items-center gap-3 p-3 text-left"
                      onClick={() => openTradeForm({ mode: 'edit', trade })}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{trade.ticker}</span>
                          <span className="text-xs text-muted">
                            {trade.instrument} · {trade.direction}
                          </span>
                        </div>
                        <div className="mt-1">
                          <ResultBadge result={trade.result} />
                        </div>
                      </div>
                      <Money cents={trade.pnlCents} className="text-base font-semibold" />
                    </button>
                    <div className="flex justify-end gap-1 border-t border-line px-2 py-1.5">
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1 text-xs"
                        aria-label={`Edit ${trade.ticker} trade`}
                        onClick={() => openTradeForm({ mode: 'edit', trade })}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1 text-xs"
                        aria-label={`Duplicate ${trade.ticker} trade`}
                        onClick={() => duplicate(trade)}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        Duplicate
                      </Button>
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1 text-xs hover:!text-loss"
                        aria-label={`Delete ${trade.ticker} trade`}
                        onClick={() => void remove(trade)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
