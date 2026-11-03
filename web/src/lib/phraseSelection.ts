import { useEffect, useRef, type RefObject } from 'react'

// Pressing a word and dragging over others highlights them as one phrase (owner's request 2026-11-02: "den tu"
// should be read as "đến từ", not two words). Words are buttons (word boxes), so the browser's own text
// selection can't reach across them: this does it with pointer events. Each selectable word is an element
// with class `sel-unit` and `data-a`/`data-b`, its start and end offsets in the checked text; a highlighted
// phrase is a `sel-phrase` with the same offsets, its words `sel-unit`s inside it.
//
// While the finger moves, the words are tinted straight in the DOM (class `sel-live`), not through React
// state, so the drag stays smooth however long the entry is (owner's feedback: "super clunky").

// How far the pointer moves before a press becomes a drag (less is a tap, which opens the word's box). A finger
// moving more up or down than sideways is scrolling the page (the sheet is `touch-action: pan-y`); sideways
// it selects, and once selecting it can go to other lines. A mouse selects in any direction. No hold: the
// owner wanted a click-and-drag on the phone as on a computer.
const DRAG_START = 6

export type TextRange = { a: number; b: number }

/** Selection inside `root`; `onSelect` gets the range when the pointer is lifted. A tap still opens the word. */
export function usePhraseSelection(root: RefObject<HTMLElement | null>, onSelect: (range: TextRange) => void) {
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  })

  useEffect(() => {
    const el = root.current
    if (!el) return
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
      // A highlighted phrase the drag runs into lets go of its words (`sel-broken`: no pink, no reading above),
      // so the new highlight can take any of them; on release the new one replaces it (owner's request 2026-11-02).
      for (const p of el.querySelectorAll<HTMLElement>('.sel-phrase')) {
        const { a, b } = rangeOf(p)
        p.classList.toggle('sel-broken', Boolean(r && a < r.b && b > r.a))
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
    }
    const onMove = (e: PointerEvent) => {
      if (!pressed) return
      if (!anchor) {
        const dx = Math.abs(e.clientX - x)
        const dy = Math.abs(e.clientY - y)
        if (Math.max(dx, dy) < DRAG_START) return
        // A finger going up or down is scrolling the page, not selecting.
        if (e.pointerType !== 'mouse' && dy > dx) return reset()
        anchor = rangeOf(pressed)
        extendTo(pressed)
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
