// Describing words for the journal's word boxes: a word's first few meanings from the dictionary, so the
// learner can tell suggestions apart ("muốn": verb, to want; "muộn": adjective, late). Shared by
// check-spelling (its suggestions) and word-options (a word's alternatives).
//
// which-dialect is passed in (as the dictionary and posName), like _shared/entries.ts, so this file doesn't
// pin its own copy of the package.

import type * as WhichDialect from 'npm:which-dialect@0.5.14'

export type OptionMeaning = { pos: string; posName: string; gloss: string; regions?: string[]; labels?: string[] }
export type WordOption = { text: string; meanings: OptionMeaning[] }

// How many meanings of a word to show, and definitions per meaning.
const MAX_MEANINGS = 3
const MAX_GLOSSES = 2

/**
 * A word with its first few meanings: part of speech, definition, and its regions and labels when the
 * dictionary tags them (regions only when they're some of the language's, not all). `allRegions` is how
 * many regions the language has.
 */
export async function describeWord(
  dictionary: WhichDialect.Dictionary,
  posName: (code: string) => string,
  text: string,
  allRegions: number,
): Promise<WordOption> {
  const entries = await dictionary.lookup(text.toLowerCase()).catch(() => [])
  const meanings: OptionMeaning[] = []
  for (const entry of entries) {
    for (const sense of entry.senses) {
      if (meanings.length >= MAX_MEANINGS) break
      const gloss = sense.glosses.slice(0, MAX_GLOSSES).join('; ')
      if (!gloss) continue
      meanings.push({
        pos: entry.pos,
        posName: posName(entry.pos),
        gloss,
        ...(sense.regionTagged && sense.regions.length < allRegions ? { regions: sense.regions } : {}),
        ...(sense.labels.length ? { labels: sense.labels } : {}),
      })
    }
  }
  return { text, meanings }
}

// A word box's alternatives (the `word-options` function, and the web app once the language is downloaded).
const MAX_ACCENTS = 5
const MAX_SYNONYMS = 6
// Synonyms are read from this many of the word's first senses.
const SYNONYM_SENSES = 3

export type WordAlternatives = { word: WordOption; accents: WordOption[]; synonyms: WordOption[] }

/**
 * A word the learner wrote, with its meanings; words with the same letters and other accents, most common
 * first ("muộn" → muốn, mượn), for languages written in syllables; and other words with the same meaning
 * from the dictionary, often another region's ("ngô" → "bắp"). Only words with a meaning to show.
 */
export async function wordAlternatives(
  dictionary: WhichDialect.Dictionary,
  posName: (code: string) => string,
  word: string,
  allRegions: number,
): Promise<WordAlternatives> {
  const lower = word.trim().normalize('NFC').toLowerCase()
  const [variants, entries] = await Promise.all([
    dictionary.variants(lower, { limit: MAX_ACCENTS }),
    dictionary.lookup(lower).catch(() => []),
  ])
  const describe = (text: string) => describeWord(dictionary, posName, text, allRegions)
  const synonymWords = [
    ...new Set(
      entries.flatMap((e) => e.senses.slice(0, SYNONYM_SENSES).flatMap((s) => s.synonyms ?? [])).filter((s) => s.toLowerCase() !== lower),
    ),
  ].slice(0, MAX_SYNONYMS)
  const [self, accents, synonyms] = await Promise.all([
    describe(lower),
    Promise.all(variants.map((v) => describe(v.word))),
    Promise.all(synonymWords.map(describe)),
  ])
  return {
    word: self,
    accents: accents.filter((a) => a.meanings.length),
    synonyms: synonyms.filter((s) => s.meanings.length),
  }
}
