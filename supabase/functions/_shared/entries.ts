// One Cheatsheet entry (an English word's meanings, translations and contraction parts) from
// which-dialect. Shared by web/scripts/build-cheatsheet.ts (the pre-built files) and the `translate`
// function (any word, on demand), so both produce the same shape (web/src/lib/cheatsheet.ts reads it).
//
// which-dialect is passed in rather than imported: the build script runs in Node (web/node_modules) and
// the function in Deno (npm: import), and this file sits where neither resolves the other's import.

import type * as WhichDialect from 'npm:which-dialect@0.5.10'

type WD = Pick<typeof WhichDialect, 'displayGloss' | 'posName'>
type Translator = WhichDialect.Translator
export type Target = { code: string; region?: string }

const MAX_TRANSLATIONS = 5
const MAX_GLOSS = 140

// Contractions: the words they're made of, so the Cheatsheet can show "I'll = I + will" and combine the
// parts' translations ("tui" + "sẽ" → "tui sẽ").
const IRREGULAR_CONTRACTIONS: Record<string, [string, string]> = {
  "won't": ['will', 'not'], "can't": ['can', 'not'], "shan't": ['shall', 'not'], "ain't": ['am', 'not'], "let's": ['let', 'us'],
}
const CONTRACTION_ENDINGS: [string, string][] = [
  ["n't", 'not'], ["'ll", 'will'], ["'m", 'am'], ["'re", 'are'], ["'ve", 'have'], ["'d", 'would'], ["'s", 'is'],
]
export function contractionParts(word: string): [string, string] | null {
  const w = word.replace(/’/g, "'")
  const irregular = IRREGULAR_CONTRACTIONS[w.toLowerCase()]
  if (irregular) return irregular
  for (const [ending, full] of CONTRACTION_ENDINGS) {
    if (w.toLowerCase().endsWith(ending) && w.length > ending.length) return [w.slice(0, -ending.length), full]
  }
  return null
}

// English "do" in "don't"/"didn't" is a helper verb with no word of its own in Vietnamese, so it isn't
// translated.
const HELPERS = new Set(['do', 'does', 'did'])
// Which sense of each part to translate. Anything not listed is a pronoun ("I", "it", "we"…), translated
// in a casual register (Mai is about casual chat: Southern "tui" for "I") with more options,
// since the right pronoun depends on who you're talking to.
type PartHint = { pos: string; meaning?: string; register?: 'casual' | 'neutral' | 'polite' }
const PRONOUN_HINT: PartHint = { pos: 'pron', register: 'casual' }
const PART_HINTS: Record<string, PartHint> = {
  am: { pos: 'verb', meaning: 'identical equivalent' },
  is: { pos: 'verb', meaning: 'identical equivalent' },
  are: { pos: 'verb', meaning: 'identical equivalent' },
  will: { pos: 'verb', meaning: 'future tense' },
  shall: { pos: 'verb', meaning: 'future tense' },
  would: { pos: 'verb', meaning: 'conditional' },
  have: { pos: 'verb', meaning: 'perfect' },
  can: { pos: 'verb', meaning: 'able' },
  not: { pos: 'adv' },
  that: { pos: 'det', meaning: 'demonstrative' },
  let: { pos: 'verb' },
}
const MAX_PART_OPTIONS = 4
const MAX_PRONOUN_OPTIONS = 6

async function partsOf(tr: Translator, target: Target, word: string) {
  const parts = contractionParts(word)
  if (!parts) return undefined
  return Promise.all(
    parts.map(async (part) => {
      if (HELPERS.has(part.toLowerCase())) return { word: part, helper: true, options: [] }
      const hint = PART_HINTS[part.toLowerCase()] ?? PRONOUN_HINT
      const limit = hint === PRONOUN_HINT ? MAX_PRONOUN_OPTIONS : MAX_PART_OPTIONS
      const [g] = await tr.translate(part, { from: 'en', to: target.code, toRegion: target.region, limit, ...hint })
      return {
        word: part,
        options: (g?.translations ?? []).map((t) => ({ text: t.word, gloss: cut(t.gloss), ...(t.labels.length ? { labels: t.labels } : {}) })),
      }
    }),
  )
}

const cut = (s: string, n = MAX_GLOSS) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
// Stable id for a meaning, so a user's picked meaning survives regenerating. Definitions can share a
// long opening ("The speaker or writer, referred to as the grammatical subject/object"), so the id uses
// up to 80 characters, and `unique` adds -2, -3… if two meanings of a word still match.
const meaningId = (pos: string, gloss: string) =>
  `${pos}:${gloss.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)}`
function unique(ids: string[]): string[] {
  const seen = new Map<string, number>()
  return ids.map((id) => {
    const n = (seen.get(id) ?? 0) + 1
    seen.set(id, n)
    return n === 1 ? id : `${id}-${n}`
  })
}

/** A word's Cheatsheet entry: every meaning (owner's request: no cap), its translations, and its parts. */
export async function makeEntry(wd: WD, tr: Translator, target: Target, word: string) {
  const options = { from: 'en', to: target.code, toRegion: target.region, limit: MAX_TRANSLATIONS, allSenses: true }
  let groups = await tr.translate(word, options)
  // Word lists are lowercase, but the dictionary capitalizes names and days ("sunday" → "Sunday").
  if (!groups.length && /^\p{Ll}/u.test(word)) groups = await tr.translate(word[0].toUpperCase() + word.slice(1), options)
  const meanings = groups.map((g) => ({
    id: meaningId(g.source.pos, wd.displayGloss(g.source.glosses)),
    pos: g.source.pos,
    posName: wd.posName(g.source.pos),
    gloss: cut(wd.displayGloss(g.source.glosses)),
    ...(g.source.via ? { via: g.source.via } : {}),
    ...(g.source.labels.length ? { labels: g.source.labels } : {}),
    ...(g.source.examples?.[0] ? { example: cut(g.source.examples[0].text, 160) } : {}),
    translations: g.translations.map((t) => ({
      text: t.word,
      gloss: cut(t.gloss),
      ...(t.regionTagged ? { regions: t.regions } : {}),
      ...(t.labels.length ? { labels: t.labels } : {}),
      ...(t.examples?.[0]
        ? { example: { text: cut(t.examples[0].text, 160), ...(t.examples[0].translation ? { translation: cut(t.examples[0].translation, 160) } : {}) } }
        : {}),
    })),
  }))
  const ids = unique(meanings.map((m) => m.id))
  meanings.forEach((m, i) => (m.id = ids[i]))
  const parts = await partsOf(tr, target, word)
  return { word, meanings, ...(parts ? { parts } : {}) }
}

export type Entry = Awaited<ReturnType<typeof makeEntry>>
