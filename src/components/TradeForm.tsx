import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Calculator, ImagePlus, Loader2, Trash2, X } from 'lucide-react'
import { api, screenshotUrl } from '../api'
import { calculatePnlCents, suggestResult } from '../lib/calc'
import { isValidISODate, todayISO } from '../lib/dates'
import { centsToInput, parseDollarInput } from '../lib/money'
import {
  DEFAULT_TAGS,
  DIRECTIONS,
  INSTRUMENTS,
  RESULTS,
  type Direction,
  type Instrument,
  type Result,
  type Trade,
} from '../lib/schemas'
import { useSaveTrade, useSuggestions } from '../hooks/queries'
import { useEscape } from '../hooks/useEscape'
import { useConfirm, useToast, useUi, type TradeFormTarget } from '../providers'
import { compressImage } from './imageCompress'
import { Button, Stars } from './ui'

interface FormState {
  date: string
  ticker: string
  instrument: Instrument
  direction: Direction
  strike: string
  expiration: string
  contracts: string
  shares: string
  entryPrice: string
  exitPrice: string
  entryTime: string
  exitTime: string
  fees: string
  pnl: string
  result: Result | null
  setup: string
  tags: string[]
  whyTaken: string
  wentWell: string
  wentWrong: string
  lesson: string
  rating: number | null
  screenshotKey: string | null
}

type Errors = Partial<Record<keyof FormState | 'auto', string>>

function initialState(target: TradeFormTarget): FormState {
  const source = target.mode === 'edit' ? target.trade : target.template
  if (source) {
    return {
      date: target.mode === 'edit' ? target.trade.date : target.date,
      ticker: source.ticker,
      instrument: source.instrument,
      direction: source.direction,
      strike: centsToInput(source.strikeCents),
      expiration: source.expiration ?? '',
      contracts: source.contracts === null ? '' : String(source.contracts),
      shares: source.shares === null ? '' : String(source.shares),
      entryPrice: centsToInput(source.entryPriceCents),
      exitPrice: centsToInput(source.exitPriceCents),
      entryTime: source.entryTime ?? '',
      exitTime: source.exitTime ?? '',
      fees: centsToInput(source.feesCents),
      pnl: centsToInput(source.pnlCents),
      result: source.result,
      setup: source.setup,
      tags: source.tags,
      whyTaken: source.whyTaken,
      wentWell: source.wentWell,
      wentWrong: source.wentWrong,
      lesson: source.lesson,
      rating: source.rating,
      screenshotKey: source.screenshotKey,
    }
  }
  return {
    date: target.mode === 'new' ? target.date : todayISO(),
    ticker: '',
    instrument: 'Stock',
    direction: 'Long',
    strike: '',
    expiration: '',
    contracts: '',
    shares: '',
    entryPrice: '',
    exitPrice: '',
    entryTime: '',
    exitTime: '',
    fees: '',
    pnl: '',
    result: null,
    setup: '',
    tags: [],
    whyTaken: '',
    wentWell: '',
    wentWrong: '',
    lesson: '',
    rating: null,
    screenshotKey: null,
  }
}

function parseInteger(raw: string): number | null {
  const t = raw.trim()
  if (!/^\d+$/.test(t)) return null
  return Number(t)
}

export function TradeForm() {
  const { tradeForm } = useUi()
  if (!tradeForm) return null
  const key = tradeForm.mode === 'edit' ? tradeForm.trade.id : `new-${tradeForm.date}`
  return <TradeFormContent key={key} target={tradeForm} />
}

function Field({
  label,
  htmlFor,
  error,
  required,
  children,
  className = '',
}: {
  label: string
  htmlFor: string
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="label">
        {label}
        {required && <span className="text-loss"> *</span>}
      </label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1 text-xs text-loss">
          {error}
        </p>
      )}
    </div>
  )
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-ctl border border-line bg-raised p-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          aria-label={`${label}: ${o}`}
          onClick={() => onChange(o)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o ? 'bg-accent text-white' : 'text-muted hover:text-fg'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

const RESULT_ACTIVE: Record<Result, string> = {
  Win: 'border-win bg-[rgba(59,139,255,0.16)] text-win',
  Loss: 'border-loss bg-[rgba(240,82,82,0.16)] text-loss',
  Breakeven: 'border-be bg-[rgba(139,149,167,0.18)] text-fg',
}

function TradeFormContent({ target }: { target: TradeFormTarget }) {
  const { closeTradeForm } = useUi()
  const isEdit = target.mode === 'edit'
  const [form, setForm] = useState<FormState>(() => initialState(target))
  const [errors, setErrors] = useState<Errors>({})
  const [resultTouched, setResultTouched] = useState(isEdit)
  const [newTag, setNewTag] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadedKeys = useRef<Set<string>>(new Set())
  const savedRef = useRef(false)
  const saveTrade = useSaveTrade()
  const suggestions = useSuggestions()
  const confirm = useConfirm()
  const toast = useToast()

  const originalKey = target.mode === 'edit' ? target.trade.screenshotKey : null
  const isOption = form.instrument !== 'Stock'

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialState(target)),
    [form, target],
  )

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e))
  }

  const cleanupUploads = () => {
    if (savedRef.current) return
    for (const key of uploadedKeys.current) void api.deleteScreenshot(key).catch(() => undefined)
  }

  const cancel = async () => {
    if (saving) return
    if (dirty) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes to this trade.',
        confirmLabel: 'Discard',
        danger: true,
      })
      if (!ok) return
    }
    cleanupUploads()
    closeTradeForm()
  }

  useEscape(() => void cancel())

  const setPnl = (value: string) => {
    setForm((f) => {
      const cents = parseDollarInput(value)
      const result = !resultTouched && cents !== null ? suggestResult(cents) : f.result
      return { ...f, pnl: value, result }
    })
    setErrors((e) => ({ ...e, pnl: undefined, result: undefined }))
  }

  const autoCalculate = () => {
    const entry = parseDollarInput(form.entryPrice)
    const exit = parseDollarInput(form.exitPrice)
    const quantity = parseInteger(isOption ? form.contracts : form.shares)
    const fees = form.fees.trim() === '' ? 0 : parseDollarInput(form.fees)
    const missing: string[] = []
    if (entry === null) missing.push('entry price')
    if (exit === null) missing.push('exit price')
    if (quantity === null) missing.push(isOption ? 'number of contracts' : 'number of shares')
    if (fees === null) missing.push('valid fees')
    if (entry === null || exit === null || quantity === null || fees === null) {
      setErrors((e) => ({ ...e, auto: `Enter ${missing.join(', ')} to auto-calculate.` }))
      return
    }
    const pnl = calculatePnlCents({
      instrument: form.instrument,
      direction: form.direction,
      entryPriceCents: entry,
      exitPriceCents: exit,
      quantity,
      feesCents: fees,
    })
    setErrors((e) => ({ ...e, auto: undefined }))
    setPnl(centsToInput(pnl))
  }

  const pickResult = (result: Result) => {
    setResultTouched(true)
    set('result', result)
  }

  const toggleTag = (tag: string) =>
    set('tags', form.tags.includes(tag) ? form.tags.filter((t) => t !== tag) : [...form.tags, tag])

  const addNewTag = () => {
    const tag = newTag.trim()
    if (!tag) return
    if (!form.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) set('tags', [...form.tags, tag])
    setNewTag('')
  }

  const allTags = useMemo(() => {
    const seen = new Map<string, string>()
    for (const t of [...DEFAULT_TAGS, ...(suggestions.data?.tags ?? []), ...form.tags]) {
      if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t)
    }
    return [...seen.values()]
  }, [suggestions.data, form.tags])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const blob = await compressImage(file)
      const { key } = await api.uploadScreenshot(blob)
      uploadedKeys.current.add(key)
      // Replacing a screenshot added in this session: drop the previous upload immediately.
      if (form.screenshotKey && uploadedKeys.current.has(form.screenshotKey)) {
        uploadedKeys.current.delete(form.screenshotKey)
        void api.deleteScreenshot(form.screenshotKey).catch(() => undefined)
      }
      set('screenshotKey', key)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Screenshot upload failed')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const removeScreenshot = () => {
    const key = form.screenshotKey
    if (key && uploadedKeys.current.has(key)) {
      uploadedKeys.current.delete(key)
      void api.deleteScreenshot(key).catch(() => undefined)
    }
    // An existing screenshot is removed on save, so cancelling restores it.
    set('screenshotKey', null)
  }

  const validate = (): { errors: Errors; trade: Trade | null } => {
    const e: Errors = {}
    const ticker = form.ticker.trim().toUpperCase()
    if (!ticker) e.ticker = 'Ticker is required'
    else if (!/^[A-Z0-9.\-^/]{1,12}$/.test(ticker)) e.ticker = 'Use letters and numbers only (max 12 characters)'
    if (!isValidISODate(form.date)) e.date = 'Choose a valid date'

    const pnl = parseDollarInput(form.pnl)
    if (form.pnl.trim() === '') e.pnl = 'Net P&L is required'
    else if (pnl === null) e.pnl = 'Enter a number, for example -55.32'

    if (!form.result) e.result = 'Choose Win, Loss or Breakeven'

    const optionalMoney = (raw: string, field: keyof FormState, label: string): number | null => {
      if (raw.trim() === '') return null
      const v = parseDollarInput(raw)
      if (v === null || v < 0) e[field] = `${label} must be a positive number`
      return v
    }
    const strike = isOption ? optionalMoney(form.strike, 'strike', 'Strike') : null
    const entryPrice = optionalMoney(form.entryPrice, 'entryPrice', 'Entry price')
    const exitPrice = optionalMoney(form.exitPrice, 'exitPrice', 'Exit price')

    let fees = 0
    if (form.fees.trim() !== '') {
      const v = parseDollarInput(form.fees)
      if (v === null || v < 0) e.fees = 'Fees must be 0 or more'
      else fees = v
    }

    const optionalInt = (raw: string, field: keyof FormState, label: string): number | null => {
      if (raw.trim() === '') return null
      const v = parseInteger(raw)
      if (v === null) e[field] = `${label} must be a whole number`
      return v
    }
    const contracts = isOption ? optionalInt(form.contracts, 'contracts', 'Contracts') : null
    const shares = isOption ? null : optionalInt(form.shares, 'shares', 'Shares')

    if (isOption && form.expiration && !isValidISODate(form.expiration)) e.expiration = 'Choose a valid date'

    if (Object.values(e).some(Boolean) || pnl === null || !form.result) return { errors: e, trade: null }

    const now = new Date().toISOString()
    const existing = target.mode === 'edit' ? target.trade : null
    const trade: Trade = {
      id: existing?.id ?? crypto.randomUUID(),
      date: form.date,
      ticker,
      instrument: form.instrument,
      direction: form.direction,
      strikeCents: strike,
      expiration: isOption && form.expiration ? form.expiration : null,
      contracts,
      shares,
      entryPriceCents: entryPrice,
      exitPriceCents: exitPrice,
      entryTime: form.entryTime || null,
      exitTime: form.exitTime || null,
      feesCents: fees,
      pnlCents: pnl,
      result: form.result,
      setup: form.setup.trim(),
      tags: form.tags,
      whyTaken: form.whyTaken,
      wentWell: form.wentWell,
      wentWrong: form.wentWrong,
      lesson: form.lesson,
      rating: form.rating,
      screenshotKey: form.screenshotKey,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    return { errors: e, trade }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving || uploading) return
    const { errors: found, trade } = validate()
    setErrors(found)
    if (!trade) {
      const first = Object.keys(found)[0]
      if (first) document.getElementById(`tf-${first}`)?.focus()
      return
    }
    setSaving(true)
    try {
      await saveTrade.mutateAsync({ trade, isNew: !isEdit })
      savedRef.current = true
      // Anything uploaded this session but no longer attached is an orphan.
      for (const key of uploadedKeys.current) {
        if (key !== trade.screenshotKey) void api.deleteScreenshot(key).catch(() => undefined)
      }
      toast.success(isEdit ? 'Trade updated' : 'Trade saved')
      closeTradeForm()
    } catch {
      // The mutation hook already showed an error toast and rolled the UI back; keep the form open.
      setSaving(false)
    }
  }

  // Lock background scroll while the form is open.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const inputClass = (field: keyof FormState) => `field ${errors[field] ? 'field-error' : ''}`
  const describe = (field: keyof FormState) => (errors[field] ? `tf-${field}-error` : undefined)

  const hadOriginalScreenshotRemoved = originalKey !== null && form.screenshotKey === null

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/70 sm:items-center sm:p-6 animate-fade-in">
      <form
        noValidate
        onSubmit={(e) => void submit(e)}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit trade' : 'Add trade'}
        className="flex h-full w-full max-w-3xl flex-col bg-card sm:h-auto sm:max-h-full sm:rounded-card sm:border sm:border-line"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">{isEdit ? 'Edit trade' : 'Add trade'}</h2>
          <Button variant="ghost" aria-label="Close trade form" className="!px-2" onClick={() => void cancel()}>
            <X className="h-5 w-5" aria-hidden />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Core */}
          <section className="grid gap-4 sm:grid-cols-3">
            <Field label="Ticker" htmlFor="tf-ticker" error={errors.ticker} required>
              <input
                id="tf-ticker"
                className={`${inputClass('ticker')} uppercase`}
                value={form.ticker}
                autoFocus
                autoComplete="off"
                maxLength={12}
                placeholder="AAPL"
                aria-invalid={Boolean(errors.ticker)}
                aria-describedby={describe('ticker')}
                onChange={(e) => set('ticker', e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Date" htmlFor="tf-date" error={errors.date} required>
              <input
                id="tf-date"
                type="date"
                className={inputClass('date')}
                value={form.date}
                max="9999-12-31"
                aria-invalid={Boolean(errors.date)}
                aria-describedby={describe('date')}
                onChange={(e) => set('date', e.target.value || todayISO())}
              />
            </Field>
            <div>
              <span className="label">
                Instrument <span className="text-loss">*</span>
              </span>
              <Segmented label="Instrument" options={INSTRUMENTS} value={form.instrument} onChange={(v) => set('instrument', v)} />
            </div>
            <div className="sm:col-span-3">
              <span className="label">
                Direction{' '}
                {isOption && (
                  <span className="font-normal">(Long = bought to open, Short = sold to open)</span>
                )}
              </span>
              <div className="max-w-xs">
                <Segmented label="Direction" options={DIRECTIONS} value={form.direction} onChange={(v) => set('direction', v)} />
              </div>
            </div>
          </section>

          {/* Position */}
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {isOption ? (
              <>
                <Field label="Strike price" htmlFor="tf-strike" error={errors.strike}>
                  <input
                    id="tf-strike"
                    inputMode="decimal"
                    className={`${inputClass('strike')} num`}
                    value={form.strike}
                    placeholder="150.00"
                    onChange={(e) => set('strike', e.target.value)}
                  />
                </Field>
                <Field label="Expiration" htmlFor="tf-expiration" error={errors.expiration}>
                  <input
                    id="tf-expiration"
                    type="date"
                    className={inputClass('expiration')}
                    value={form.expiration}
                    onChange={(e) => set('expiration', e.target.value)}
                  />
                </Field>
                <Field label="Contracts" htmlFor="tf-contracts" error={errors.contracts}>
                  <input
                    id="tf-contracts"
                    inputMode="numeric"
                    className={`${inputClass('contracts')} num`}
                    value={form.contracts}
                    placeholder="1"
                    onChange={(e) => set('contracts', e.target.value)}
                  />
                </Field>
              </>
            ) : (
              <Field label="Shares" htmlFor="tf-shares" error={errors.shares}>
                <input
                  id="tf-shares"
                  inputMode="numeric"
                  className={`${inputClass('shares')} num`}
                  value={form.shares}
                  placeholder="100"
                  onChange={(e) => set('shares', e.target.value)}
                />
              </Field>
            )}
            <Field label="Entry price" htmlFor="tf-entryPrice" error={errors.entryPrice}>
              <input
                id="tf-entryPrice"
                inputMode="decimal"
                className={`${inputClass('entryPrice')} num`}
                value={form.entryPrice}
                placeholder="0.00"
                onChange={(e) => set('entryPrice', e.target.value)}
              />
            </Field>
            <Field label="Exit price" htmlFor="tf-exitPrice" error={errors.exitPrice}>
              <input
                id="tf-exitPrice"
                inputMode="decimal"
                className={`${inputClass('exitPrice')} num`}
                value={form.exitPrice}
                placeholder="0.00"
                onChange={(e) => set('exitPrice', e.target.value)}
              />
            </Field>
            <Field label="Entry time" htmlFor="tf-entryTime">
              <input
                id="tf-entryTime"
                type="time"
                className="field"
                value={form.entryTime}
                onChange={(e) => set('entryTime', e.target.value)}
              />
            </Field>
            <Field label="Exit time" htmlFor="tf-exitTime">
              <input
                id="tf-exitTime"
                type="time"
                className="field"
                value={form.exitTime}
                onChange={(e) => set('exitTime', e.target.value)}
              />
            </Field>
            <Field label="Fees / commissions" htmlFor="tf-fees" error={errors.fees}>
              <input
                id="tf-fees"
                inputMode="decimal"
                className={`${inputClass('fees')} num`}
                value={form.fees}
                placeholder="0.00"
                onChange={(e) => set('fees', e.target.value)}
              />
            </Field>
          </section>

          {/* P&L and result */}
          <section className="space-y-4 rounded-card border border-line bg-raised/40 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Net P&L ($, after fees)" htmlFor="tf-pnl" error={errors.pnl} required className="min-w-[10rem] flex-1">
                <input
                  id="tf-pnl"
                  inputMode="decimal"
                  className={`${inputClass('pnl')} num`}
                  value={form.pnl}
                  placeholder="-55.32"
                  aria-invalid={Boolean(errors.pnl)}
                  aria-describedby={describe('pnl')}
                  onChange={(e) => setPnl(e.target.value)}
                />
              </Field>
              <Button aria-label="Auto-calculate net P&L" onClick={autoCalculate} className="mb-px">
                <Calculator className="h-4 w-4" aria-hidden />
                Auto-calculate
              </Button>
            </div>
            {errors.auto && (
              <p role="alert" className="text-xs text-loss">
                {errors.auto}
              </p>
            )}
            <p className="text-xs text-muted">
              (Exit − Entry) × {isOption ? 'contracts × 100' : 'shares'}, reversed for Short, minus fees. You can
              always type your own number.
            </p>

            <div>
              <span className="label">
                Result <span className="text-loss">*</span>
              </span>
              <div role="radiogroup" aria-label="Result" className="grid grid-cols-3 gap-2">
                {RESULTS.map((r) => (
                  <button
                    key={r}
                    id={r === 'Win' ? 'tf-result' : undefined}
                    type="button"
                    role="radio"
                    aria-checked={form.result === r}
                    aria-label={`Result: ${r}`}
                    onClick={() => pickResult(r)}
                    className={`rounded-ctl border px-3 py-3 text-sm font-semibold transition-colors ${
                      form.result === r ? RESULT_ACTIVE[r] : 'border-line bg-raised text-muted hover:border-muted'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {errors.result && (
                <p role="alert" className="mt-1 text-xs text-loss">
                  {errors.result}
                </p>
              )}
            </div>
          </section>

          {/* Setup and tags */}
          <section className="space-y-4">
            <Field label="Setup / strategy" htmlFor="tf-setup">
              <input
                id="tf-setup"
                className="field"
                list="tf-setup-options"
                value={form.setup}
                maxLength={100}
                placeholder="Opening range breakout"
                autoComplete="off"
                onChange={(e) => set('setup', e.target.value)}
              />
              <datalist id="tf-setup-options">
                {(suggestions.data?.setups ?? []).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>

            <div>
              <span className="label">Tags</span>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => {
                  const on = form.tags.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={on}
                      aria-label={`Tag: ${tag}`}
                      onClick={() => toggleTag(tag)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        on
                          ? 'border-accent bg-nav-active text-accent-hover'
                          : 'border-line bg-raised text-muted hover:border-muted hover:text-fg'
                      }`}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 flex max-w-sm gap-2">
                <input
                  className="field"
                  aria-label="New tag name"
                  placeholder="Create a new tag"
                  value={newTag}
                  maxLength={40}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addNewTag()
                    }
                  }}
                />
                <Button aria-label="Add tag" onClick={addNewTag}>
                  Add
                </Button>
              </div>
            </div>
          </section>

          {/* Journal */}
          <section className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['whyTaken', 'Why I took it'],
                ['wentWell', 'What went well'],
                ['wentWrong', 'What went wrong'],
                ['lesson', 'Lesson'],
              ] as const
            ).map(([field, label]) => (
              <Field key={field} label={label} htmlFor={`tf-${field}`}>
                <textarea
                  id={`tf-${field}`}
                  rows={3}
                  className="field resize-y"
                  maxLength={5000}
                  value={form[field]}
                  onChange={(e) => set(field, e.target.value)}
                />
              </Field>
            ))}
          </section>

          <section className="grid gap-5 sm:grid-cols-2">
            <div>
              <span className="label">Rating of execution</span>
              <Stars value={form.rating} onChange={(v) => set('rating', v)} />
            </div>
            <div>
              <span className="label">Screenshot</span>
              {form.screenshotKey ? (
                <div className="flex items-start gap-3">
                  <a href={screenshotUrl(form.screenshotKey)} target="_blank" rel="noreferrer" aria-label="Open screenshot full size">
                    <img
                      src={screenshotUrl(form.screenshotKey)}
                      alt="Trade screenshot"
                      className="h-24 w-36 rounded-ctl border border-line object-cover"
                    />
                  </a>
                  <Button aria-label="Remove screenshot" onClick={removeScreenshot}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Remove
                  </Button>
                </div>
              ) : (
                <div>
                  <Button aria-label="Upload screenshot" disabled={uploading} onClick={() => fileInput.current?.click()}>
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <ImagePlus className="h-4 w-4" aria-hidden />
                    )}
                    {uploading ? 'Uploading…' : 'Add image'}
                  </Button>
                  {hadOriginalScreenshotRemoved && (
                    <p className="mt-2 text-xs text-muted">The current screenshot will be deleted when you save.</p>
                  )}
                </div>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Screenshot file"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <p className="mt-2 text-xs text-muted">Resized to 1600px wide and compressed before upload.</p>
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <p className="text-xs text-muted">
            <span className="text-loss">*</span> Required
          </p>
          <div className="flex gap-2">
            <Button aria-label="Cancel" onClick={() => void cancel()}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" aria-label="Save trade" disabled={saving || uploading}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {saving ? 'Saving…' : 'Save trade'}
            </Button>
          </div>
        </footer>
      </form>
    </div>
  )
}
