import { useEffect, useRef, type RefObject } from 'react'

// Holding a word and sliding over others highlights them as one phrase (owner's request 2026-11-02: "den tu"
// should be read as "đến từ", not two words). Words are buttons (word boxes), so the browser's own text
// selection can't reach across them: this does it with pointer events. Each selectable word is an element
// with class `sel-unit` and `data-a`/`data-b`, its start and end offsets in the checked text.
//
// While the finger moves, the words are tinted straight in the DOM (class `sel-live`), not through React
// state, so the drag stays smooth however long the entry is (owner's feedback: "super clunky").

// How long a press must last before it selects, and how far the finger may move before that (a scroll).
const HOLD_MS = 250
const MOVE_TOLERANCE = 8

export type TextRange = { a: number; b: number }

/** Selection inside `root`; `onSelect` gets the range when the pointer is lifted. A short tap opens the word. */
export function usePhraseSelection(root: RefObject<HTMLElement | null>, onSelect: (range: TextRange) => void) {
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  })

  useEffect(() => {
    const el = root.current
    if (!el) return
    let timer = 0
    let pressed: HTMLElement | null = null
    let x = 0
    let y = 0
    let anchor: TextRange | null = null
    let current: TextRange | null = null
    // The click that follows a selection would open the word box under the finger.
    let swallowClick = false

    const unitOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>('.sel-unit') : null)
    const rangeOf = (u: HTMLElement): TextRange => ({ a: Number(u.dataset.a), b: Number(u.dataset.b) })
    const paint = (r: TextRange | null) => {
      for (const u of el.querySelectorAll<HTMLElement>('.sel-unit')) {
        const { a, b } = rangeOf(u)
        u.classList.toggle('sel-live', Boolean(r && a >= r.a && b <= r.b))
      }
    }
    const extendTo = (u: HTMLElement) => {
      if (!anchor) return
      const r = rangeOf(u)
      const next = { a: Math.min(anchor.a, r.a), b: Math.max(anchor.b, r.b) }
      if (current && next.a === current.a && next.b === current.b) return
      current = next
      paint(current)
    }
    const reset = () => {
      window.clearTimeout(timer)
      pressed = null
      anchor = null
      current = null
    }

    const onDown = (e: PointerEvent) => {
      if (e.button > 0) return
      const unit = unitOf(e.target)
      if (!unit || !el.contains(unit)) return
      reset()
      pressed = unit
      x = e.clientX
      y = e.clientY
      timer = window.setTimeout(() => {
        if (!pressed) return
        anchor = rangeOf(pressed)
        extendTo(pressed)
        navigator.vibrate?.(10)
      }, HOLD_MS)
    }
    const onMove = (e: PointerEvent) => {
      if (!pressed) return
      if (!anchor) {
        // Moved before the hold: a scroll or an ordinary drag, not a selection.
        if (Math.hypot(e.clientX - x, e.clientY - y) > MOVE_TOLERANCE) reset()
        return
      }
      // Between words (a space, the margin) the selection stays as it is.
      const unit = unitOf(document.elementFromPoint(e.clientX, e.clientY))
      if (unit && el.contains(unit)) extendTo(unit)
    }
    const onUp = () => {
      if (anchor && current) {
        swallowClick = true
        onSelectRef.current(current)
      }
      paint(null)
      reset()
    }
    const onCancel = () => {
      paint(null)
      reset()
    }
    // While selecting, a finger's drag selects instead of scrolling the page (needs a non-passive listener).
    const onTouchMove = (e: TouchEvent) => {
      if (anchor) e.preventDefault()
    }
    const onClick = (e: MouseEvent) => {
      if (!swallowClick) return
      swallowClick = false
      e.preventDefault()
      e.stopPropagation()
    }
    // A long press would otherwise open the browser's own menu (Android) or callout.
    const onContextMenu = (e: Event) => {
      if (pressed) e.preventDefault()
    }

    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('click', onClick, true)
    el.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.clearTimeout(timer)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('click', onClick, true)
      el.removeEventListener('contextmenu', onContextMenu)
    }
  }, [root])
}
