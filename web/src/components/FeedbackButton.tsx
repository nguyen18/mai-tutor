import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MAX_DETAILS, MAX_SUMMARY, onOpenFeedback, openFeedback, sendFeedback } from '../lib/feedback'
import { useSyncStatus } from '../lib/sync'

// The 💬 button above the ☰ menu (owner's request 2026-10-29): signed-in users send feedback (a sentence,
// more details, a picture), which becomes a ticket on the owner's Notion board (lib/feedback.ts). Opens to
// the button's right like the menu; on a phone, as a sheet along the bottom of the screen.
export function FeedbackButton({ raised }: { raised: boolean }) {
  const status = useSyncStatus()
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState('')
  const [details, setDetails] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [state, setState] = useState<'editing' | 'sending' | 'sent'>('editing')
  const [error, setError] = useState<string | null>(null)
  // Set when a word box opened the form: the word, for the ticket (see WrongWordButton).
  const [context, setContext] = useState<Record<string, string> | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

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

  // A word box's "Wrong definition/word?" opens the form with the sentence started.
  useEffect(
    () =>
      onOpenFeedback((request) => {
        setSummary(request.summary)
        setDetails('')
        setImage(null)
        setPreview(null)
        setContext(request.context)
        setError(null)
        setState('editing')
        setOpen(true)
      }),
    [],
  )

  if (status.state === 'signed-out') return null

  // The picture, and its thumbnail.
  const pick = (file: File | null) => {
    if (preview) URL.revokeObjectURL(preview)
    setImage(file)
    setPreview(file ? URL.createObjectURL(file) : null)
  }

  const reset = () => {
    setSummary('')
    setDetails('')
    pick(null)
    setContext(null)
    setError(null)
    setState('editing')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!summary.trim()) return
    setState('sending')
    setError(null)
    try {
      await sendFeedback({ summary, details, image, context: context ?? undefined })
      setState('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send it. Try again.")
      setState('editing')
    }
  }

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
          if (state === 'sent') reset()
          setOpen((o) => !o)
        }}
      >
        {open ? '✕' : '💬'}
      </button>
      {open && (
        <div id="feedback-panel" className="feedback-panel" role="dialog" aria-label="Send feedback">
          {state === 'sent' ? (
            <div className="feedback-sent">
              <p>
                <strong>Thanks!</strong> Your feedback is on its way.
              </p>
              <div className="feedback-actions">
                <button type="button" className="link" onClick={reset}>
                  Send more
                </button>
                <button type="button" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h2>{context ? 'Wrong definition/word?' : 'Send feedback'}</h2>
              <label className="feedback-field">
                <span>Your feedback, in a sentence</span>
                <input
                  type="text"
                  value={summary}
                  maxLength={MAX_SUMMARY}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder={context ? 'e.g. “bàn” means table, not chair' : 'e.g. Word boxes are hard to close on my phone'}
                  required
                  autoFocus
                />
              </label>
              <label className="feedback-field">
                <span>
                  More details <span className="muted">(optional)</span>
                </span>
                <textarea
                  value={details}
                  maxLength={MAX_DETAILS}
                  rows={4}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={
                    context ? 'What it should be, and the sentence it was in' : 'What happened, what you expected, anything else'
                  }
                />
              </label>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  pick(e.target.files?.[0] ?? null)
                  e.target.value = ''
                }}
              />
              {preview ? (
                <div className="feedback-image">
                  <img src={preview} alt="Your screenshot" />
                  <button type="button" className="link" onClick={() => pick(null)}>
                    Remove picture
                  </button>
                </div>
              ) : (
                <button type="button" className="feedback-attach" onClick={() => fileInput.current?.click()}>
                  📎 Add a screenshot or image
                </button>
              )}
              {error && <p className="error">{error}</p>}
              <div className="feedback-actions">
                <button type="submit" className="primary" disabled={state === 'sending' || !summary.trim()}>
                  {state === 'sending' ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// At the bottom of a word box (Journal and Cheatsheet): opens the feedback form about that word (owner's
// request 2026-10-30), with the same fields as the 💬 button. Signed-in users only, like the form.
export function WrongWordButton({ word, context, onOpen }: { word: string; context?: Record<string, string>; onOpen: () => void }) {
  const status = useSyncStatus()
  if (status.state === 'signed-out') return null
  return (
    <button
      type="button"
      className="link wrong-word"
      onClick={() => {
        onOpen()
        openFeedback({ summary: `Wrong definition/word: “${word}”`, context: { word, ...context } })
      }}
    >
      Wrong definition/word?
    </button>
  )
}
