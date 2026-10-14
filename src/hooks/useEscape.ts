import { useEffect, useRef } from 'react'

/**
 * Escape handling for stacked overlays: only the most recently opened one reacts,
 * so Esc inside a confirm dialog closes the dialog, not the drawer behind it.
 */
const stack: { current: () => void }[] = []
let listening = false

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  const top = stack[stack.length - 1]
  if (top) {
    event.preventDefault()
    top.current()
  }
}

export function useEscape(handler: () => void, active = true): void {
  const ref = useRef(handler)
  ref.current = handler

  useEffect(() => {
    if (!active) return undefined
    stack.push(ref)
    if (!listening) {
      window.addEventListener('keydown', onKeyDown)
      listening = true
    }
    return () => {
      const i = stack.indexOf(ref)
      if (i >= 0) stack.splice(i, 1)
      if (stack.length === 0 && listening) {
        window.removeEventListener('keydown', onKeyDown)
        listening = false
      }
    }
  }, [active])
}
