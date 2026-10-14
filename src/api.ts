import type { Backup, DayNote, Settings, Trade, TradeInput } from './lib/schemas'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init })
  } catch {
    throw new ApiError('Network error: could not reach the server', 0)
  }
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) {
    if (response.ok) throw new ApiError('Unexpected response from the server', response.status)
    throw new ApiError(
      response.status === 401 || response.status === 403
        ? 'Your session has expired. Reload the page to sign in again.'
        : `Request failed (${response.status})`,
      response.status,
    )
  }
  const body: unknown = await response.json()
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Request failed (${response.status})`
    const details = typeof body === 'object' && body !== null && 'details' in body ? body.details : undefined
    throw new ApiError(message, response.status, details)
  }
  return body as T
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export interface DateRange {
  from: string
  to: string
}

export interface Suggestions {
  setups: string[]
  tags: string[]
}

export const api = {
  getTrades: ({ from, to }: DateRange) => request<Trade[]>(`/api/trades?from=${from}&to=${to}`),
  createTrade: (trade: Trade) => request<Trade>('/api/trades', jsonInit('POST', toInput(trade))),
  updateTrade: (trade: Trade) => request<Trade>(`/api/trades/${trade.id}`, jsonInit('PUT', toInput(trade))),
  deleteTrade: (id: string) => request<{ ok: true }>(`/api/trades/${id}`, { method: 'DELETE' }),
  bulkCreateTrades: (trades: TradeInput[]) =>
    request<{ created: number }>('/api/trades/bulk', jsonInit('POST', { trades })),

  getDayNotes: ({ from, to }: DateRange) => request<DayNote[]>(`/api/day-notes?from=${from}&to=${to}`),
  putDayNote: (date: string, text: string) => request<DayNote>(`/api/day-notes/${date}`, jsonInit('PUT', { text })),

  getSettings: () => request<Settings>('/api/settings'),
  putSettings: (settings: Settings) => request<Settings>('/api/settings', jsonInit('PUT', settings)),

  getSuggestions: () => request<Suggestions>('/api/suggestions'),

  uploadScreenshot: (blob: Blob) =>
    request<{ key: string }>('/api/screenshots', {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    }),
  deleteScreenshot: (key: string) =>
    request<{ ok: true }>(`/api/${key}`, { method: 'DELETE' }),

  importBackup: (backup: Backup) =>
    request<{ trades: number; dayNotes: number }>('/api/import', jsonInit('POST', backup)),
  clearAll: () => request<{ ok: true }>('/api/data', { method: 'DELETE' }),

  async download(path: string, fallbackName: string): Promise<void> {
    const response = await fetch(path, { credentials: 'same-origin' })
    if (!response.ok) throw new ApiError(`Download failed (${response.status})`, response.status)
    const blob = await response.blob()
    const disposition = response.headers.get('Content-Disposition') ?? ''
    const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}

export function screenshotUrl(key: string): string {
  return `/api/${key}`
}

function toInput(trade: Trade): TradeInput {
  // Drop server-managed timestamps; keep the client-generated id.
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...input } = trade
  void _createdAt
  void _updatedAt
  return input
}
