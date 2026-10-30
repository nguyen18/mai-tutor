// Describing words for the journal's word boxes: a word's first few meanings from the dictionary, so the
// learner can tell suggestions apart ("muốn": verb, to want; "muộn": adjective, late). Shared by
// check-spelling (its suggestions) and word-options (a word's alternatives).
//
// which-dialect is passed in (as the dictionary and posName), like _shared/entries.ts, so this file doesn't
// pin its own copy of the package.

import type * as WhichDialect from 'npm:which-dialect@0.5.10'

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
