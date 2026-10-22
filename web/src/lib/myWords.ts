import { storeSet, useStored } from './localStore'
import { displayWord, tokenize } from './wordCounts'

// The user's own most common words, shown as the Cheatsheet's "100 most common words you use" list.
// They come from the Personal Word List Discoverer (the chat with Mai), from words typed or pasted on
// the Cheatsheet, or from an uploaded .txt/.md/.docx file (readWordsFile). Saved in localStorage.

const STORAGE_KEY = 'mai-tutor:my-words'
export const MAX_MY_WORDS = 100
const NO_WORDS: string[] = []

export function saveMyWords(words: string[]) {
  storeSet(STORAGE_KEY, words.slice(0, MAX_MY_WORDS))
}

const sameWord = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export function useMyWords() {
  const [words, setStored] = useStored<string[]>(STORAGE_KEY, NO_WORDS)
  // Every change goes through here, so the list never gets longer than MAX_MY_WORDS.
  const setWords = (next: string[]) => setStored(next.slice(0, MAX_MY_WORDS))
  return {
    words,
    /** Adds words at the end, skipping ones already in the list; returns how many were added. */
    add: (more: string[]) => {
      const fresh = more.filter((w, i) => !words.some((x) => sameWord(x, w)) && more.findIndex((x) => sameWord(x, w)) === i)
      const room = Math.max(0, MAX_MY_WORDS - words.length)
      setWords([...words, ...fresh.slice(0, room)])
      return Math.min(fresh.length, room)
    },
    replace: (next: string[]) => setWords(next.slice(0, MAX_MY_WORDS)),
    remove: (word: string) => setWords(words.filter((w) => w !== word)),
  }
}

// One list item as a word: lowercase, apostrophes straightened, "I" capitalized ("I", "I'm"), spaces
// kept for phrases ("going to").
const cleanItem = (item: string) => tokenize(item.replace(/^\s*\d+[.)]?\s+/, '')).map(displayWord).join(' ')

// A list item: up to 3 words, letters/digits/apostrophes/hyphens only, optionally numbered ("12. like").
const LIST_ITEM = /^\s*(\d+[.)]?\s+)?[\p{L}\p{N}'’ -]+\s*$/u

/**
 * Words from text the user typed, pasted or uploaded. A list ("I", "you", "going to", one per line or
 * separated by commas, numbered or not) keeps its order. Anything else (a chat log, an essay) is counted
 * like the Discoverer does and gives its most common words, ties in the order they first appear.
 */
export function wordsFromText(text: string, limit = MAX_MY_WORDS): string[] {
  const items = text.split(/[\n\r,;\t]+/).filter((i) => i.trim())
  const isList = items.length > 0 && items.every((i) => LIST_ITEM.test(i) && tokenize(i).length <= 3)
  if (isList) {
    const words: string[] = []
    for (const item of items) {
      const word = cleanItem(item)
      if (word && !words.some((w) => sameWord(w, word))) words.push(word)
    }
    return words.slice(0, limit)
  }
  const counts = new Map<string, { count: number; first: number }>()
  tokenize(text).forEach((w, i) => {
    const c = counts.get(w)
    if (c) c.count++
    else counts.set(w, { count: 1, first: i })
  })
  return [...counts]
    .sort(([, a], [, b]) => b.count - a.count || a.first - b.first)
    .slice(0, limit)
    .map(([w]) => displayWord(w))
}

export const ACCEPTED_FILES = '.txt,.md,.text,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** The text of an uploaded file: plain text, or a Word .docx (its paragraphs, one per line). */
export async function readWordsFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) {
    // A .docx is a zip; the text is in word/document.xml. fflate (small) is loaded only when needed.
    const { unzipSync, strFromU8 } = await import('fflate')
    const zip = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => f.name === 'word/document.xml' })
    const xml = zip['word/document.xml']
    if (!xml) throw new Error('That .docx has no text in it.')
    const doc = new DOMParser().parseFromString(strFromU8(xml), 'application/xml')
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    return [...doc.getElementsByTagNameNS(W, 'p')]
      .map((p) => [...p.getElementsByTagNameNS(W, 't')].map((t) => t.textContent).join(''))
      .join('\n')
  }
  if (name.endsWith('.doc')) throw new Error('Old Word (.doc) files can’t be read here. Save it as .docx or .txt and try again.')
  if (name.endsWith('.pdf')) throw new Error('PDFs can’t be read here. Save it as .txt or .docx and try again.')
  return file.text()
}
