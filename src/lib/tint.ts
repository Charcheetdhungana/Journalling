/** Background tint for a calendar day: blue for profit, red for loss, grey for zero. */
export function dayTint(pnlCents: number, maxAbsCents: number): string {
  if (pnlCents === 0) return 'rgba(139, 149, 167, 0.18)'
  const ratio = maxAbsCents > 0 ? Math.min(1, Math.abs(pnlCents) / maxAbsCents) : 1
  const alpha = (0.14 + ratio * 0.5).toFixed(2)
  return pnlCents > 0 ? `rgba(59, 139, 255, ${alpha})` : `rgba(240, 82, 82, ${alpha})`
}
