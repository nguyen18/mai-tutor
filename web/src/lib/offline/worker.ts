/// <reference lib="webworker" />
// Mai, running in the browser: the backend functions' work (supabase/functions/_shared) on the downloaded
// data, in a worker so a check doesn't freeze the page. The page talks to it through ./client.ts.
//
// Data files are read from the device (./store.ts) and kept in memory for the visit by which-dialect's
// dictionaries; a file that isn't stored (a download that didn't finish) comes from the backend's Storage,
// like the functions read it.

import { inflateSync } from 'fflate'
import * as wd from 'which-dialect'
import { makeEntry } from '../../../../supabase/functions/_shared/entries.ts'
import { reviewText } from '../../../../supabase/functions/_shared/review.ts'
import { wordAlternatives } from '../../../../supabase/functions/_shared/words.ts'
import { downloadPack } from './download'
import { packId } from './packs'
import { getFile, getPacks, removePack } from './store'

const STORAGE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/which-dialect`
const text = new TextDecoder()

const load = (lang: string): wd.LoadJson => async (path) => {
  const stored = await getFile(`${packId(lang)}/${path}`)
  if (stored) return JSON.parse(text.decode(inflateSync(stored)))
  const res = await fetch(`${STORAGE}/${packId(lang)}/${path}`)
  if (!res.ok) throw new Error(`which-dialect: couldn't load ${lang}/${path} (${res.status})`)
  return res.json()
}

// One dictionary per language, shared by everything below, so each data file is read once per visit.
const dictionaries = new Map<string, wd.Dictionary>()
const dictionary = (lang: string) => {
  if (!dictionaries.has(lang)) dictionaries.set(lang, wd.createDictionary({ lang, load: load(lang) }))
  return dictionaries.get(lang)!
}
const reviewing = { dictionary, reviewer: wd.createReviewer({ dictionary }), checker: wd.createChecker({ dictionary }) }
const translator = wd.createTranslator({ dictionary })
const phrasebook = wd.createPhrasebook({ translator })

export type Target = { code: string; region?: string }
export type Request =
  | { op: 'review'; target: Target; text: string; checks: Record<string, boolean> }
  | { op: 'word-options'; target: Target; words: string[] }
  | { op: 'translate'; target: Target; words: string[] }
  | { op: 'frames'; target: Target; topic?: string }
  | { op: 'download'; lang: string }
  | { op: 'remove'; lang: string }

async function run(req: Request): Promise<unknown> {
  switch (req.op) {
    case 'review':
      return reviewText(wd, reviewing, req.target, req.text, req.checks)
    case 'word-options': {
      const dict = dictionary(req.target.code)
      const allRegions = (await dict.meta()).regions.length
      const results: Record<string, Awaited<ReturnType<typeof wordAlternatives>>> = {}
      for (const word of new Set(req.words)) {
        // One word failing doesn't fail the rest, as in the function.
        const options = await wordAlternatives(dict, wd.posName, word, allRegions).catch(() => null)
        if (options) results[word] = options
      }
      return { results }
    }
    case 'translate': {
      const entries = []
      for (const word of [...new Set(req.words.map((w) => w.trim()))]) entries.push(await makeEntry(wd, translator, req.target, word))
      return { entries }
    }
    case 'frames':
      return { frames: await phrasebook.frames({ lang: req.target.code, region: req.target.region, topic: req.topic }) }
    case 'download':
      return downloadPack(req.lang, (progress) => self.postMessage({ progress }))
    case 'remove':
      for (const pack of await getPacks()) if (pack.lang === req.lang) await removePack(pack.id)
      return null
  }
}

self.onmessage = async (e: MessageEvent<{ id: number; req: Request }>) => {
  const { id, req } = e.data
  try {
    self.postMessage({ id, result: await run(req) })
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
