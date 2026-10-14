import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, FileSpreadsheet, FlaskConical, Trash2, Upload } from 'lucide-react'
import { api } from '../api'
import { backupSchema } from '../lib/schemas'
import { generateSampleTrades } from '../lib/sample'
import { useSaveSettings, useSettings } from '../hooks/queries'
import { useConfirm, useToast } from '../providers'
import { Button, Card } from '../components/ui'

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </Card>
  )
}

export function SettingsPage() {
  const { settings, isLoading } = useSettings()
  const saveSettings = useSaveSettings()
  const client = useQueryClient()
  const confirm = useConfirm()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [symbol, setSymbol] = useState<string | null>(null)

  const run = async (name: string, task: () => Promise<void>) => {
    setBusy(name)
    try {
      await task()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const refreshAll = () => client.invalidateQueries()

  const commitSymbol = () => {
    const value = (symbol ?? settings.currencySymbol).trim()
    setSymbol(null)
    if (value && value !== settings.currencySymbol) {
      saveSettings.mutate({ ...settings, currencySymbol: value.slice(0, 3) })
    }
  }

  const exportJson = () =>
    run('export', async () => {
      await api.download('/api/export', 'trade-journal-backup.json')
      toast.success('Backup downloaded')
    })

  const exportCsv = () =>
    run('csv', async () => {
      await api.download('/api/export.csv', 'trades.csv')
      toast.success('CSV downloaded')
    })

  const onImportFile = async (file: File | undefined) => {
    if (!file) return
    if (fileInput.current) fileInput.current.value = ''
    await run('import', async () => {
      let raw: unknown
      try {
        raw = JSON.parse(await file.text())
      } catch {
        throw new Error('That file is not valid JSON')
      }
      const parsed = backupSchema.safeParse(raw)
      if (!parsed.success) {
        const first = parsed.error.issues[0]
        throw new Error(
          `That is not a valid Trade Journal backup${first ? ` (${first.path.join('.')}: ${first.message})` : ''}`,
        )
      }
      const backup = parsed.data
      const images = Object.keys(backup.screenshots ?? {}).length
      const ok = await confirm({
        title: 'Replace all data with this backup?',
        message: `This will overwrite everything currently in your journal with ${backup.trades.length} trades, ${backup.dayNotes.length} day notes${
          images ? ` and ${images} screenshots` : ''
        } from a backup made ${backup.exportedAt.slice(0, 10)}. This cannot be undone.`,
        confirmLabel: 'Replace everything',
        danger: true,
      })
      if (!ok) return
      const result = await api.importBackup(backup)
      await refreshAll()
      toast.success(`Imported ${result.trades} trades and ${result.dayNotes} day notes`)
    })
  }

  const loadSample = () =>
    run('sample', async () => {
      const trades = generateSampleTrades()
      const ok = await confirm({
        title: 'Load sample data?',
        message: `This adds ${trades.length} example trades from the last 90 days to your journal. You can remove them with “Clear all data”.`,
        confirmLabel: 'Add sample trades',
      })
      if (!ok) return
      await api.bulkCreateTrades(trades)
      await refreshAll()
      toast.success(`Added ${trades.length} sample trades`)
    })

  const clearAll = () =>
    run('clear', async () => {
      const first = await confirm({
        title: 'Delete all data?',
        message: 'Every trade, day note, screenshot and setting will be permanently deleted from the cloud database.',
        confirmLabel: 'Continue',
        danger: true,
      })
      if (!first) return
      const second = await confirm({
        title: 'Are you absolutely sure?',
        message: 'This is your last chance. Export a backup first if you might need this data again.',
        confirmLabel: 'Yes, delete everything',
        danger: true,
      })
      if (!second) return
      await api.clearAll()
      await refreshAll()
      toast.success('All data deleted')
    })

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted">Preferences, backups and data tools.</p>
      </div>

      <Section title="Preferences" description="Saved to your journal, so they follow you to every device.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="week-start" className="label">
              Week starts on
            </label>
            <select
              id="week-start"
              className="field"
              disabled={isLoading}
              value={settings.weekStartsOn}
              onChange={(e) => saveSettings.mutate({ ...settings, weekStartsOn: e.target.value === '0' ? 0 : 1 })}
            >
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </select>
          </div>
          <div>
            <label htmlFor="currency" className="label">
              Currency symbol
            </label>
            <input
              id="currency"
              className="field"
              maxLength={3}
              disabled={isLoading}
              value={symbol ?? settings.currencySymbol}
              onChange={(e) => setSymbol(e.target.value)}
              onBlur={commitSymbol}
              onKeyDown={(e) => e.key === 'Enter' && commitSymbol()}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Backup and restore"
        description="Your data lives in the Cloudflare database, so it is the same on every device. Download a backup now and then as a safety net."
      >
        <div className="flex flex-wrap gap-3">
          <Button aria-label="Export all data as JSON" disabled={busy !== null} onClick={() => void exportJson()}>
            <Download className="h-4 w-4" aria-hidden />
            Export backup (.json)
          </Button>
          <Button aria-label="Import backup from JSON" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" aria-hidden />
            Import backup
          </Button>
          <Button aria-label="Export trades as CSV" disabled={busy !== null} onClick={() => void exportCsv()}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Export trades (.csv)
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Backup file"
            onChange={(e) => void onImportFile(e.target.files?.[0])}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Importing replaces everything currently in the journal, including screenshots included in the backup.
        </p>
      </Section>

      <Section title="Sample data" description="Fill the journal with example trades to see how the calendar and stats look.">
        <Button aria-label="Load sample data" disabled={busy !== null} onClick={() => void loadSample()}>
          <FlaskConical className="h-4 w-4" aria-hidden />
          Load sample data
        </Button>
      </Section>

      <Section title="Danger zone" description="Permanently deletes every trade, note, screenshot and setting.">
        <Button variant="danger" aria-label="Clear all data" disabled={busy !== null} onClick={() => void clearAll()}>
          <Trash2 className="h-4 w-4" aria-hidden />
          Clear all data
        </Button>
      </Section>
    </div>
  )
}
