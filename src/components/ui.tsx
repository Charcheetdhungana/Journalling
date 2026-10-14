import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Star } from 'lucide-react'
import { formatMoney } from '../lib/money'
import type { Result } from '../lib/schemas'
import { useSettings } from '../hooks/queries'

export function useMoney(): (cents: number) => string {
  const { settings } = useSettings()
  return (cents) => formatMoney(cents, settings.currencySymbol)
}

export function pnlColorClass(cents: number): string {
  if (cents > 0) return 'text-win'
  if (cents < 0) return 'text-loss'
  return 'text-be'
}

export function Money({ cents, className = '' }: { cents: number; className?: string }) {
  const money = useMoney()
  return <span className={`num ${pnlColorClass(cents)} ${className}`}>{money(cents)}</span>
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover shadow-[0_0_18px_-6px_rgba(31,111,235,0.8)] disabled:opacity-60',
  secondary: 'border border-line bg-raised text-fg hover:border-muted disabled:opacity-60',
  danger: 'border border-loss/40 bg-raised text-loss hover:bg-loss hover:text-white disabled:opacity-60',
  ghost: 'text-muted hover:bg-raised hover:text-fg disabled:opacity-60',
}

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-ctl px-3.5 py-2 text-sm font-medium transition-colors ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-card border border-line bg-card ${className}`}>{children}</div>
}

export function StatTile({
  label,
  value,
  sub,
  className = '',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-card border border-line bg-raised px-4 py-3 ${className}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="num mt-1 text-lg font-semibold leading-tight">{value}</div>
      {sub && <div className="num mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

const RESULT_STYLE: Record<Result, string> = {
  Win: 'bg-[rgba(59,139,255,0.14)] text-win',
  Loss: 'bg-[rgba(240,82,82,0.14)] text-loss',
  Breakeven: 'bg-[rgba(139,149,167,0.16)] text-be',
}

export function ResultBadge({ result }: { result: Result }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${RESULT_STYLE[result]}`}>
      {result}
    </span>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse-soft rounded-ctl bg-raised ${className}`} />
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="text-sm font-medium text-fg">{title}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-card border border-loss/40 bg-card p-6 text-center">
      <div className="text-sm font-medium text-loss">Could not load data</div>
      <div className="mt-1 text-xs text-muted">{message}</div>
      {onRetry && (
        <Button className="mt-4" onClick={onRetry} aria-label="Retry loading data">
          Retry
        </Button>
      )}
    </div>
  )
}

export function Stars({
  value,
  onChange,
  size = 20,
}: {
  value: number | null
  onChange?: (value: number | null) => void
  size?: number
}) {
  return (
    <div className="flex items-center gap-1" role={onChange ? 'radiogroup' : 'img'} aria-label="Execution rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value !== null && n <= value
        const icon = (
          <Star
            width={size}
            height={size}
            aria-hidden
            className={filled ? 'fill-accent-hover text-accent-hover' : 'text-muted'}
          />
        )
        if (!onChange) return <span key={n}>{icon}</span>
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className="rounded p-0.5 hover:bg-raised"
            onClick={() => onChange(value === n ? null : n)}
          >
            {icon}
          </button>
        )
      })}
    </div>
  )
}
