import { useEffect, useState } from 'react'
import { FeedbackForm, type FeedbackState } from './FeedbackForm'
import { onOpenFeedback, openFeedback, type FeedbackRequest } from '../lib/feedback'
import { useSyncStatus } from '../lib/sync'

// "Wrong definition/word?" in word boxes (owner's request 2026-10-30): its own feedback pop-up, apart from
// the 💬 panel so neither changes the other's draft. The sentence starts as "Wrong definition/word: “…”"
// and the details are required.

// At the bottom of a word box (Journal and Cheatsheet, through Popover's `report`). Signed-in users only,
// like the form. Closes the box (which unmounts this button), so the pop-up lives in WordFeedbackDialog.
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

// The pop-up, mounted once in App. Escape or a click outside closes it, unless it's sending.
export function WordFeedbackDialog() {
  const [request, setRequest] = useState<(FeedbackRequest & { id: number }) | null>(null)
  const [state, setState] = useState<FeedbackState>('editing')

  useEffect(() => onOpenFeedback((r) => setRequest((prev) => ({ ...r, id: (prev?.id ?? 0) + 1 }))), [])

  const close = () => {
    if (state === 'sending') return
    setRequest(null)
    setState('editing')
  }

  useEffect(() => {
    if (!request) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (!request) return null
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal word-feedback" role="dialog" aria-modal="true" aria-label="Wrong definition or word">
        <FeedbackForm
          key={request.id}
          heading="Wrong definition/word? Bad definition ordering/ranking?"
          kind="word"
          initialSummary={request.summary}
          context={request.context}
          detailsRequired
          summaryPlaceholder="e.g. Wrong definition/word: “bàn”"
          detailsPlaceholder="What it should be, and the sentence it was in"
          onStateChange={setState}
          onClose={close}
        />
      </div>
    </div>
  )
}
