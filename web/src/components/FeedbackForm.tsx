import { useRef, useState, type FormEvent } from 'react'
import { MAX_DETAILS, MAX_SUMMARY, sendFeedback, type FeedbackKind } from '../lib/feedback'

export type FeedbackState = 'editing' | 'sending' | 'sent'

// The feedback form (a sentence, more details, a picture) and its "Thanks!", sent as a ticket to the
// owner's Notion board (lib/feedback.ts). Used by the 💬 button's panel and by a word box's
// "Wrong definition/word?" pop-up (WordFeedback.tsx), each with its own draft.
export function FeedbackForm({
  heading,
  kind = 'general',
  initialSummary = '',
  context,
  detailsRequired = false,
  summaryPlaceholder,
  detailsPlaceholder,
  onStateChange,
  onClose,
}: {
  heading: string
  // The ticket's Issue on the board.
  kind?: FeedbackKind
  initialSummary?: string
  // Extra lines for the ticket (the word a pop-up is about).
  context?: Record<string, string>
  detailsRequired?: boolean
  summaryPlaceholder: string
  detailsPlaceholder: string
  onStateChange?: (state: FeedbackState) => void
  onClose: () => void
}) {
  const [summary, setSummary] = useState(initialSummary)
  const [details, setDetails] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [state, setStateOnly] = useState<FeedbackState>('editing')
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const setState = (s: FeedbackState) => {
    setStateOnly(s)
    onStateChange?.(s)
  }

  // The picture, and its thumbnail.
  const pick = (file: File | null) => {
    if (preview) URL.revokeObjectURL(preview)
    setImage(file)
    setPreview(file ? URL.createObjectURL(file) : null)
  }

  const reset = () => {
    setSummary(initialSummary)
    setDetails('')
    pick(null)
    setError(null)
    setState('editing')
  }

  const ready = summary.trim() && (!detailsRequired || details.trim())

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setState('sending')
    setError(null)
    try {
      await sendFeedback({ summary, details, image, context, kind })
      setState('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send it. Try again.")
      setState('editing')
    }
  }

  if (state === 'sent')
    return (
      <div className="feedback-sent">
        <p>
          <strong>Thanks!</strong> Your feedback is on its way.
        </p>
        <div className="feedback-actions">
          <button type="button" className="link" onClick={reset}>
            Send more
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    )

  return (
    <form onSubmit={submit}>
      <h2>{heading}</h2>
      <label className="feedback-field">
        <span>Your feedback, in a sentence</span>
        <input
          type="text"
          value={summary}
          maxLength={MAX_SUMMARY}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={summaryPlaceholder}
          required
          autoFocus={!initialSummary}
        />
      </label>
      <label className="feedback-field">
        <span>
          More details{!detailsRequired && <span className="muted"> (optional)</span>}
        </span>
        <textarea
          value={details}
          maxLength={MAX_DETAILS}
          rows={4}
          onChange={(e) => setDetails(e.target.value)}
          placeholder={detailsPlaceholder}
          required={detailsRequired}
          // With the sentence already written, the details are what's left to fill in.
          autoFocus={Boolean(initialSummary)}
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
        <button type="submit" className="primary" disabled={state === 'sending' || !ready}>
          {state === 'sending' ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  )
}
