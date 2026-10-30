import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type ReactNode,
} from 'react'
import { WrongWordButton } from './FeedbackButton'

const GUTTER = 12
// Must match the mobile media query in App.css, where the box becomes a centered card instead.
const MOBILE_QUERY = '(max-width: 600px)'

// True on narrow screens, and updates if the window is resized across the breakpoint.
function useIsMobile() {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(MOBILE_QUERY)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
  )
}

type PopoverProps = {
  // What the trigger button shows.
  trigger: ReactNode
  triggerClassName?: string
  // Accessible name for the trigger when its content isn't enough (e.g. "+2" tags).
  triggerLabel?: string
  lang?: string
  // Shown in the box's header on mobile, where the box isn't next to the word.
  title: string
  // Which side of the list item the box lines up with: the start (English word) or the end (translation).
  align?: 'start' | 'end'
  wrapClassName?: string
  // Changes to this re-measure the box's position (its content changed size).
  contentKey?: string
  // A word box: ends with "Wrong definition/word?", which closes it and opens the feedback form about the
  // word (context goes on the ticket).
  report?: { word: string; context?: Record<string, string> }
  children: ReactNode
}

// A button with a floating box: hover or focus previews it; clicking or tapping pins it open so its
// buttons can be used. On narrow screens there's no preview: the box only opens on click/tap, as a card
// centered on screen over a backdrop. Used for both the English word and the translation on the Cheatsheet.
export function Popover({
  trigger,
  triggerClassName,
  triggerLabel,
  lang,
  title,
  align = 'end',
  wrapClassName,
  contentKey,
  report,
  children,
}: PopoverProps) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  const isMobile = useIsMobile()
  const open = pinned || (!isMobile && (hovered || focused))
  const wrapRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const boxId = useId()

  // Unpin on a click or tap anywhere outside this trigger and its box.
  useEffect(() => {
    if (!pinned) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPinned(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [pinned])

  // Keep the box on screen: it opens below the trigger, nudged sideways to fit, and flips above when it
  // doesn't fit below and there's more room above. A box too tall for either side (a 12-row pronoun
  // table next to a word mid-screen) is then moved up or down just enough to be fully visible. On mobile
  // it's a centered card sized by CSS instead.
  useLayoutEffect(() => {
    const tip = tipRef.current
    if (!open || !tip) return
    tip.style.setProperty('--shift', '0px')
    tip.style.setProperty('--vshift', '0px')
    tip.classList.remove('above')
    if (isMobile) return
    const rect = tip.getBoundingClientRect()
    let shift = 0
    if (rect.left < GUTTER) shift = GUTTER - rect.left
    else if (rect.right > window.innerWidth - GUTTER) shift = window.innerWidth - GUTTER - rect.right
    tip.style.setProperty('--shift', `${shift}px`)
    const trigger = tip.parentElement?.getBoundingClientRect()
    const roomBelow = window.innerHeight - (trigger?.bottom ?? rect.top)
    const roomAbove = trigger?.top ?? 0
    if (rect.bottom > window.innerHeight - GUTTER && roomAbove > roomBelow) tip.classList.add('above')
    const placed = tip.getBoundingClientRect()
    let vshift = 0
    if (placed.bottom > window.innerHeight - GUTTER) vshift = window.innerHeight - GUTTER - placed.bottom
    if (placed.top + vshift < GUTTER) vshift = GUTTER - placed.top
    tip.style.setProperty('--vshift', `${vshift}px`)
  }, [open, contentKey, isMobile])

  // Focus moving between the trigger and buttons inside the box shouldn't close it.
  const onBlur = (e: FocusEvent) => {
    if (!wrapRef.current?.contains(e.relatedTarget as Node)) setFocused(false)
  }

  const close = () => {
    setPinned(false)
    setFocused(false)
    setHovered(false)
  }

  const tipClass = ['tip', align === 'start' ? 'align-start' : '', pinned ? 'pinned' : ''].filter(Boolean).join(' ')

  return (
    // Hover handlers sit on the wrapper so the box stays open while the pointer moves into it.
    <span
      ref={wrapRef}
      className={wrapClassName}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
      onKeyDown={(e) => e.key === 'Escape' && close()}
    >
      <button
        type="button"
        className={`tip-trigger ${triggerClassName ?? ''}`}
        lang={lang}
        aria-expanded={open}
        aria-controls={boxId}
        aria-label={triggerLabel}
        onClick={() => setPinned((p) => !p)}
      >
        {trigger}
      </button>
      {open && (
        // The backdrop only shows on mobile, behind the centered card; tapping it closes the box.
        // It closes on click, not pointerdown: closing on pointerdown would remove the backdrop mid-tap,
        // and the tap's click would land on (and open) whatever word is underneath.
        <span className="tip-backdrop" aria-hidden="true" onClick={close} />
      )}
      {open && (
        <div ref={tipRef} id={boxId} className={tipClass}>
          <div className="tip-box">
            {/* Mobile only: the card isn't next to the word, so name it, and give it a close button. */}
            <div className="tip-head">
              <span className="cheat-word">{title}</span>
              <button type="button" className="tip-close" aria-label="Close" onClick={close}>
                ✕
              </button>
            </div>
            {children}
            {report && <WrongWordButton word={report.word} context={report.context} onOpen={close} />}
          </div>
        </div>
      )}
    </span>
  )
}
