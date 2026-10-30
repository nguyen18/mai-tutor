// Translates English words for the Cheatsheet's "your words" list: POST { target, words } returns
// { entries }, each in the shape of the pre-built files (see ../_shared/entries.ts). Words already
// translated for that language come from the `translations` table; the rest are translated with
// which-dialect and saved there for everyone. which-dialect's data is read from this project's Storage
// (bucket `which-dialect`, filled by `npm run mirror-data` in web/): from the jsDelivr CDN a word took
// ~20 s, since files nobody had asked for recently take ~1 s each.
//
// Called from the browser with the publishable key (web/src/lib/translateWords.ts).

import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import * as wd from 'which-dialect'
import { dataUrl } from '../_shared/data.ts'
import { TARGETS } from '../_shared/journal.ts'
import { makeEntry, type Entry } from '../_shared/entries.ts'

// Bump with the which-dialect import in deno.json, or the data versions (_shared/data.ts): rows from
// another version aren't reused.
const VERSION = '0.5.11+en0.2.1+vi0.2.0+es0.2.3'
const MAX_WORDS = 25
const MAX_WORD_LENGTH = 60
// Words translated at once: each loads several data files, so a few in parallel is faster without
// opening hundreds of requests.
const PARALLEL = 4

// Kept between requests while the function stays warm, so data files already loaded are reused.
const translator = wd.createTranslator({ baseUrl: dataUrl })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const handler = withSupabase({ auth: ['publishable', 'secret'] }, async (req, ctx) => {
  const body = await req.json().catch(() => null)
  const target = TARGETS[body?.target]
  const words: unknown = body?.words
  if (!target || !Array.isArray(words) || !words.length || words.length > MAX_WORDS ||
      !words.every((w) => typeof w === 'string' && w.trim() && w.length <= MAX_WORD_LENGTH)) {
    return Response.json(
      { error: `Send { target: one of ${Object.keys(TARGETS).join(', ')}, words: 1–${MAX_WORDS} English words }` },
      { status: 400 },
    )
  }
  const wanted = [...new Set((words as string[]).map((w) => w.trim()))]

  const { data: rows, error } = await ctx.supabaseAdmin
    .from('translations')
    .select('word, entry')
    .eq('target', body.target)
    .eq('version', VERSION)
    .in('word', wanted)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const entries = new Map<string, Entry>(rows.map((r) => [r.word, r.entry]))

  const missing = wanted.filter((w) => !entries.has(w))
  for (let i = 0; i < missing.length; i += PARALLEL) {
    const batch = await Promise.all(missing.slice(i, i + PARALLEL).map((w) => makeEntry(wd, translator, target, w)))
    batch.forEach((e) => entries.set(e.word, e))
  }
  if (missing.length) {
    const { error: saveError } = await ctx.supabaseAdmin.from('translations').upsert(
      missing.map((w) => ({ target: body.target, word: w, version: VERSION, entry: entries.get(w) })),
    )
    // The translations are still returned; they'll just be made again next time.
    if (saveError) console.error('Saving translations failed:', saveError.message)
  }

  return Response.json({ entries: wanted.map((w) => entries.get(w)) })
})

export default {
  async fetch(req: Request) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    const res = await handler(req)
    const headers = new Headers(res.headers)
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
    return new Response(res.body, { status: res.status, headers })
  },
}
