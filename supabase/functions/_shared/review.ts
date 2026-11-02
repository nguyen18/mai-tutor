// Mai's check of a journal entry: which-dialect's journal review, plus what the journal shows on top of it.
// Run by the `check-spelling` function and, once the language is downloaded, by the web app itself
// (web/src/lib/offline/worker.ts), so both give the same result.
//
// By default the review is a spellchecker: English words get the target-language word for the region (or
// are left out, like "the"), words missing their accents get them, and whole English sentences or clauses
// that follow a sentence frame get the frame's wording. `checks` turns on the extra checks the journal
// offers: other regions' words (`dialect`) and keeping one word for "I" (`pronoun-consistency`).
//
// Each change also gets `options`: every word the checker suggested, best first (the review keeps only the
// first), so the learner can pick another one ("khong" → không, khổng, khống; "market" → chợ, …), each with
// its meanings from the dictionary ("muốn": verb, to want; "muộn": adj, late), so they can tell them apart.
// Each sentence gets `words`: its words of several syllables ("hôm nay"), so the journal treats them as one.
//
// which-dialect is passed in, like ./entries.ts and ./words.ts, so this file doesn't pin its own copy.

import type * as WhichDialect from 'npm:which-dialect@0.5.15'
import { describeWord, type WordOption } from './words.ts'

type WD = Pick<typeof WhichDialect, 'posName'>
export type Target = { code: string; region?: string }

// The opt-in checks the journal's setting can turn on; others stay off (a journal has no listener).
export const OPTIONAL_CHECKS = ['dialect', 'pronoun-consistency'] as const

/** What a review needs. The reviewer, the checker and the dictionary should share one dictionary per
 *  language, so each data file is parsed once per check (separate ones parsed everything twice, and a
 *  Spanish entry ran out of the functions' CPU, 2026-10-29). */
export type Reviewing = {
  dictionary: (lang: string) => WhichDialect.Dictionary
  reviewer: WhichDialect.Reviewer
  checker: WhichDialect.Checker
}

export async function reviewText(wd: WD, r: Reviewing, target: Target, text: string, requested: Record<string, unknown> = {}) {
  const checks = Object.fromEntries(OPTIONAL_CHECKS.map((rule) => [rule, requested[rule] === true]))
  // No listener: people written about (má, thầy) aren't the person spoken to. English is the learner's language.
  const options = { lang: target.code, region: target.region, base: 'en' }
  const dictionary = r.dictionary(target.code)
  const [review, checked] = await Promise.all([
    r.reviewer.review(text, { ...options, checks }),
    r.checker.check(text, { ...options, rules: { spelling: true, 'foreign-word': true, ...checks } }),
  ])
  // A change's options are the suggestions of the checker issue with the same rule and words, taken in
  // order so a word written twice matches each issue once. Frame changes have none.
  const allRegions = (await dictionary.meta()).regions.length
  const unused = [...checked.issues]
  const described: Promise<void>[] = []
  for (const sentence of review.sentences) {
    for (const change of sentence.changes as (WhichDialect.ReviewChange & { options?: WordOption[] })[]) {
      const at = unused.findIndex((i) => i.rule === change.kind && i.text === change.from)
      if (at < 0) continue
      const [issue] = unused.splice(at, 1)
      const words = issue.suggestions.filter(Boolean)
      if (words.length < 2) continue
      // English words' meanings come from their Cheatsheet entry on the web side.
      if (change.kind === 'foreign-word') change.options = words.map((text) => ({ text, meanings: [] }))
      else
        described.push(
          Promise.all(words.map((w) => describeWord(dictionary, wd.posName, w, allRegions))).then((o) => void (change.options = o)),
        )
    }
  }
  await Promise.all(described)
  // Each sentence's words of several syllables, as offsets into its corrected text.
  await Promise.all(
    review.sentences.map(async (sentence) => {
      const words = await dictionary.segment(sentence.corrected)
      ;(sentence as typeof sentence & { words?: { start: number; end: number }[] }).words = words
        .filter((w) => w.entries.length && /\s/.test(w.text))
        .map((w) => ({ start: w.start, end: w.end }))
    }),
  )
  return review
}
