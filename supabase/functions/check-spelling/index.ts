// Reviews a journal entry with which-dialect's journal review: POST { target, text, checks? } returns its
// Review ({ text, corrected, sentences }). By default the review is a spellchecker: English words get the
// target-language word for the region (or are left out, like "the"), words missing their accents get them,
// and whole English sentences or clauses that follow a sentence frame get the frame's wording. `checks`
// turns on the extra checks the journal offers: other regions' words (`dialect`) and keeping one word for
// "I" (`pronoun-consistency`). Each sentence lists its changes with a reason, hints, the frames it follows,
// and English words with no translation. which-dialect's data is read from this project's Storage (see
// ../_shared/journal.ts).
//
// Each change also gets `options`: every word the checker suggested, best first (the review keeps only the
// first), so the learner can pick another one ("khong" → không, khổng, khống; "market" → chợ, …), each with
// its meanings from the dictionary ("muốn": verb, to want; "muộn": adj, late), so they can tell them apart.
//
// The work is in ../_shared/review.ts, which the web app also runs once the language is downloaded.
//
// Called from the browser with the publishable key (web/src/lib/spelling.ts).

import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import * as wd from 'which-dialect'
import { dataUrl, TARGETS, withCors } from '../_shared/journal.ts'
import { reviewText } from '../_shared/review.ts'

const MAX_LENGTH = 5000

// Kept between requests while the function stays warm, so data files already loaded are reused. The
// reviewer, the checker and the word descriptions share one dictionary per language (see ../_shared/review.ts).
const dictionaries = new Map<string, wd.Dictionary>()
const dictionary = (lang: string) => {
  if (!dictionaries.has(lang)) dictionaries.set(lang, wd.createDictionary({ lang, baseUrl: dataUrl(lang) }))
  return dictionaries.get(lang)!
}
const reviewing = { dictionary, reviewer: wd.createReviewer({ dictionary }), checker: wd.createChecker({ dictionary }) }

const handler = withSupabase({ auth: ['publishable', 'secret'] }, async (req) => {
  const body = await req.json().catch(() => null)
  const target = TARGETS[body?.target]
  const text: unknown = body?.text
  if (!target || typeof text !== 'string' || !text.trim() || text.length > MAX_LENGTH) {
    return Response.json(
      { error: `Send { target: one of ${Object.keys(TARGETS).join(', ')}, text: 1–${MAX_LENGTH} characters, checks? }` },
      { status: 400 },
    )
  }
  return Response.json(await reviewText(wd, reviewing, target, text, body?.checks ?? {}))
})

export default withCors(handler)
