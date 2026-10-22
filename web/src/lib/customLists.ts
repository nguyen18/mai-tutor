import type { CheatsheetList } from './cheatsheet'
import { targetById } from './languages'
import { useStored } from './localStore'

const STORAGE_KEY = 'mai-tutor:custom-lists'
const NO_LISTS: CustomList[] = []

export type CustomEntry = { word: string; translation: string }

// A word list the user made on the Cheatsheet page.
export type CustomList = {
  id: string
  title: string
  // The language its translations are in (a TargetLanguage id): the one picked in Settings when the
  // list was made. Lists made before Settings existed have none and are Southern Vietnamese.
  target?: string
  entries: CustomEntry[]
}

// Shapes a custom list like a built-in one so the page can render both the same way.
export function toCheatsheetList(list: CustomList): CheatsheetList {
  return {
    id: list.id,
    title: list.title,
    translationLang: { code: targetById(list.target).code, label: targetById(list.target).label },
    // Custom words have one meaning (the user's) and one translation.
    entries: list.entries.map((e) => ({ word: e.word, meanings: [{ id: 'custom', options: [{ text: e.translation }] }] })),
  }
}

function newId(): string {
  // randomUUID needs a secure context (https or localhost); fall back to something unique enough.
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `list-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useCustomLists() {
  const [lists, setLists] = useStored<CustomList[]>(STORAGE_KEY, NO_LISTS)

  const updateList = (id: string, change: (list: CustomList) => CustomList) =>
    setLists((ls) => ls.map((l) => (l.id === id ? change(l) : l)))

  return {
    lists,
    addList: (title: string, target: string) => setLists((ls) => [...ls, { id: newId(), title, target, entries: [] }]),
    deleteList: (id: string) => setLists((ls) => ls.filter((l) => l.id !== id)),
    addEntry: (id: string, entry: CustomEntry) => updateList(id, (l) => ({ ...l, entries: [...l.entries, entry] })),
    removeEntry: (id: string, word: string) =>
      updateList(id, (l) => ({ ...l, entries: l.entries.filter((e) => e.word !== word) })),
  }
}
