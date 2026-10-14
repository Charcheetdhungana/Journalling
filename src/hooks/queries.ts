import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, type DateRange } from '../api'
import { DEFAULT_SETTINGS, type DayNote, type Settings, type Trade } from '../lib/schemas'
import { useToast } from '../providers'

export const ALL_TIME: DateRange = { from: '1900-01-01', to: '2999-12-31' }

export function useTrades(range: DateRange) {
  return useQuery({
    queryKey: ['trades', range.from, range.to],
    queryFn: () => api.getTrades(range),
  })
}

export function useDayNotes(range: DateRange) {
  return useQuery({
    queryKey: ['dayNotes', range.from, range.to],
    queryFn: () => api.getDayNotes(range),
  })
}

export function useSettings() {
  const query = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })
  return { ...query, settings: query.data ?? DEFAULT_SETTINGS }
}

export function useSuggestions() {
  return useQuery({ queryKey: ['suggestions'], queryFn: api.getSuggestions, staleTime: 60_000 })
}

type TradeLists = [readonly unknown[], Trade[] | undefined][]

function sortTrades(list: Trade[]): Trade[] {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    const ta = a.entryTime ?? '99:99'
    const tb = b.entryTime ?? '99:99'
    if (ta !== tb) return ta < tb ? -1 : 1
    return a.createdAt < b.createdAt ? -1 : 1
  })
}

/** Update every cached trade list: remove the trade, then re-add it where its date fits the range. */
function applyTradeToCache(client: QueryClient, trade: Trade): void {
  const entries = client.getQueriesData<Trade[]>({ queryKey: ['trades'] })
  for (const [key, list] of entries) {
    if (!list) continue
    const from = String(key[1])
    const to = String(key[2])
    const without = list.filter((t) => t.id !== trade.id)
    const next = trade.date >= from && trade.date <= to ? sortTrades([...without, trade]) : without
    client.setQueryData(key, next)
  }
}

function removeTradeFromCache(client: QueryClient, id: string): void {
  for (const [key, list] of client.getQueriesData<Trade[]>({ queryKey: ['trades'] })) {
    if (list) client.setQueryData(key, list.filter((t) => t.id !== id))
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong'
}

/** Create or update a trade: the UI updates immediately and rolls back if the save fails. */
export function useSaveTrade() {
  const client = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ trade, isNew }: { trade: Trade; isNew: boolean }) =>
      isNew ? api.createTrade(trade) : api.updateTrade(trade),
    onMutate: async ({ trade }) => {
      await client.cancelQueries({ queryKey: ['trades'] })
      const snapshot: TradeLists = client.getQueriesData<Trade[]>({ queryKey: ['trades'] })
      applyTradeToCache(client, trade)
      return { snapshot }
    },
    onError: (err, _vars, context) => {
      context?.snapshot.forEach(([key, data]) => client.setQueryData(key, data))
      toast.error(`Could not save trade: ${errorMessage(err)}`)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['trades'] })
      void client.invalidateQueries({ queryKey: ['suggestions'] })
    },
  })
}

export function useDeleteTrade() {
  const client = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: string) => api.deleteTrade(id),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: ['trades'] })
      const snapshot: TradeLists = client.getQueriesData<Trade[]>({ queryKey: ['trades'] })
      removeTradeFromCache(client, id)
      return { snapshot }
    },
    onError: (err, _id, context) => {
      context?.snapshot.forEach(([key, data]) => client.setQueryData(key, data))
      toast.error(`Could not delete trade: ${errorMessage(err)}`)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['trades'] })
      void client.invalidateQueries({ queryKey: ['suggestions'] })
    },
  })
}

export function useSaveDayNote() {
  const client = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ date, text }: { date: string; text: string }) => api.putDayNote(date, text),
    onMutate: async ({ date, text }) => {
      await client.cancelQueries({ queryKey: ['dayNotes'] })
      const snapshot = client.getQueriesData<DayNote[]>({ queryKey: ['dayNotes'] })
      for (const [key, list] of snapshot) {
        if (!list) continue
        const from = String(key[1])
        const to = String(key[2])
        const without = list.filter((n) => n.date !== date)
        const next =
          text.trim() !== '' && date >= from && date <= to
            ? [...without, { date, text, updatedAt: new Date().toISOString() }].sort((a, b) =>
                a.date < b.date ? -1 : 1,
              )
            : without
        client.setQueryData(key, next)
      }
      return { snapshot }
    },
    onError: (err, _vars, context) => {
      context?.snapshot.forEach(([key, data]) => client.setQueryData(key, data))
      toast.error(`Could not save day notes: ${errorMessage(err)}`)
    },
    onSettled: () => void client.invalidateQueries({ queryKey: ['dayNotes'] }),
  })
}

export function useSaveSettings() {
  const client = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (settings: Settings) => api.putSettings(settings),
    onMutate: async (settings) => {
      await client.cancelQueries({ queryKey: ['settings'] })
      const previous = client.getQueryData<Settings>(['settings'])
      client.setQueryData(['settings'], settings)
      return { previous }
    },
    onError: (err, _vars, context) => {
      if (context?.previous) client.setQueryData(['settings'], context.previous)
      toast.error(`Could not save settings: ${errorMessage(err)}`)
    },
    onSettled: () => void client.invalidateQueries({ queryKey: ['settings'] }),
  })
}
