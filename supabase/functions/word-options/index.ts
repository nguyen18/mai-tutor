// Alternatives for a word the learner wrote that Mai left as it is, for the journal's word box:
// POST { target, word } returns { word, accents, synonyms }, each a WordOption ({ text, meanings }). The
// word can have several syllables ("hôm nay": check-spelling says which syllables make one word):
//
// - word: the word itself, with its meanings, so the learner can check it means what they meant.
// - accents: words with the same letters and other accents, most common first ("muộn" → muốn, mượn; "hom
//   nay" → "hôm nay"), from which-dialect's dictionary.variants, for languages written in syllables: a real
//   word with the wrong tone passes the spellchecker, and this is how the learner catches it.
// - synonyms: other words with the same meaning from the dictionary, often another region's word
//   ("ngô" → "bắp").
//
// POST { target, words: [...] } (up to MAX_WORDS) returns { results: { [word]: { word, accents, synonyms } } }
// for all of them at once: the journal fetches a whole entry's words in the background, so a tap on a
// word opens without waiting (owner's report 2026-10-22: lookups were slow). Invalid words are left out.
//
// Called from the browser with the publishable key (web/src/lib/wordOptions.ts).

import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import * as wd from 'which-dialect'
import { dataUrl, TARGETS, withCors } from '../_shared/journal.ts'
import { describeWord } from '../_shared/words.ts'

const MAX_WORD_LENGTH = 60
const MAX_WORDS = 40
// Words looked up at once in a batch.
const BATCH_CONCURRENCY = 6
const MAX_ACCENTS = 5
const MAX_SYNONYMS = 6
// Synonyms are read from this many of the word's first senses.
const SYNONYM_SENSES = 3

const dictionaries = new Map<string, wd.Dictionary>()
const dictionary = (lang: string) => {
  if (!dictionaries.has(lang)) dictionaries.set(lang, wd.createDictionary({ lang, baseUrl: dataUrl(lang) }))
  return dictionaries.get(lang)!
}

const validWord = (word: unknown): word is string =>
  typeof word === 'string' && Boolean(word.trim()) && word.length <= MAX_WORD_LENGTH

async function optionsFor(dict: wd.Dictionary, allRegions: number, word: string) {
  const lower = word.trim().normalize('NFC').toLowerCase()
  const [variants, entries] = await Promise.all([
    dict.variants(lower, { limit: MAX_ACCENTS }),
    dict.lookup(lower).catch(() => []),
  ])
  const describe = (text: string) => describeWord(dict, wd.posName, text, allRegions)
  const accentWords = variants.map((v) => v.word)

  const synonymWords = [
    ...new Set(
      entries.flatMap((e) => e.senses.slice(0, SYNONYM_SENSES).flatMap((s) => s.synonyms ?? [])).filter((s) => s.toLowerCase() !== lower),
    ),
  ].slice(0, MAX_SYNONYMS)

  const [self, accents, synonyms] = await Promise.all([
    describe(lower),
    Promise.all(accentWords.map(describe)),
    Promise.all(synonymWords.map(describe)),
  ])
  // Only words with a meaning to show.
  return {
    word: self,
    accents: accents.filter((a) => a.meanings.length),
    synonyms: synonyms.filter((s) => s.meanings.length),
  }
}

const handler = withSupabase({ auth: ['publishable', 'secret'] }, async (req) => {
  const body = await req.json().catch(() => null)
  const target = TARGETS[body?.target]
  const words: unknown = body?.words
  const batch = Array.isArray(words) && words.length > 0 && words.length <= MAX_WORDS
  if (!target || !(batch || validWord(body?.word))) {
    return Response.json(
      {
        error: `Send { target: one of ${Object.keys(TARGETS).join(', ')}, word: 1–${MAX_WORD_LENGTH} characters } or { target, words: up to ${MAX_WORDS} of them }`,
      },
      { status: 400 },
    )
  }
  const dict = dictionary(target.code)
  const allRegions = (await dict.meta()).regions.length
  if (!batch) return Response.json(await optionsFor(dict, allRegions, body.word))

  const todo = [...new Set((words as unknown[]).filter(validWord))]
  const results: Record<string, Awaited<ReturnType<typeof optionsFor>>> = {}
  const worker = async () => {
    for (let word = todo.shift(); word !== undefined; word = todo.shift()) {
      // One word failing doesn't fail the rest: it's left out, and the app asks again when it's tapped.
      const options = await optionsFor(dict, allRegions, word).catch(() => null)
      if (options) results[word] = options
    }
  }
  await Promise.all(Array.from({ length: BATCH_CONCURRENCY }, worker))
  return Response.json({ results })
})

export default withCors(handler)
