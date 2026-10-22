import { useEffect, useRef } from 'react'
import { backendConfigured } from './backend'
import type { JournalEntry } from './journal'
import { targetById } from './languages'
import { alignSentence, joinedWordsIn, withAcceptedHints, wordTokens, type SpellingCheck } from './spelling'
import { fetchEntries, primeEntries } from './translateWords'
import { loadWordOptionsMany, primeWordOptions } from './wordOptions'

// Tapping a word in a checked journal entry opens a box that needs the backend (word-options, and translate
// for English words Mai translated): ~0.5–1.3 s a word, several seconds when the function is asleep
// (measured 2026-10-22; owner: "they are pretty slow"). So every word an entry's boxes can show is fetched
// in the background once the entry is checked, in one request per 40 words, and saved on its check
// (`check.lookups`), which syncs with the entry: taps then open at once, on every device and offline.

/** The entry's spelling check, if it's for the entry's current text (and in the current format). */
export function currentCheck(entry: JournalEntry): SpellingCheck | undefined {
  const check = entry.check
  return check?.input === entry.text && check.review && 'extraChecks' in check ? check : undefined
}

/**
 * What the page's word boxes look up, the same way AnnotatedText makes words tappable: words Mai left
 * alone (WordMark), the words of Mai's other corrections (ChangeMark's WordAlternativesBox), and English
 * words Mai translated (TranslationChoices: their entry, and the "Did you mean" accents of the English).
 */
export function lookupsNeeded(check: SpellingCheck): { words: string[]; english: string[] } {
  const words = new Set<string>()
  const english = new Set<string>()
  for (const sentence of withAcceptedHints(check).sentences) {
    for (const seg of alignSentence(sentence)) {
      const change = seg.change
      if (change) {
        if (change.kind === 'foreign-word') {
          english.add(change.from.toLowerCase())
          words.add(change.from.toLowerCase())
        } else if (change.kind !== 'frame' && change.to) {
          words.add(change.to.toLowerCase())
        }
        continue
      }
      for (const t of wordTokens(seg.text, joinedWordsIn(seg.text, sentence))) if (t.word) words.add(t.text.toLowerCase())
    }
  }
  return { words: [...words], english: [...english] }
}

function missingLookups(check: SpellingCheck) {
  const needed = lookupsNeeded(check)
  return {
    words: needed.words.filter((w) => !(w in (check.lookups?.words ?? {}))),
    english: needed.english.filter((w) => !(w in (check.lookups?.english ?? {}))),
  }
}

// Each check is fetched for at most once a visit, failed or not, so a word the backend can't look up isn't
// asked about again and again (a tap still asks).
const attempted = new Set<string>()
const queue: string[] = []
let running = false

/**
 * Fills the word boxes' caches from the entries' saved lookups, and fetches the missing ones in the
 * background, one entry at a time, saving them onto each entry's check.
 */
export function useWordLookups(entries: JournalEntry[] | null, save: (entry: JournalEntry) => Promise<void>) {
  // The latest entries and save, for fetches that finish after the entries changed.
  const latest = useRef({ entries, save })
  useEffect(() => {
    latest.current = { entries, save }
  })

  useEffect(() => {
    if (!entries) return
    for (const entry of entries) {
      const check = currentCheck(entry)
      if (!check?.lookups) continue
      const target = targetById(entry.targetId)
      primeWordOptions(target, check.lookups.words)
      primeEntries(target, check.lookups.english)
    }
    if (!backendConfigured) return
    for (const entry of entries) {
      const check = currentCheck(entry)
      if (!check) continue
      const key = `${entry.id}|${check.checkedAt}`
      const missing = missingLookups(check)
      if (attempted.has(key) || (!missing.words.length && !missing.english.length)) continue
      attempted.add(key)
      queue.push(entry.id)
    }
    void drain()

    async function drain() {
      if (running) return
      running = true
      try {
        for (let id = queue.shift(); id; id = queue.shift()) await fetchFor(id).catch(() => {})
      } finally {
        running = false
      }
    }

    async function fetchFor(id: string) {
      const entry = latest.current.entries?.find((e) => e.id === id)
      const check = entry && currentCheck(entry)
      if (!check) return
      const target = targetById(entry.targetId)
      const missing = missingLookups(check)
      const [words, english] = await Promise.all([
        loadWordOptionsMany(target, missing.words),
        fetchEntries(target, missing.english),
      ])
      // Saved onto the entry as it is now, unless it was checked again meanwhile.
      const now = latest.current.entries?.find((e) => e.id === id)
      const nowCheck = now && currentCheck(now)
      if (!now || !nowCheck || nowCheck.checkedAt !== check.checkedAt) return
      if (!Object.keys(words).length && !Object.keys(english).length) return
      await latest.current.save({
        ...now,
        check: {
          ...nowCheck,
          lookups: {
            words: { ...nowCheck.lookups?.words, ...words },
            english: { ...nowCheck.lookups?.english, ...english },
          },
        },
      })
    }
  }, [entries])
}
