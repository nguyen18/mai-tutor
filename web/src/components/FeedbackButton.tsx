import { useEffect, useRef, useState } from 'react'
import { FeedbackForm, type FeedbackState } from './FeedbackForm'
import { useSyncStatus } from '../lib/sync'

// The 💬 button above the ☰ menu (owner's request 2026-10-29): signed-in users send feedback (a sentence,
// more details, a picture), which becomes a ticket on the owner's Notion board (lib/feedback.ts). Opens to
// the button's right like the menu; on a phone, as a sheet along the bottom of the screen.
export function FeedbackButton({ raised }: { raised: boolean }) {
  const status = useSyncStatus()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<FeedbackState>('editing')
  // A new form after one was sent; a closed panel keeps its draft otherwise.
  const [form, setForm] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  // Close on Escape or a click outside, unless it's sending.
  useEffect(() => {
    if (!open || state === 'sending') return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open, state])

  // The form stays mounted (hidden) to keep its draft, so focus its first box on opening.
  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLElement>('.feedback-panel input[type=text]')?.focus()
  }, [open, form])

  if (status.state === 'signed-out') return null

  return (
    <div className={raised ? 'feedback raised' : 'feedback'} ref={ref}>
      <button
        type="button"
        className="feedback-fab"
        aria-expanded={open}
        aria-controls="feedback-panel"
        aria-label={open ? 'Close feedback' : 'Send feedback'}
        title="Send feedback"
        onClick={() => {
          if (state === 'sent') {
            setForm((f) => f + 1)
            setState('editing')
          }
          setOpen((o) => !o)
        }}
      >
        {open ? '✕' : '💬'}
      </button>
      <div id="feedback-panel" className="feedback-panel" role="dialog" aria-label="Send feedback" hidden={!open}>
        <FeedbackForm
          key={form}
          heading="Send feedback"
          summaryPlaceholder="e.g. Word boxes are hard to close on my phone"
          detailsPlaceholder="What happened, what you expected, anything else"
          onStateChange={setState}
          onClose={() => setOpen(false)}
        />
      </div>
    </div>
  )
}
