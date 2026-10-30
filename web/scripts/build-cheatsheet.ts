// Generates the Cheatsheet's meanings and translations with which-dialect.
//
//   npm run cheatsheet                       (from web/; every language in TARGET_LANGUAGES)
//   npm run cheatsheet -- vi-Northern        (just these, by id)
//
// For each language the site can translate into (TARGET_LANGUAGES in src/lib/languages.ts, picked on the
// Settings page) and each word in TOP_100_WORDS, asks which-dialect for the word's English meanings and
// their translations, and writes public/cheatsheet/top-100.<id>.json, e.g. top-100.vi-Southern.json
// (fetched by the Cheatsheet page when it opens, so the ~1 MB of data isn't in the JavaScript bundle).
// Run it again after changing the word list or the languages, or updating which-dialect's data.
//
// which-dialect is on npm; its data loads from the jsDelivr CDN (which-dialect-<lang>). To use a local
// checkout instead (offline, or unpublished data), set WHICH_DIALECT_DATA=<path to which-dialect/packages>.
//
// It also writes the language's pronoun table (dictionary.pronouns() for the dialect; Vietnamese has one)
// for the "who are you talking to?" boxes on the pronoun words.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as wd from 'which-dialect'
import { createDictionary, createTranslator, PRONOUN_PERSONS, type LoadJson, type PronounChoice, type Translator } from 'which-dialect'
import { makeEntry } from '../../supabase/functions/_shared/entries.ts'
import { TARGET_LANGUAGES, type TargetLanguage } from '../src/lib/targets.ts'
import { TOP_100_WORDS } from '../src/lib/topWords.ts'

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOCAL_DATA = process.env.WHICH_DIALECT_DATA ? resolve(process.env.WHICH_DIALECT_DATA) : null
const localLoad = (lang: string): LoadJson | undefined =>
  LOCAL_DATA ? async (path) => JSON.parse(await readFile(join(LOCAL_DATA, lang, 'data', path), 'utf8')) : undefined
const outFile = (target: TargetLanguage) => join(WEB, 'public', 'cheatsheet', `top-100.${target.id}.json`)

async function main() {
  const tr = createTranslator({ load: localLoad })
  console.log(LOCAL_DATA ? `Using local data from ${LOCAL_DATA}` : 'Using which-dialect data from the jsDelivr CDN')
  const ids = process.argv.slice(2)
  const unknown = ids.filter((id) => !TARGET_LANGUAGES.some((t) => t.id === id))
  if (unknown.length) throw new Error(`Unknown language id: ${unknown.join(', ')} (see TARGET_LANGUAGES)`)
  for (const target of TARGET_LANGUAGES.filter((t) => !ids.length || ids.includes(t.id))) await build(tr, target)
}

async function build(tr: Translator, target: TargetLanguage) {
  console.log(`\n== ${target.label} (${target.id}) ==`)
  const words = []
  for (const word of TOP_100_WORDS) {
    const entry = await makeEntry(wd, tr, target, word)
    words.push(entry)
    const first = entry.meanings.find((m) => m.translations.length)
    console.log(`${word.padEnd(10)} ${entry.meanings.length} meanings; default: [${first?.pos}] ${first?.translations.map((t) => t.text).join(', ') || '—'}`)
    if (entry.parts) console.log(`           parts: ${entry.parts.map((p) => `${p.word} → ${'helper' in p ? '(helper)' : p.options.map((o) => o.text).join('/') || '—'}`).join(' + ')}`)
  }

  // The "who are you talking to?" table: one row per relationship, with the words for I, you, he/she,
  // we, plural you and they. Only what the page shows is kept.
  const dictionary = createDictionary({ lang: target.code, load: localLoad(target.code) })
  const cell = (c: PronounChoice) => ({
    word: c.word,
    ...(c.speaker ? { speaker: c.speaker } : {}),
    ...(c.gender ? { gender: c.gender } : {}),
    ...(c.inclusive !== undefined ? { inclusive: c.inclusive } : {}),
    ...(c.labels.length ? { labels: c.labels } : {}),
  })
  const rows = await dictionary.pronouns({ region: target.region })
  const pronounTable = {
    source: 'which-dialect',
    // Mai is about casual chat, so a friend your age leads; the package's neutral default
    // ("general": tôi / bạn) is the default for who you're talking about ("he"/"she"/"they").
    defaultListener: rows.some((r) => r.id === 'friend') ? 'friend' : (rows.find((r) => r.default)?.id ?? rows[0]?.id),
    defaultAbout: rows.find((r) => r.default)?.id ?? rows[0]?.id,
    rows: rows.map((r) => ({
      id: r.id,
      who: r.label,
      ...(r.warning ? { warning: r.warning } : {}),
      cells: Object.fromEntries(PRONOUN_PERSONS.filter((p) => r[p].length).map((p) => [p, r[p].map(cell)])),
    })),
  }
  console.log(`Pronoun table: ${rows.length} relationships`)

  const out = {
    generatedBy: 'which-dialect (scripts/build-cheatsheet.ts)',
    source: 'Wiktionary, via Kaikki.org; CC BY-SA 4.0',
    from: 'en',
    to: target.code,
    ...(target.region ? { toRegion: target.region } : {}),
    // Only languages whose pronouns depend on who you're talking to have one (Vietnamese).
    ...(rows.length ? { pronounTable } : {}),
    words,
  }
  const file = outFile(target)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(out))
  const size = JSON.stringify(out).length
  console.log(`\nWrote ${file} (${(size / 1024).toFixed(0)} KB, ${words.filter((w) => w.meanings.some((m) => m.translations.length)).length}/${words.length} words translated)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
