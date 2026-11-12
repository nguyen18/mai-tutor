import { useCallback, useSyncExternalStore } from 'react'

// Typing the language being learned on an English (QWERTY) keyboard, without switching the device's
// keyboard (owner's request 2026-11-11: "switch between English and the target language keyboard faster").
// A web page can't change the phone's or computer's keyboard, so Mai converts the keys itself while the
// learner's "keyboard" is set to the language: Telex for Vietnamese (the way most Vietnamese type), and
// accent keys after the letter for Spanish. The toggle above the keyboard (phone) or ⌘⇧ / Ctrl+Shift
// (computer) switches between that and plain English typing.

/** What a key does to the text before the cursor: remove that many characters, then put `insert` in. */
export type Edit = { remove: number; insert: string }

export type Typer = {
  /** The language's name in the language, for the toggle ("Tiếng Việt"). */
  name: string
  /** A short reminder of the keys, shown next to the toggle. */
  hint: string
  /** What typing `key` does after `before` (the text before the cursor); null when it's typed as is. */
  key: (before: string, key: string) => Edit | null
}

// ---- Vietnamese: Telex -------------------------------------------------------------------------------
// aa â · aw ă · ee ê · oo ô · ow ơ · uw (or w) ư · dd đ; tones s ´ f ` r ̉ x ~ j ̣, z takes the tone off.
// Typing a key twice undoes it (ass → as), the way Vietnamese keyboards do, so English words can still
// get through. Only words that are spelled like a Vietnamese syllable are touched (no "class" → "clá").

const TONE_KEYS: Record<string, string> = { s: '́', f: '̀', r: '̉', x: '̃', j: '̣' }
const TONE_MARK = /[̣̀́̃̉]/
const VOWELS = 'aăâeêioôơuưy'
const MARKED = 'ăâêôơư'
const CIRCUMFLEX: Record<string, string> = { a: 'â', e: 'ê', o: 'ô' }
const BASE: Record<string, string> = { ă: 'a', â: 'a', ê: 'e', ô: 'o', ơ: 'o', ư: 'u' }
const base = (c: string) => BASE[c] ?? c
// Vietnamese initial consonants (longest first) and final consonants.
const INITIAL = /^(ngh|ng|gh|gi|kh|nh|ph|th|tr|ch|qu|[bcdđghklmnpqrstvx])?/
const FINAL = /^(ch|nh|ng|[cmnpt])?$/

type Letter = { c: string; upper: boolean }
type Syllable = { letters: Letter[]; tone: string; initial: number; vowels: number[]; final: string }

// The word's letters (lowercase, without the tone) and its tone, if it's spelled like a Vietnamese
// syllable (or the start of one).
function parse(word: string): Syllable | null {
  let tone = ''
  const letters: Letter[] = []
  for (const ch of word) {
    const parts = ch.normalize('NFD')
    const mark = [...parts].find((p) => TONE_MARK.test(p))
    if (mark) {
      if (tone) return null
      tone = mark
    }
    const c = [...parts].filter((p) => !TONE_MARK.test(p)).join('').normalize('NFC')
    letters.push({ c: c.toLowerCase(), upper: c !== c.toLowerCase() })
  }
  const plain = letters.map((l) => l.c).join('')
  let initial = plain.match(INITIAL)?.[0].length ?? 0
  // "gi" and "qu" are consonants only when a vowel follows (gì is g + ì).
  if (initial === 2 && /^(gi|qu)/.test(plain) && !(plain[2] && VOWELS.includes(plain[2]))) initial = 1
  let end = initial
  while (end < letters.length && VOWELS.includes(letters[end].c)) end++
  const final = plain.slice(end)
  if (!FINAL.test(final) || (final && end === initial)) return null
  const vowels = Array.from({ length: end - initial }, (_, i) => initial + i)
  return { letters, tone, initial, vowels, final }
}

// Which vowel takes the tone: one with a mark (ơ in ươ), else the last before a final consonant, else the
// middle of three, else the first of two (hòa, thủy: the long-standing spelling).
function toneAt(s: Syllable) {
  const v = s.vowels
  if (!v.length) return -1
  const marked = v.filter((i) => MARKED.includes(s.letters[i].c))
  if (marked.length) return marked[marked.length - 1]
  if (v.length === 1) return v[0]
  if (s.final) return v[v.length - 1]
  return v.length >= 3 ? v[1] : v[0]
}

function write(s: Syllable) {
  const at = s.tone ? toneAt(s) : -1
  return s.letters
    .map((l, i) => {
      const c = (i === at ? l.c + s.tone : l.c).normalize('NFC')
      return l.upper ? c.toUpperCase() : c
    })
    .join('')
}

const isUpper = (key: string) => key !== key.toLowerCase()

function telex(before: string, key: string): Edit | null {
  const k = key.toLowerCase()
  if (!/^[a-zđ]$/.test(k)) return null
  const word = before.match(/[\p{L}\p{M}]*$/u)?.[0] ?? ''
  const s = parse(word)
  if (!s) return null
  const done = (out: Syllable, literal = '') => {
    const text = write(out) + literal
    return text === word + key ? null : { remove: word.length, insert: text }
  }
  const set = (i: number, c: string) => (s.letters[i] = { ...s.letters[i], c })

  if (k in TONE_KEYS) {
    if (!s.vowels.length) return null
    if (s.tone === TONE_KEYS[k]) return done({ ...s, tone: '' }, key)
    return done({ ...s, tone: TONE_KEYS[k] })
  }
  if (k === 'z') return s.tone ? done({ ...s, tone: '' }) : null

  if (k in CIRCUMFLEX) {
    const i = [...s.vowels].reverse().find((v) => base(s.letters[v].c) === k)
    if (i === undefined) return retone(s, word, key)
    if (s.letters[i].c === CIRCUMFLEX[k]) {
      set(i, k)
      return done(s, key)
    }
    set(i, CIRCUMFLEX[k])
    return done(s)
  }

  if (k === 'w') {
    const v = s.vowels
    const at = (c: string) => v.find((i) => base(s.letters[i].c) === c)
    const u = at('u')
    const o = at('o')
    const a = at('a')
    // uo → ươ, oa → oă, then o → ơ, u → ư, a → ă.
    const targets: [number, string][] =
      u !== undefined && o === u + 1
        ? [
            [u, 'ư'],
            [o, 'ơ'],
          ]
        : o !== undefined && a === o + 1
          ? [[a, 'ă']]
          : o !== undefined
            ? [[o, 'ơ']]
            : u !== undefined
              ? [[u, 'ư']]
              : a !== undefined
                ? [[a, 'ă']]
                : []
    if (!targets.length) {
      // No vowel yet: w is ư (tư, như, ư).
      if (v.length || s.final) return null
      return { remove: 0, insert: isUpper(key) ? 'Ư' : 'ư' }
    }
    if (targets.every(([i, c]) => s.letters[i].c === c)) {
      for (const [i] of targets) set(i, base(s.letters[i].c))
      return done(s, key)
    }
    for (const [i, c] of targets) set(i, c)
    return done(s)
  }

  if (k === 'd' && s.letters[0]?.c === 'd' && s.initial === 1) {
    set(0, 'đ')
    return done(s)
  }
  if (k === 'd' && s.letters[0]?.c === 'đ' && s.initial === 1) {
    set(0, 'd')
    return done(s, key)
  }
  return retone(s, word, key)
}

// Any other letter: if the word has a tone, it may belong on another vowel now (hóa + n → hoán).
function retone(s: Syllable, word: string, key: string): Edit | null {
  if (!s.tone) return null
  const next = parse(word + key)
  if (!next) return null
  const text = write(next)
  return text === word + key ? null : { remove: word.length, insert: text }
}

// ---- Spanish: the accent after the letter ------------------------------------------------------------
// a' á (any vowel) · n~ ñ · u" ü. Typing the key again undoes it (á' → a').

const ACUTE: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' }
const SPANISH: Record<string, Record<string, string>> = {
  "'": ACUTE,
  '’': ACUTE,
  '´': ACUTE,
  '~': { n: 'ñ', N: 'Ñ' },
  '"': { u: 'ü', U: 'Ü' },
  '”': { u: 'ü', U: 'Ü' },
}

function spanish(before: string, key: string): Edit | null {
  const table = SPANISH[key]
  const last = before.slice(-1)
  if (!table || !last) return null
  if (table[last]) return { remove: 1, insert: table[last] }
  const plain = Object.keys(table).find((c) => table[c] === last)
  // Undo: back to the plain letter, then the key itself.
  return plain ? { remove: 1, insert: plain + (key === '’' ? "'" : key === '”' ? '"' : key) } : null
}

export const TYPERS: Record<string, Typer> = {
  vi: { name: 'Tiếng Việt', hint: 'aa â · aw ă · ow ơ · uw ư · dd đ · tones s f r x j', key: telex },
  es: { name: 'Español', hint: "a' á · n~ ñ · u\" ü", key: spanish },
}

// ---- Which keyboard is on (this device only) ---------------------------------------------------------

const KEY = 'mai-tutor:typing-target'
const listeners = new Set<() => void>()
let memory = false
function read() {
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch {
    return memory
  }
}
function subscribe(on: () => void) {
  listeners.add(on)
  return () => listeners.delete(on)
}

/** Whether typing is in the language being learned (true) or plain English; remembered on this device. */
export function useTypingTarget(): [boolean, (on: boolean | ((on: boolean) => boolean)) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false)
  const set = useCallback((next: boolean | ((on: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(read()) : next
    memory = value
    try {
      localStorage.setItem(KEY, String(value))
    } catch {
      // Private mode: kept in memory for this visit.
    }
    for (const l of listeners) l()
  }, [])
  return [on, set]
}

/** ⌘⇧ on a Mac, Ctrl+Shift elsewhere. */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
export const SWITCH_KEYS = IS_MAC ? '⌘⇧' : 'Ctrl+Shift'
