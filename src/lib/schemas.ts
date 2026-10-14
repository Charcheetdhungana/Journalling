import { z } from 'zod'
import { isValidISODate, isValidTime } from './dates'

export const INSTRUMENTS = ['Stock', 'Call', 'Put'] as const
export const DIRECTIONS = ['Long', 'Short'] as const
export const RESULTS = ['Win', 'Loss', 'Breakeven'] as const

export type Instrument = (typeof INSTRUMENTS)[number]
export type Direction = (typeof DIRECTIONS)[number]
export type Result = (typeof RESULTS)[number]

export const isoDate = z.string().refine(isValidISODate, 'Must be a valid date in YYYY-MM-DD format')
const timeString = z.string().refine(isValidTime, 'Must be a time in HH:mm format')
const cents = z.number().int().min(-10_000_000_000).max(10_000_000_000)
const longText = z.string().max(5000)

/** Trade fields the client sends (money in integer cents). */
export const tradeInputSchema = z.object({
  id: z.uuid().optional(),
  date: isoDate,
  ticker: z
    .string()
    .trim()
    .min(1, 'Ticker is required')
    .max(12)
    .transform((s) => s.toUpperCase()),
  instrument: z.enum(INSTRUMENTS),
  direction: z.enum(DIRECTIONS),
  strikeCents: cents.nullable(),
  expiration: isoDate.nullable(),
  contracts: z.number().int().min(0).max(1_000_000).nullable(),
  shares: z.number().int().min(0).max(1_000_000_000).nullable(),
  entryPriceCents: cents.nullable(),
  exitPriceCents: cents.nullable(),
  entryTime: timeString.nullable(),
  exitTime: timeString.nullable(),
  feesCents: cents.min(0),
  pnlCents: cents,
  result: z.enum(RESULTS),
  setup: z.string().trim().max(100),
  tags: z.array(z.string().trim().min(1).max(40)).max(30),
  whyTaken: longText,
  wentWell: longText,
  wentWrong: longText,
  lesson: longText,
  rating: z.number().int().min(1).max(5).nullable(),
  screenshotKey: z
    .string()
    .regex(/^screenshots\/[0-9a-f-]{36}\.(webp|jpg|png)$/, 'Invalid screenshot key')
    .nullable(),
})

export type TradeInput = z.infer<typeof tradeInputSchema>

export const tradeSchema = tradeInputSchema.extend({
  id: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Trade = z.infer<typeof tradeSchema>

export const dayNoteSchema = z.object({
  date: isoDate,
  text: z.string().max(10_000),
  updatedAt: z.string(),
})

export type DayNote = z.infer<typeof dayNoteSchema>

export const dayNoteInputSchema = z.object({ text: z.string().max(10_000) })

export const settingsSchema = z.object({
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  currencySymbol: z.string().trim().min(1).max(3),
})

export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Settings = { weekStartsOn: 1, currencySymbol: '$' }

export const dateRangeQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
})

export const bulkTradesSchema = z.object({
  trades: z.array(tradeInputSchema).min(1).max(1000),
})

export const BACKUP_VERSION = 1

export const backupSchema = z.object({
  app: z.literal('trade-journal'),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  trades: z.array(tradeSchema).max(50_000),
  dayNotes: z.array(dayNoteSchema).max(50_000),
  settings: settingsSchema,
  /** Optional embedded screenshots: R2 key -> data URL. */
  screenshots: z.record(z.string(), z.string()).optional(),
})

export type Backup = z.infer<typeof backupSchema>

export const DEFAULT_TAGS = ['followed plan', 'FOMO', 'revenge trade', 'early exit', 'oversized', 'chased entry']
