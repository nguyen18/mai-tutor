import { backendConfigured, callFunction } from './backend'
import type { TargetLanguage } from './languages'
import { viaMai } from './offline/client'

// which-dialect's sentence frames, for the journal's frames browser: common sentences with slots, in the
// learner's region ("{place} ở đâu?", Central "{place} ở mô?"). From the backend's `sentence-frames`
// function (supabase/functions/sentence-frames).

export type Frame = {
  id: string
  topic: string
  /** The English way to say it, slots open: "Where is {place}?". */
  en: string
  /** The pattern in the language, slots open: "{place} ở đâu?". */
  text: string
  slots: { name: string; pos: 'noun' | 'verb' | 'adj' }[]
  /** true for frames that can be part of a sentence ("but it was {quality}"). */
  clause?: boolean
}

export const FRAME_TOPICS = [
  { id: 'journal', label: 'Journal' },
  { id: 'feelings', label: 'Feelings' },
  { id: 'questions', label: 'Questions' },
  { id: 'requests', label: 'Requests' },
  { id: 'greetings', label: 'Greetings' },
]

// One request per language per visit: frames don't change.
const loaded = new Map<string, Promise<Frame[]>>()

export function loadFrames(target: TargetLanguage): Promise<Frame[]> {
  if (!backendConfigured) return Promise.resolve([])
  let frames = loaded.get(target.id)
  if (!frames) {
    frames = viaMai(target, { op: 'frames', target }, () =>
      callFunction<{ frames: Frame[] }>('sentence-frames', { target: target.id }, 'Loading sentence frames failed'),
    ).then((r) => r.frames)
    // A failed load is tried again next time.
    frames.catch(() => loaded.delete(target.id))
    loaded.set(target.id, frames)
  }
  return frames
}

/** Where the first slot ("{place}") is in a pattern, to select it after inserting, so typing replaces it. */
export function firstSlot(text: string): { start: number; end: number } | null {
  const m = /\{[^}]+\}/.exec(text)
  return m ? { start: m.index, end: m.index + m[0].length } : null
}
