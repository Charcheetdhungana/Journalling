import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertTriangle, CheckCircle2, X, XCircle } from 'lucide-react'
import { useEscape } from './hooks/useEscape'
import type { Trade } from './lib/schemas'
import { todayISO } from './lib/dates'

// ------------------------------------------------------------------ toasts

interface ToastItem {
  id: number
  kind: 'success' | 'error'
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (kind: ToastItem['kind'], message: string) => {
      const id = nextId.current
      nextId.current += 1
      setItems((list) => [...list.slice(-3), { id, kind, message }])
      window.setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3500)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m) }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex items-start gap-3 rounded-card border border-line bg-raised px-4 py-3 text-sm shadow-lg animate-fade-in"
          >
            {t.kind === 'error' ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-loss" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-win" aria-hidden />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              className="text-muted hover:text-fg"
              onClick={() => dismiss(t.id)}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

// ------------------------------------------------------------------ confirm dialog

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    [],
  )

  const close = (value: boolean) => {
    pending?.resolve(value)
    setPending(null)
  }

  useEscape(() => close(false), pending !== null)

  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (pending) confirmRef.current?.focus()
  }, [pending])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 animate-fade-in"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close(false)
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            className="w-full max-w-sm rounded-card border border-line bg-card p-5"
          >
            <div className="flex items-start gap-3">
              {pending.options.danger && <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-loss" aria-hidden />}
              <div>
                <h2 id="confirm-title" className="text-base font-semibold">
                  {pending.options.title}
                </h2>
                <p id="confirm-message" className="mt-1.5 text-sm text-muted">
                  {pending.options.message}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                aria-label="Cancel"
                className="rounded-ctl border border-line bg-raised px-4 py-2 text-sm hover:border-muted"
                onClick={() => close(false)}
              >
                Cancel
              </button>
              <button
                ref={confirmRef}
                type="button"
                aria-label={pending.options.confirmLabel ?? 'Confirm'}
                className={`rounded-ctl px-4 py-2 text-sm font-medium text-white ${
                  pending.options.danger ? 'bg-loss hover:bg-red-400' : 'bg-accent hover:bg-accent-hover'
                }`}
                onClick={() => close(true)}
              >
                {pending.options.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx
}

// ------------------------------------------------------------------ UI state (year, day panel, trade form)

export type TradeFormTarget = { mode: 'new'; date: string; template?: Trade } | { mode: 'edit'; trade: Trade }

interface UiState {
  year: number
  setYear: (year: number) => void
  dayPanelDate: string | null
  openDayPanel: (date: string) => void
  closeDayPanel: () => void
  tradeForm: TradeFormTarget | null
  openTradeForm: (target: TradeFormTarget) => void
  closeTradeForm: () => void
}

const UiContext = createContext<UiState | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [year, setYear] = useState(() => Number(todayISO().slice(0, 4)))
  const [dayPanelDate, setDayPanelDate] = useState<string | null>(null)
  const [tradeForm, setTradeForm] = useState<TradeFormTarget | null>(null)

  const value = useMemo<UiState>(
    () => ({
      year,
      setYear,
      dayPanelDate,
      openDayPanel: setDayPanelDate,
      closeDayPanel: () => setDayPanelDate(null),
      tradeForm,
      openTradeForm: setTradeForm,
      closeTradeForm: () => setTradeForm(null),
    }),
    [year, dayPanelDate, tradeForm],
  )

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>
}

export function useUi(): UiState {
  const ctx = useContext(UiContext)
  if (!ctx) throw new Error('useUi must be used inside UiProvider')
  return ctx
}
