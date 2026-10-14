import { Hono } from 'hono'
import type { ZodType } from 'zod'
import { requireAccess } from './auth'
import { upgradeBackup } from '../src/lib/backup'
import { tradesToCsv } from './csv'
import {
  TRADE_COLUMNS,
  deleteOrphanScreenshots,
  deleteScreenshotIfUnreferenced,
  insertTradeStatement,
  newTrade,
  rowToTrade,
  updateTradeStatement,
  type TradeRow,
} from './db'
import type { AppEnv } from './env'
import {
  BACKUP_VERSION,
  DEFAULT_SETTINGS,
  backupSchema,
  bulkTradesSchema,
  dateRangeQuerySchema,
  dayNoteInputSchema,
  isoDate,
  settingsSchema,
  tradeInputSchema,
  type Backup,
  type DayNote,
  type Settings,
  type Trade,
} from '../src/lib/schemas'
import { z } from 'zod'

class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409 | 413 | 415 | 500,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new HttpError(
      400,
      'Validation failed',
      result.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })),
    )
  }
  return result.data
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON')
  }
}

const app = new Hono<AppEnv>()

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message, details: err.details }, err.status)
  }
  console.error('Unhandled error', err)
  return c.json({ error: 'Internal server error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

app.use('/api/*', requireAccess)

// Cross-site form posts cannot send these content types, which blocks CSRF on cookie-based sessions.
app.use('/api/*', async (c, next) => {
  const method = c.req.method
  if (method === 'POST' || method === 'PUT') {
    const type = c.req.header('Content-Type') ?? ''
    const isUpload = new URL(c.req.url).pathname === '/api/screenshots'
    if (!isUpload && !type.toLowerCase().startsWith('application/json')) {
      throw new HttpError(415, 'Content-Type must be application/json')
    }
  }
  await next()
})

app.get('/api/health', (c) => c.json({ ok: true }))

// ---------------------------------------------------------------- trades

const ORDER_BY = `ORDER BY date ASC, COALESCE(entry_time, '99:99') ASC, created_at ASC`

app.get('/api/trades', async (c) => {
  const { from, to } = parse(dateRangeQuerySchema, { from: c.req.query('from'), to: c.req.query('to') })
  const { results } = await c.env.DB.prepare(
    `SELECT ${TRADE_COLUMNS} FROM trades WHERE date >= ? AND date <= ? ${ORDER_BY}`,
  )
    .bind(from, to)
    .all<TradeRow>()
  return c.json(results.map(rowToTrade))
})

app.post('/api/trades/bulk', async (c) => {
  const { trades } = parse(bulkTradesSchema, await readJson(c.req.raw))
  const now = new Date().toISOString()
  const created = trades.map((t) => newTrade(t, now))
  await c.env.DB.batch(created.map((t) => insertTradeStatement(c.env.DB, t)))
  return c.json({ created: created.length }, 201)
})

app.post('/api/trades', async (c) => {
  const input = parse(tradeInputSchema, await readJson(c.req.raw))
  const trade = newTrade(input, new Date().toISOString())
  const existing = await c.env.DB.prepare('SELECT id FROM trades WHERE id = ?').bind(trade.id).first()
  if (existing) throw new HttpError(409, 'A trade with this id already exists')
  await insertTradeStatement(c.env.DB, trade).run()
  return c.json(trade, 201)
})

app.put('/api/trades/:id', async (c) => {
  const id = parse(z.uuid(), c.req.param('id'))
  const input = parse(tradeInputSchema, await readJson(c.req.raw))
  const existing = await c.env.DB.prepare(`SELECT ${TRADE_COLUMNS} FROM trades WHERE id = ?`).bind(id).first<TradeRow>()
  if (!existing) throw new HttpError(404, 'Trade not found')
  const updatedAt = new Date().toISOString()
  await updateTradeStatement(c.env.DB, id, input, updatedAt).run()
  if (existing.screenshot_key && existing.screenshot_key !== input.screenshotKey) {
    await deleteScreenshotIfUnreferenced(c.env.DB, c.env.SCREENSHOTS, existing.screenshot_key, id)
  }
  const trade: Trade = { ...input, id, createdAt: existing.created_at, updatedAt }
  return c.json(trade)
})

app.delete('/api/trades/:id', async (c) => {
  const id = parse(z.uuid(), c.req.param('id'))
  const existing = await c.env.DB.prepare('SELECT screenshot_key FROM trades WHERE id = ?')
    .bind(id)
    .first<{ screenshot_key: string | null }>()
  if (!existing) throw new HttpError(404, 'Trade not found')
  await c.env.DB.prepare('DELETE FROM trades WHERE id = ?').bind(id).run()
  await deleteScreenshotIfUnreferenced(c.env.DB, c.env.SCREENSHOTS, existing.screenshot_key)
  return c.json({ ok: true })
})

// ---------------------------------------------------------------- day notes

app.get('/api/day-notes', async (c) => {
  const { from, to } = parse(dateRangeQuerySchema, { from: c.req.query('from'), to: c.req.query('to') })
  const { results } = await c.env.DB.prepare(
    'SELECT date, text, updated_at FROM day_notes WHERE date >= ? AND date <= ? ORDER BY date ASC',
  )
    .bind(from, to)
    .all<{ date: string; text: string; updated_at: string }>()
  const notes: DayNote[] = results.map((r) => ({ date: r.date, text: r.text, updatedAt: r.updated_at }))
  return c.json(notes)
})

app.put('/api/day-notes/:date', async (c) => {
  const date = parse(isoDate, c.req.param('date'))
  const { text } = parse(dayNoteInputSchema, await readJson(c.req.raw))
  const updatedAt = new Date().toISOString()
  if (text.trim() === '') {
    await c.env.DB.prepare('DELETE FROM day_notes WHERE date = ?').bind(date).run()
  } else {
    await c.env.DB.prepare(
      `INSERT INTO day_notes (date, text, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
    )
      .bind(date, text, updatedAt)
      .run()
  }
  const note: DayNote = { date, text, updatedAt }
  return c.json(note)
})

// ---------------------------------------------------------------- settings

async function loadSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()
  const map = new Map(results.map((r) => [r.key, r.value]))
  const week = map.get('weekStartsOn')
  return {
    weekStartsOn: week === '0' ? 0 : week === '1' ? 1 : DEFAULT_SETTINGS.weekStartsOn,
    currencySymbol: map.get('currencySymbol') || DEFAULT_SETTINGS.currencySymbol,
  }
}

function settingsStatements(db: D1Database, s: Settings): D1PreparedStatement[] {
  const upsert = 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  return [
    db.prepare(upsert).bind('weekStartsOn', String(s.weekStartsOn)),
    db.prepare(upsert).bind('currencySymbol', s.currencySymbol),
  ]
}

app.get('/api/settings', async (c) => c.json(await loadSettings(c.env.DB)))

app.put('/api/settings', async (c) => {
  const settings = parse(settingsSchema, await readJson(c.req.raw))
  await c.env.DB.batch(settingsStatements(c.env.DB, settings))
  return c.json(settings)
})

// ---------------------------------------------------------------- suggestions

app.get('/api/suggestions', async (c) => {
  const setups = await c.env.DB.prepare(
    `SELECT setup, COUNT(*) AS n FROM trades WHERE setup != '' GROUP BY setup ORDER BY n DESC LIMIT 100`,
  ).all<{ setup: string }>()
  const tags = await c.env.DB.prepare(
    `SELECT j.value AS tag, COUNT(*) AS n FROM trades t, json_each(t.tags) j GROUP BY j.value ORDER BY n DESC LIMIT 200`,
  ).all<{ tag: string }>()
  return c.json({ setups: setups.results.map((r) => r.setup), tags: tags.results.map((r) => r.tag) })
})

// ---------------------------------------------------------------- screenshots

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
const SCREENSHOT_NAME = /^[0-9a-f-]{36}\.(webp|jpg|png)$/

type ImageKind = { ext: 'webp' | 'jpg' | 'png'; type: string }

function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length > 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', type: 'image/jpeg' }
  }
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { ext: 'png', type: 'image/png' }
  }
  const tag = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to))
  if (bytes.length > 12 && tag(0, 4) === 'RIFF' && tag(8, 12) === 'WEBP') {
    return { ext: 'webp', type: 'image/webp' }
  }
  return null
}

app.post('/api/screenshots', async (c) => {
  const declared = Number(c.req.header('Content-Length') ?? '0')
  if (declared > MAX_SCREENSHOT_BYTES) throw new HttpError(413, 'Image is larger than 5 MB')
  const buffer = await c.req.arrayBuffer()
  if (buffer.byteLength === 0) throw new HttpError(400, 'Empty upload')
  if (buffer.byteLength > MAX_SCREENSHOT_BYTES) throw new HttpError(413, 'Image is larger than 5 MB')
  const kind = sniffImage(new Uint8Array(buffer))
  if (!kind) throw new HttpError(415, 'Only WebP, JPEG or PNG images are accepted')
  const key = `screenshots/${crypto.randomUUID()}.${kind.ext}`
  await c.env.SCREENSHOTS.put(key, buffer, { httpMetadata: { contentType: kind.type } })
  return c.json({ key }, 201)
})

app.get('/api/screenshots/:name', async (c) => {
  const name = c.req.param('name')
  if (!SCREENSHOT_NAME.test(name)) throw new HttpError(404, 'Not found')
  const object = await c.env.SCREENSHOTS.get(`screenshots/${name}`)
  if (!object) throw new HttpError(404, 'Not found')
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

app.delete('/api/screenshots/:name', async (c) => {
  const name = c.req.param('name')
  if (!SCREENSHOT_NAME.test(name)) throw new HttpError(404, 'Not found')
  await deleteScreenshotIfUnreferenced(c.env.DB, c.env.SCREENSHOTS, `screenshots/${name}`)
  return c.json({ ok: true })
})

// ---------------------------------------------------------------- export / import

async function loadAllTrades(db: D1Database): Promise<Trade[]> {
  const { results } = await db.prepare(`SELECT ${TRADE_COLUMNS} FROM trades ${ORDER_BY}`).all<TradeRow>()
  return results.map(rowToTrade)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

app.get('/api/export', async (c) => {
  const includeScreenshots = c.req.query('screenshots') !== 'false'
  const trades = await loadAllTrades(c.env.DB)
  const { results: noteRows } = await c.env.DB.prepare(
    'SELECT date, text, updated_at FROM day_notes ORDER BY date ASC',
  ).all<{ date: string; text: string; updated_at: string }>()

  const backup: Backup = {
    app: 'trade-journal',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    trades,
    dayNotes: noteRows.map((r) => ({ date: r.date, text: r.text, updatedAt: r.updated_at })),
    settings: await loadSettings(c.env.DB),
  }

  if (includeScreenshots) {
    const screenshots: Record<string, string> = {}
    for (const key of new Set(trades.map((t) => t.screenshotKey).filter((k): k is string => k !== null))) {
      const object = await c.env.SCREENSHOTS.get(key)
      if (!object) continue
      const bytes = new Uint8Array(await object.arrayBuffer())
      const type = object.httpMetadata?.contentType ?? 'image/webp'
      screenshots[key] = `data:${type};base64,${bytesToBase64(bytes)}`
    }
    backup.screenshots = screenshots
  }

  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(JSON.stringify(backup), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="trade-journal-backup-${stamp}.json"`,
    },
  })
})

app.get('/api/export.csv', async (c) => {
  const trades = await loadAllTrades(c.env.DB)
  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(tradesToCsv(trades), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="trades-${stamp}.csv"`,
    },
  })
})

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; kind: ImageKind } {
  const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match?.[1]) throw new HttpError(400, 'Invalid screenshot data in backup')
  const binary = atob(match[1])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const kind = sniffImage(bytes)
  if (!kind || bytes.length > MAX_SCREENSHOT_BYTES) throw new HttpError(400, 'Invalid screenshot in backup')
  return { bytes, kind }
}

app.post('/api/import', async (c) => {
  const backup = parse(backupSchema, upgradeBackup(await readJson(c.req.raw)))
  const screenshots = backup.screenshots ?? {}

  // Restore images first, so the database never references a missing object.
  for (const [key, dataUrl] of Object.entries(screenshots)) {
    if (!/^screenshots\/[0-9a-f-]{36}\.(webp|jpg|png)$/.test(key)) {
      throw new HttpError(400, `Invalid screenshot key in backup: ${key}`)
    }
    const { bytes, kind } = decodeDataUrl(dataUrl)
    await c.env.SCREENSHOTS.put(key, bytes, { httpMetadata: { contentType: kind.type } })
  }

  const db = c.env.DB
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM trades'),
    db.prepare('DELETE FROM day_notes'),
    db.prepare('DELETE FROM settings'),
    ...backup.trades.map((t) => insertTradeStatement(db, t)),
    ...backup.dayNotes
      .filter((n) => n.text.trim() !== '')
      .map((n) =>
        db.prepare('INSERT INTO day_notes (date, text, updated_at) VALUES (?, ?, ?)').bind(n.date, n.text, n.updatedAt),
      ),
    ...settingsStatements(db, backup.settings),
  ]
  // D1 runs a batch as a single transaction: all of it applies, or none of it.
  try {
    await db.batch(statements)
  } catch (err) {
    console.error('Import failed', err)
    throw new HttpError(400, 'Import failed; your existing data was not changed (check for duplicate ids)')
  }

  const keep = new Set(backup.trades.map((t) => t.screenshotKey).filter((k): k is string => k !== null))
  await deleteOrphanScreenshots(c.env.SCREENSHOTS, keep)

  return c.json({ trades: backup.trades.length, dayNotes: backup.dayNotes.length })
})

// ---------------------------------------------------------------- clear all

app.delete('/api/data', async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM trades'),
    c.env.DB.prepare('DELETE FROM day_notes'),
    c.env.DB.prepare('DELETE FROM settings'),
  ])
  await deleteOrphanScreenshots(c.env.SCREENSHOTS, new Set())
  return c.json({ ok: true })
})

export default app
