import { useEffect, useState, type CSSProperties } from 'react'
import { IS_MAC, SWITCH_KEYS, type Typer } from '../lib/typing'

// English ⇄ the language being learned, for typing the entry (lib/typing.ts). On a computer it sits under
// the toolbar and ⌘⇧ (Ctrl+Shift elsewhere), pressed and let go on their own, switches it. On a phone it
// rides on top of the keyboard while the text is being written, so switching is one tap and the keyboard
// stays up.

type Props = {
  typer: Typer
  on: boolean
  onChange: (on: boolean) => void
}

// How far the phone's keyboard covers the bottom of the screen: iOS lays it over the page (the visual
// viewport shrinks, the layout doesn't), Android usually resizes the page (then this stays 0).
function useKeyboardInset() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

// Whether the entry's text is being written (the keyboard is up on a phone).
function useWriting() {
  const [writing, setWriting] = useState(false)
  useEffect(() => {
    const update = () => setWriting(Boolean(document.activeElement?.closest('.journal-text[contenteditable]')))
    update()
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [])
  return writing
}

// ⌘⇧ / Ctrl+Shift on their own: both held, then let go with no other key in between (so ⌘⇧4 and other
// shortcuts still work as usual).
function useSwitchKeys(onSwitch: () => void) {
  useEffect(() => {
    let armed = false
    const mod = (e: KeyboardEvent) => (IS_MAC ? e.metaKey : e.ctrlKey)
    const isMod = (key: string) => key === (IS_MAC ? 'Meta' : 'Control')
    const down = (e: KeyboardEvent) => {
      armed = (e.key === 'Shift' && mod(e)) || (isMod(e.key) && e.shiftKey) ? !e.altKey : false
    }
    const up = (e: KeyboardEvent) => {
      if (armed && (e.key === 'Shift' || isMod(e.key))) {
        armed = false
        onSwitch()
      }
    }
    const reset = () => (armed = false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', reset)
    }
  }, [onSwitch])
}

export function TypingToggle({ typer, on, onChange }: Props) {
  const inset = useKeyboardInset()
  const writing = useWriting()
  useSwitchKeys(() => onChange(!on))

  // pointerdown is stopped so tapping the toggle doesn't take focus from the text (the keyboard stays up).
  const keep = (e: { preventDefault: () => void }) => e.preventDefault()
  return (
    <div
      className={`typing-toggle${writing ? ' writing' : ''}`}
      style={{ '--keyboard': `${inset}px` } as CSSProperties}
      onPointerDown={keep}
      onMouseDown={keep}
    >
      <div className="typing-switch" role="radiogroup" aria-label={`Type in (switch with ${SWITCH_KEYS})`}>
        <button type="button" role="radio" aria-checked={!on} onClick={() => onChange(false)}>
          English
        </button>
        <button type="button" role="radio" aria-checked={on} onClick={() => onChange(true)}>
          {typer.name}
        </button>
      </div>
      <span className="typing-hint muted">
        {on ? typer.hint : 'Typing as is'}
        <kbd className="typing-keys">{SWITCH_KEYS} to switch</kbd>
      </span>
    </div>
  )
}
