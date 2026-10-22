import { useStored } from './localStore'

// v2 (2026-09-27): picks are per meaning. Picks saved by the old format (one translation per word) are
// left behind in `mai-tutor:cheatsheet-picks` and ignored.
const STORAGE_KEY = 'mai-tutor:cheatsheet-picks-v2'
const NO_PICKS: Picks = {}

// Keys (see meaningKey/optionKey) -> the picked meaning id, or the picked translation's text.
// Anything without a pick shows its first (default) meaning or translation.
export type Picks = Record<string, string>

/** Which meaning of a word the user picked. */
export const meaningKey = (listId: string, word: string) => `meaning|${listId}|${word}`

/** Which translation the user starred for one meaning of a word. */
export const optionKey = (listId: string, word: string, meaningId: string) => `option|${listId}|${word}|${meaningId}`

/**
 * Which translation the user starred for a contraction part ("I" in "I'm"/"I'll"). Keyed by the part
 * word, so one pick applies to every contraction with that part.
 */
export const partKey = (listId: string, part: string) => `part|${listId}|${part.toLowerCase()}`

/**
 * Pronoun table picks, shared by every pronoun word in a list: who you're talking to ('listener', for
 * I/you/we), who you're talking about ('about', for he/she/they), and whether you're a man or a woman
 * ('speaker', for words like "anh"/"chị" toward someone younger).
 */
export const pronounKey = (listId: string, kind: 'listener' | 'about' | 'speaker') => `pronoun-${kind}|${listId}`

export function usePicks() {
  const [picks, setPicks] = useStored<Picks>(STORAGE_KEY, NO_PICKS)

  // Pass null to go back to the default.
  const setPick = (key: string, value: string | null) =>
    setPicks((p) => {
      const next = { ...p }
      if (value === null) delete next[key]
      else next[key] = value
      return next
    })

  return { picks, setPick }
}
