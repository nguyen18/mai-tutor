import type { CheatsheetEntry } from './cheatsheet'
import type { WordAlternatives } from './wordOptions'
import { callFunction } from './backend'
import type { TargetLanguage } from './languages'
import { viaMai } from './offline/client'

// Corrections for journal entries, by the backend's `check-spelling` function
// (supabase/functions/check-spelling), which runs which-dialect's journal review. By default it's a
// spellchecker: English words get the target-language word for the region, missing accents are added, and
// English sentences or clauses that follow a sentence frame get the frame's wording. The journal's setting
// can turn on two more checks (other regions' words, one word for "I"). Corrections are word by word, so
// word order and grammar aren't fixed, and no change means nothing was found, not that it's certainly right.

// which-dialect's ReviewChange: `to` is '' when a word is left out (Vietnamese has no "the"). `options`
// (added by check-spelling) lists every word the checker suggested, best first, when there's more than one,
// each with its first few meanings from the dictionary (none for English words: the web side shows their
// Cheatsheet entry instead).
export type OptionMeaning = { pos: string; posName: string; gloss: string; regions?: string[]; labels?: string[] }
export type WordOption = { text: string; meanings: OptionMeaning[] }
export type ReviewChange = { from: string; to: string; why: string; kind: string; options?: WordOption[] }
export type ReviewHint = { rule: string; text: string; message: string; suggestions: string[] }
export type ReviewFrame = { id: string; en: string; text: string }

export type ReviewSentence = {
  /** Offsets in Review.text. */
  start: number
  end: number
  original: string
  corrected: string
  changes: ReviewChange[]
  /** Suggestions that weren't applied, e.g. "end with ạ". */
  hints: ReviewHint[]
  /** Sentence frames the sentence follows or was built from: the frame's English and its pattern. */
  frames: ReviewFrame[]
  /** English words with no translation, left as written. */
  unchecked: string[]
  /** Words of several syllables in `corrected` ("hôm nay"), as offsets: added by check-spelling. */
  words?: { start: number; end: number }[]
}

export type Review = {
  /** The entry in Unicode NFC form; sentence offsets refer to it. */
  text: string
  corrected: string
  sentences: ReviewSentence[]
}

export type SpellingCheck = {
  /** The text that was sent, to tell whether the entry changed since. */
  input: string
  /** Whether the extra checks (regional words, one word for "I") were on. */
  extraChecks: boolean
  review: Review
  /** Hints the learner chose to use, as `${sentence}:${hint}` indexes; applied to the corrected copy. */
  acceptedHints?: string[]
  /** Words the learner picked: instead of a change's `to` (by `changeKey`), or instead of a word Mai left
   *  alone (by `keptWordKey`). */
  wordPicks?: Record<string, string>
  checkedAt: string
  /**
   * What the page's word boxes show, fetched in the background after the check and saved here so a tap
   * opens without a request (lib/wordLookups.ts): each tappable word's options by lowercase word, and the
   * Cheatsheet entry of each English word Mai translated (null: none).
   */
  lookups?: { words: Record<string, WordAlternatives>; english: Record<string, CheatsheetEntry | null> }
  /** Which Mai checked it (CHECK_VERSION); entries checked by an older one are checked again. */
  version?: string
  /** Words the learner highlighted as one phrase (held and dragged over), with Mai's reading of them. */
  phrases?: HeldPhrase[]
}

/**
 * A highlighted phrase: offsets `a`–`b` in `review.text`, the learner's words there, and how Mai reads them
 * as one piece (`reading`, once she has: "den tu" → "đến từ"; the learner may pick another).
 */
export type HeldPhrase = {
  a: number
  b: number
  text: string
  reading?: string
  /**
   * The reading's words, the dictionary's words of several syllables kept whole ("đi", "ăn kèm"): its box
   * shows each one's meaning and choices when the phrase as a whole has none.
   */
  parts?: string[]
}

/** A checked text's words, as the page shows them: words of several syllables whole ("hôm nay"). */
export function reviewWords(review: Review): string[] {
  return review.sentences.flatMap((s) => wordTokens(s.corrected, s.words ?? []).filter((t) => t.word).map((t) => t.text))
}

/**
 * The which-dialect version the checks run on: the functions' deno.json pins and web/package.json. Bump it
 * with them; entries checked by another version are checked again in the background (Journal), keeping the
 * learner's picks where the sentence didn't change (carryOver).
 */
export const CHECK_VERSION = 'which-dialect 0.5.14'

export async function checkSpelling(target: TargetLanguage, input: string, extraChecks: boolean): Promise<SpellingCheck> {
  // The pronoun check needs the language's pronoun table (TargetLanguage.pronouns).
  const checks = extraChecks ? { dialect: true, ...(target.pronouns ? { 'pronoun-consistency': true } : {}) } : {}
  // On the device when the language is downloaded (lib/offline), else the backend's check-spelling.
  const review = await viaMai<Review>(target, { op: 'review', target, text: input, checks }, () =>
    callFunction<Review>('check-spelling', { target: target.id, text: input, checks }, 'Checking the spelling failed'),
  )
  return { input, extraChecks, review, checkedAt: new Date().toISOString(), version: CHECK_VERSION }
}

/**
 * A new check of an entry with the learner's choices from its old one: accepted hints and word picks, in
 * sentences whose words didn't change, matched to the same change (by its words) or hint (by its words
 * and rule) in the new check, and kept words by their place in the sentence; highlighted phrases whose
 * words are where they were.
 */
export function carryOver(old: SpellingCheck | undefined, next: SpellingCheck): SpellingCheck {
  if (!old) return next
  const before = old.review.sentences
  const after = next.review.sentences
  const same = (si: number) => before[si] !== undefined && after[si] !== undefined && before[si].original === after[si].original
  const wordPicks: Record<string, string> = {}
  for (const [key, word] of Object.entries(old.wordPicks ?? {})) {
    const kept = /^(\d+)@(\d+)$/.exec(key)
    if (kept) {
      if (same(Number(kept[1]))) wordPicks[key] = word
      continue
    }
    const [si, ci] = key.split(':').map(Number)
    const change = same(si) ? before[si].changes[ci] : undefined
    const at = change ? after[si].changes.findIndex((c) => c.from === change.from) : -1
    if (at >= 0) wordPicks[changeKey(si, at)] = word
  }
  const acceptedHints = (old.acceptedHints ?? []).flatMap((key) => {
    const [si, hi] = key.split(':').map(Number)
    const hint = same(si) ? before[si].hints[hi] : undefined
    const at = hint ? after[si].hints.findIndex((h) => h.text === hint.text && h.rule === hint.rule) : -1
    return at >= 0 ? [`${si}:${at}`] : []
  })
  // Highlighted phrases whose words are still in the same place.
  const phrases = (old.phrases ?? []).filter((p) => next.review.text.slice(p.a, p.b) === p.text)
  return {
    ...next,
    ...(Object.keys(wordPicks).length ? { wordPicks } : {}),
    ...(acceptedHints.length ? { acceptedHints } : {}),
    ...(phrases.length ? { phrases } : {}),
  }
}

/** How each kind of change is named and colored (`data-kind` in CSS). */
export const CHANGE_KINDS: Record<string, { label: string; color: string }> = {
  spelling: { label: 'Accents and spelling', color: 'spelling' },
  'foreign-word': { label: 'English word', color: 'foreign' },
  frame: { label: 'Sentence frame', color: 'frame' },
  dialect: { label: 'Regional word', color: 'dialect' },
  'pronoun-consistency': { label: 'Pronoun', color: 'pronoun' },
  'pronoun-pair': { label: 'Pronoun', color: 'pronoun' },
  'pronoun-relationship': { label: 'Pronoun', color: 'pronoun' },
  'polite-ending': { label: 'Politeness', color: 'pronoun' },
}
export const kindOf = (kind: string) => CHANGE_KINDS[kind] ?? { label: 'Correction', color: 'spelling' }

/**
 * The review with the learner's accepted hints applied: each one replaces its word in the sentence's
 * corrected text with its first suggestion and becomes a change, so it's highlighted like the others.
 */
export function withAcceptedHints(check: SpellingCheck): Review {
  const accepted = new Set(check.acceptedHints ?? [])
  if (!accepted.size) return check.review
  const sentences = check.review.sentences.map((s, si) => {
    let corrected = s.corrected
    const changes = [...s.changes]
    s.hints.forEach((h, hi) => {
      const to = h.suggestions[0]
      const at = to === undefined ? -1 : corrected.lastIndexOf(h.text)
      if (!accepted.has(`${si}:${hi}`) || at < 0) return
      corrected = corrected.slice(0, at) + to + corrected.slice(at + h.text.length)
      changes.push({ from: h.text, to, why: h.message, kind: h.rule })
    })
    return { ...s, corrected, changes }
  })
  let corrected = ''
  let at = 0
  for (const s of sentences) {
    corrected += check.review.text.slice(at, s.start) + s.corrected
    at = s.end
  }
  return { ...check.review, corrected: corrected + check.review.text.slice(at), sentences }
}

/** A run of the corrected entry; `change` is set on the words a change put there. */
export type Piece = { text: string; change?: ReviewChange }

const isLetter = (ch: string | undefined) => !!ch && /[\p{L}\p{M}\p{N}]/u.test(ch)

/**
 * A corrected sentence in pieces, each change's words marked with the change. The review gives each change's
 * `from` and `to` but not where `to` landed in the corrected sentence, so each is placed at the occurrence of
 * `to` (as whole words) nearest to where `from` was in the original, longest first so phrases aren't split.
 */
export function sentencePieces(s: ReviewSentence): Piece[] {
  const text = s.corrected
  const placed: { start: number; end: number; change: ReviewChange }[] = []
  const free = (start: number, end: number) => placed.every((p) => end <= p.start || start >= p.end)
  const order = s.changes.filter((c) => c.to).sort((a, b) => b.to.length - a.to.length)
  for (const change of order) {
    const from = s.original.indexOf(change.from)
    const expected = from < 0 ? 0 : (from / Math.max(1, s.original.length)) * text.length
    let best = -1
    for (let i = text.indexOf(change.to); i >= 0; i = text.indexOf(change.to, i + 1)) {
      const end = i + change.to.length
      if (isLetter(text[i - 1]) || isLetter(text[end]) || !free(i, end)) continue
      if (best < 0 || Math.abs(i - expected) < Math.abs(best - expected)) best = i
    }
    if (best >= 0) placed.push({ start: best, end: best + change.to.length, change })
  }
  placed.sort((a, b) => a.start - b.start)
  const out: Piece[] = []
  let at = 0
  for (const p of placed) {
    if (p.start > at) out.push({ text: text.slice(at, p.start) })
    out.push({ text: text.slice(p.start, p.end), change: p.change })
    at = p.end
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

/** A hint with its key (`${sentence}:${hint}`), for accepting it. */
export type KeyedHint = ReviewHint & { key: string }

/** Every change and hint of the review, gathered across sentences. */
export function reviewNotes(review: Review) {
  return {
    changes: review.sentences.flatMap((s) => s.changes),
    hints: review.sentences.flatMap((s, si) => s.hints.map((h, hi): KeyedHint => ({ ...h, key: `${si}:${hi}` }))),
    unchecked: review.sentences.flatMap((s) => s.unchecked),
  }
}

/** A change's key for `wordPicks`: its sentence and its place in that sentence's changes. */
export const changeKey = (sentence: number, change: number) => `${sentence}:${change}`

/** The word to show for a change: the learner's pick (keeping a capital, like the review's), or its `to`. */
export function shownWord(change: ReviewChange, pick: string | undefined): string {
  return pick === undefined ? change.to : keepCapital(change.to, pick)
}

/**
 * The `wordPicks` keys of the words inside `range` of the checked text (offsets into `review.text`): changes
 * by where their words are, and kept words by their offset.
 */
export function pickKeysIn(check: SpellingCheck, range: { a: number; b: number }): string[] {
  const review = withAcceptedHints(check)
  const keys: string[] = []
  review.sentences.forEach((sentence, si) => {
    for (const seg of alignSentence(sentence)) {
      const a = sentence.start + seg.start
      if (seg.change && a >= range.a && a + seg.text.length <= range.b) keys.push(changeKey(si, sentence.changes.indexOf(seg.change)))
    }
    for (const key of Object.keys(check.wordPicks ?? {})) {
      const kept = /^(\d+)@(\d+)$/.exec(key)
      if (kept && Number(kept[1]) === si && sentence.start + Number(kept[2]) >= range.a && sentence.start + Number(kept[2]) < range.b) keys.push(key)
    }
  })
  return keys
}

/** A key for `wordPicks` on a word Mai left alone: its sentence and where it starts in the corrected sentence. */
export const keptWordKey = (sentence: number, offset: number) => `${sentence}@${offset}`

/**
 * Words and the runs between them, with offsets: the words Mai left alone become hoverable. `joined` are
 * words of several syllables (offsets into `text`), which stay one word ("hôm nay"), not "hôm" + "nay".
 */
export function wordTokens(text: string, joined: { start: number; end: number }[] = []): { text: string; start: number; word: boolean }[] {
  const tokens = [...text.matchAll(/[\p{L}\p{M}\p{N}'’]+|[^\p{L}\p{M}\p{N}'’]+/gu)].map((m) => ({
    text: m[0],
    start: m.index!,
    word: /\p{L}/u.test(m[0]),
  }))
  const out: typeof tokens = []
  for (let i = 0; i < tokens.length; i++) {
    const word = joined.find((w) => w.start === tokens[i].start)
    if (!word) {
      out.push(tokens[i])
      continue
    }
    // Take the tokens up to the word's end as one word.
    let j = i
    while (j + 1 < tokens.length && tokens[j + 1].start < word.end) j++
    out.push({ text: text.slice(word.start, word.end), start: word.start, word: true })
    i = j
  }
  return out
}

// "Tôi" → pick "tới" shows as "Tới": a pick keeps the capital of the word it replaces.
export function keepCapital(word: string, pick: string): string {
  const first = word.charAt(0)
  return first && first !== first.toLowerCase() ? pick.charAt(0).toUpperCase() + pick.slice(1) : pick
}

/** Mai's check of a sticker's or photo's caption: the corrected label and what changed. */
export type CaptionCheck = { input: string; corrected: string; changes: ReviewChange[] }

export async function checkCaption(target: TargetLanguage, input: string, extraChecks: boolean): Promise<CaptionCheck> {
  const { review } = await checkSpelling(target, input, extraChecks)
  return { input, corrected: review.corrected, changes: review.sentences.flatMap((s) => s.changes) }
}

/** A run of the learner's original sentence: as written, or a word or phrase a change replaces. */
export type Segment = { text: string; start: number; change?: ReviewChange }

// The first whole-word occurrence of `needle` in `text` at or after `from`; exact case first, then any case.
function findWord(text: string, needle: string, from: number, taken: (start: number, end: number) => boolean): number {
  for (const hay of [text, text.toLowerCase()]) {
    const n = hay === text ? needle : needle.toLowerCase()
    for (let i = hay.indexOf(n, from); i >= 0; i = hay.indexOf(n, i + 1)) {
      const end = i + n.length
      if (!isLetter(text[i - 1]) && !isLetter(text[end]) && !taken(i, end)) return i
    }
  }
  return -1
}

/**
 * The learner's original sentence in runs, each change on the words it replaces, so its correction can be
 * written above them ("hom nay" with "hôm nay" over it; "grocery store" crossed out, "tạp hoá" over it).
 * Changes are found in the order their corrections appear in the corrected sentence; words left out
 * ("the") wherever they're found. A change that can't be found is skipped.
 */
export function alignSentence(sentence: ReviewSentence): Segment[] {
  const text = sentence.original
  const spans: { start: number; end: number; change: ReviewChange }[] = []
  const taken = (start: number, end: number) => spans.some((s) => start < s.end && end > s.start)
  let cursor = 0
  // Corrections in the order they read in the corrected sentence, then the words left out.
  const ordered = sentencePieces(sentence).flatMap((p) => (p.change ? [p.change] : []))
  const leftOut = sentence.changes.filter((c) => !c.to)
  for (const change of ordered) {
    const at = findWord(text, change.from, cursor, taken)
    if (at < 0) continue
    spans.push({ start: at, end: at + change.from.length, change })
    cursor = at + change.from.length
  }
  for (const change of leftOut) {
    const at = findWord(text, change.from, 0, taken)
    if (at >= 0) spans.push({ start: at, end: at + change.from.length, change })
  }
  spans.sort((a, b) => a.start - b.start)
  const out: Segment[] = []
  let at = 0
  for (const s of spans) {
    if (s.start > at) out.push({ text: text.slice(at, s.start), start: at })
    out.push({ text: text.slice(s.start, s.end), start: s.start, change: s.change })
    at = s.end
  }
  if (at < text.length) out.push({ text: text.slice(at), start: at })
  return out
}

/**
 * Where the sentence's words of several syllables ("hôm nay") are in `text` (a run of the original), as
 * offsets, so they stay one hoverable word. Found by their spelling, since the original and corrected
 * sentences don't line up offset for offset.
 */
export function joinedWordsIn(text: string, sentence: ReviewSentence): { start: number; end: number }[] {
  const words = [...new Set((sentence.words ?? []).map((w) => sentence.corrected.slice(w.start, w.end)))]
  const found: { start: number; end: number }[] = []
  for (const w of words) {
    let from = 0
    for (let i = findWord(text, w, from, () => false); i >= 0; i = findWord(text, w, from, () => false)) {
      found.push({ start: i, end: i + w.length })
      from = i + w.length
    }
  }
  return found.sort((a, b) => a.start - b.start)
}

// Letters without accents, lowercase ("Rất" → "rat", "đi" → "di").
const bareLetters = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

/** Whether two words have the same letters, accents aside: "rat" and "rất". */
export const sameLetters = (a: string, b: string) => bareLetters(a) === bareLetters(b)
