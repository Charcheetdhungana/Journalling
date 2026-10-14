/**
 * Upgrades an older backup file (parsed JSON) to the current format.
 *
 * v1 stored strike / entry / exit prices as integer cents (strikeCents, entryPriceCents,
 * exitPriceCents). v2 stores them in 1/10000 dollar units (strikeE4, entryPriceE4, exitPriceE4).
 * Anything that is not a recognisable v1 backup is returned unchanged for the schema to judge.
 */
export function upgradeBackup(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw
  const obj = raw as Record<string, unknown>
  if (obj.version !== 1 || !Array.isArray(obj.trades)) return raw

  const scale = (value: unknown): unknown => (typeof value === 'number' ? value * 100 : value)

  const trades = obj.trades.map((t: unknown) => {
    if (typeof t !== 'object' || t === null) return t
    const { strikeCents, entryPriceCents, exitPriceCents, ...rest } = t as Record<string, unknown>
    return {
      ...rest,
      strikeE4: scale(strikeCents ?? null),
      entryPriceE4: scale(entryPriceCents ?? null),
      exitPriceE4: scale(exitPriceCents ?? null),
    }
  })

  return { ...obj, version: 2, trades }
}
