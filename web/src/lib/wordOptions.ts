import { backendConfigured, callFunction } from './backend'
import type { WordOption } from './spelling'
import type { TargetLanguage } from './languages'

// Alternatives for a word Mai left as it is, for the journal's word box, from the backend's `word-options`
// function: the word's own meanings, the same letters with other accents ("muộn" → muốn, mượn: a real word
// with the wrong tone passes the spellchecker), and other words with the same meaning ("ngô" → bắp).

export type WordAlternatives = { word: WordOption; accents: WordOption[]; synonyms: WordOption[] }

// One request per word per language per visit, or none for words fetched ahead (`loadWordOptionsMany`) or
// saved with the entry (`primeWordOptions`).
const loaded = new Map<string, Promise<WordAlternatives>>()
const keyOf = (target: TargetLanguage, word: string) => `${target.id}|${word.toLowerCase()}`

/** Words' options saved earlier (with a journal entry), so tapping them needs no request. */
export function primeWordOptions(target: TargetLanguage, saved: Record<string, WordAlternatives>) {
  for (const [word, options] of Object.entries(saved)) {
    if (!loaded.has(keyOf(target, word))) loaded.set(keyOf(target, word), Promise.resolve(options))
  }
}

// The function takes up to 40 words per request.
const BATCH = 40

/**
 * Fetches the options of every word not loaded yet, in as few requests as possible, and returns every
 * asked word's options (by lowercase word). Words the backend couldn't look up are left out (a tap asks again).
 */
export async function loadWordOptionsMany(target: TargetLanguage, words: string[]): Promise<Record<string, WordAlternatives>> {
  const out: Record<string, WordAlternatives> = {}
  if (!backendConfigured) return out
  const missing = [...new Set(words.map((w) => w.toLowerCase()))].filter((w) => !loaded.has(keyOf(target, w)))
  for (let i = 0; i < missing.length; i += BATCH) {
    const { results } = await callFunction<{ results: Record<string, WordAlternatives> }>(
      'word-options',
      { target: target.id, words: missing.slice(i, i + BATCH) },
      'Loading other words failed',
    )
    for (const [word, options] of Object.entries(results)) {
      if (!loaded.has(keyOf(target, word))) loaded.set(keyOf(target, word), Promise.resolve(options))
    }
  }
  // Every asked word known by now, including ones loaded earlier in this visit.
  for (const word of new Set(words.map((w) => w.toLowerCase()))) {
    const options = await loaded.get(keyOf(target, word))?.catch(() => undefined)
    if (options) out[word] = options
  }
  return out
}

export function loadWordOptions(target: TargetLanguage, word: string): Promise<WordAlternatives | null> {
  if (!backendConfigured) return Promise.resolve(null)
  const key = keyOf(target, word)
  let options = loaded.get(key)
  if (!options) {
    options = callFunction<WordAlternatives>('word-options', { target: target.id, word }, 'Loading other words failed')
    // A failed load is tried again next time.
    options.catch(() => loaded.delete(key))
    loaded.set(key, options)
  }
  return options
}
