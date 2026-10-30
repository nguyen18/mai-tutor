import { supabase } from './backend'

// Sends feedback to the `feedback` function (supabase/functions/feedback), which saves it and makes it a
// ticket on the owner's Notion board. Signed-in users only: the function reads who sent it from their
// access token.

export const MAX_SUMMARY = 200
export const MAX_DETAILS = 5000
// Pictures are shrunk to fit this many pixels on their longer side, as a JPEG: quick to send from a phone,
// and an iPhone's HEIC photo becomes something Notion shows.
const MAX_IMAGE_SIDE = 2000
const JPEG_QUALITY = 0.85

/** The image as a JPEG at most MAX_IMAGE_SIDE pixels on a side; the file as it is if it can't be drawn. */
export async function shrinkImage(file: File): Promise<File> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    // JPEG has no transparency: transparent screenshots get a white background, not black.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob) return file
    const name = file.name.replace(/\.[^.]*$/, '') || 'screenshot'
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Opening the feedback form from elsewhere: a word box's "Wrong definition/word?" button (owner's request
// 2026-10-30) opens its own pop-up (components/WordFeedback.tsx) with the sentence started and the word
// in the ticket's context.
export type FeedbackKind = 'general' | 'word'
export type FeedbackRequest = { summary: string; context: Record<string, string> }
const OPEN_EVENT = 'mai:open-feedback'

export function openFeedback(request: FeedbackRequest) {
  window.dispatchEvent(new CustomEvent<FeedbackRequest>(OPEN_EVENT, { detail: request }))
}

export function onOpenFeedback(listener: (request: FeedbackRequest) => void): () => void {
  const handle = (e: Event) => listener((e as CustomEvent<FeedbackRequest>).detail)
  window.addEventListener(OPEN_EVENT, handle)
  return () => window.removeEventListener(OPEN_EVENT, handle)
}

/** Sends the feedback; resolves with the ticket's URL (null if the ticket is still to be made), throws with a message to show. */
export async function sendFeedback(feedback: {
  summary: string
  details: string
  image: File | null
  context?: Record<string, string>
  // Which form sent it, the ticket's Issue: the 💬 button's or a word box's (WordFeedback.tsx).
  kind?: FeedbackKind
}): Promise<string | null> {
  const client = await supabase()
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in to send feedback.')

  const form = new FormData()
  form.append('summary', feedback.summary.trim())
  form.append('details', feedback.details.trim())
  form.append('kind', feedback.kind ?? 'general')
  if (feedback.image) form.append('image', await shrinkImage(feedback.image))
  form.append(
    'context',
    JSON.stringify({
      ...feedback.context,
      page: window.location.hash || '#/',
      screen: `${window.innerWidth}×${window.innerHeight}`,
      browser: navigator.userAgent,
      sent: new Date().toString(),
    }),
  )

  let res: Response
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/feedback`, {
      method: 'POST',
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` },
      body: form,
    })
  } catch {
    throw new Error("Couldn't send it. Check your connection and try again.")
  }
  const body = (await res.json().catch(() => ({}))) as { ticket?: string | null; error?: string }
  if (!res.ok) throw new Error(body.error ?? `Couldn't send it (${res.status}). Try again.`)
  return body.ticket ?? null
}
