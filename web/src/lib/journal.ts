import { useCallback, useEffect, useState } from 'react'
import { notifyLocalChange, recordDeleted, useStored, type Codec } from './localStore'
import type { CaptionCheck, SpellingCheck } from './spelling'

// Journal entries and the user's stickers, saved in this browser's IndexedDB (photos, stickers and audio
// are files, too big for localStorage). When the user is signed in, lib/sync.ts copies them to their
// account and brings in other devices' changes.

/** A photo or sticker placed on the entry sheet. Sizes are fractions of the sheet's width, so it scales. */
export type SheetItem = {
  id: string
  kind: 'photo' | 'sticker'
  image: Blob
  /** Top-left corner: x and y, both as fractions of the sheet's width. */
  x: number
  y: number
  /** Width as a fraction of the sheet's width; the height follows from `aspect` (height / width). */
  w: number
  aspect: number
  /** Degrees, clockwise. */
  rotation: number
  /**
   * A label under the picture, like a zine sticker's, in the language being learned (vocabulary practice):
   * English is fine, Mai fills in the word ("matcha latte" → "trà xanh sữa").
   */
  caption?: string
  /** Mai's check of the caption; stale when its `input` isn't the caption any more. */
  captionCheck?: CaptionCheck
}

export type AudioNote = { blob: Blob; seconds: number }

export type JournalEntry = {
  id: string
  /** The language the entry is written in (TargetLanguage.id), set when it was first saved. */
  targetId: string
  /** The date and time the user gave the entry, as a datetime-local value ("2026-10-01T21:30"). */
  when: string
  text: string
  items: SheetItem[]
  audio?: AudioNote
  /** The latest spelling check; stale when `check.input` isn't the entry's text any more. */
  check?: SpellingCheck
  createdAt: string
  updatedAt: string
  /**
   * When anything in the entry last changed on any device, including its spelling check (which leaves
   * `updatedAt`, the user's last edit, alone); the sync keeps the latest. Missing on entries saved
   * before accounts: `updatedAt` stands in.
   */
  changedAt?: string
}

export type Sticker = { id: string; image: Blob; aspect: number; createdAt: string }

const DB_NAME = 'mai-tutor'
// Before 2026-10-07's rename, the app was "Language Helper" and so was its database.
const OLD_DB_NAME = 'language-helper'
const ENTRIES = 'journal-entries'
// Before 2026-10-01's rename, the journal was the "diary".
const OLD_ENTRIES = 'diary-entries'
const STICKERS = 'stickers'

let dbPromise: Promise<IDBDatabase> | null = null

function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 2)
    req.onupgradeneeded = (e) => {
      const db = req.result
      if (e.oldVersion < 1) db.createObjectStore(STICKERS, { keyPath: 'id' })
      db.createObjectStore(ENTRIES, { keyPath: 'id' })
      // Version 1 called the journal a diary: move its entries over.
      if (db.objectStoreNames.contains(OLD_ENTRIES)) {
        const tx = req.transaction!
        const read = tx.objectStore(OLD_ENTRIES).getAll()
        read.onsuccess = () => {
          for (const entry of read.result) tx.objectStore(ENTRIES).put(entry)
          db.deleteObjectStore(OLD_ENTRIES)
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

// Copies the journal from the old database into `to`, then deletes the old one. `add` skips records `to`
// already has, so a copy cut short and redone on the next load doesn't overwrite newer edits.
async function moveOldDb(to: IDBDatabase) {
  const dbs = await indexedDB.databases?.().catch(() => undefined)
  if (!dbs?.some((d) => d.name === OLD_DB_NAME)) return
  const from = await open(OLD_DB_NAME)
  const read = from.transaction([ENTRIES, STICKERS], 'readonly')
  const entries = read.objectStore(ENTRIES).getAll()
  const stickers = read.objectStore(STICKERS).getAll()
  await done(read)
  from.close()
  const write = to.transaction([ENTRIES, STICKERS], 'readwrite')
  for (const [store, req] of [[ENTRIES, entries], [STICKERS, stickers]] as const) {
    for (const record of req.result) write.objectStore(store).add(record).onerror = (e) => e.preventDefault()
  }
  await done(write)
  indexedDB.deleteDatabase(OLD_DB_NAME)
}

function db(): Promise<IDBDatabase> {
  dbPromise ??= open(DB_NAME).then(
    async (db) => {
      // Let go when another tab upgrades or deletes the database, instead of blocking it.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      // Best effort: on failure the old database stays and the next load tries again.
      await moveOldDb(db).catch(() => {})
      return db
    },
    (error) => {
      dbPromise = null
      throw error
    },
  )
  return dbPromise
}

async function run<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await db()).transaction(store, mode)
  return new Promise((resolve, reject) => {
    const req = op(tx.objectStore(store))
    tx.oncomplete = () => resolve(req.result)
    // A transaction can fail without an error object (aborted): say which store and what, then.
    tx.onerror = () => reject(tx.error ?? req.error ?? new Error(`Writing to ${store} failed`))
    tx.onabort = () => reject(tx.error ?? req.error ?? new Error(`Writing to ${store} was aborted`))
  })
}

// Pictures and recordings are stored as bytes (ArrayBuffer + type), not Blobs: iPhone Safari can fail to store
// Blobs in IndexedDB ("UnknownError: Error preparing Blob/File data", e.g. in Private Browsing), which broke
// saving entries with a photo or sticker (owner's report 2026-10-02). They're turned back into Blobs when
// read; entries and stickers stored as Blobs before still read as they are.
type StoredFile = { bytes: ArrayBuffer; type: string }
const isStoredFile = (v: unknown): v is StoredFile =>
  typeof v === 'object' && v !== null && (v as StoredFile).bytes instanceof ArrayBuffer
const toStored = async (b: Blob): Promise<StoredFile> => ({ bytes: await b.arrayBuffer(), type: b.type })
const toBlob = (v: Blob | StoredFile): Blob => (isStoredFile(v) ? new Blob([v.bytes], { type: v.type }) : v)

async function storeEntry(e: JournalEntry) {
  return {
    ...e,
    items: await Promise.all(e.items.map(async (i) => ({ ...i, image: await toStored(i.image) }))),
    ...(e.audio ? { audio: { ...e.audio, blob: await toStored(e.audio.blob) } } : {}),
  }
}

function readEntry(e: JournalEntry): JournalEntry {
  return {
    ...e,
    items: e.items.map((i) => ({ ...i, image: toBlob(i.image as Blob | StoredFile) })),
    ...(e.audio ? { audio: { ...e.audio, blob: toBlob(e.audio.blob as Blob | StoredFile) } } : {}),
  }
}

// Asks the browser not to clear the journal when space runs low. Best effort: some browsers decide alone.
function askToPersist() {
  void navigator.storage?.persist?.().catch(() => {})
}

export const newId = () => crypto.randomUUID()

/** When an entry last changed, for the sync. */
export const entryChangedAt = (entry: JournalEntry) => entry.changedAt ?? entry.updatedAt

// The stores without React (also used by lib/sync.ts). Pictures and audio come back as Blobs.
export const allEntries = async () => (await run<JournalEntry[]>(ENTRIES, 'readonly', (s) => s.getAll())).map(readEntry)
export const putEntry = async (entry: JournalEntry) => {
  const stored = await storeEntry(entry)
  await run(ENTRIES, 'readwrite', (s) => s.put(stored))
}
export const deleteEntry = (id: string) => run(ENTRIES, 'readwrite', (s) => s.delete(id))
export const allStickers = async () =>
  (await run<Sticker[]>(STICKERS, 'readonly', (s) => s.getAll())).map((st) => ({
    ...st,
    image: toBlob(st.image as Blob | StoredFile),
  }))
export const putSticker = async (sticker: Sticker) => {
  const stored = { ...sticker, image: await toStored(sticker.image) }
  await run(STICKERS, 'readwrite', (s) => s.put(stored))
}
export const deleteSticker = (id: string) => run(STICKERS, 'readwrite', (s) => s.delete(id))

/** Fired by lib/sync.ts after it changed the journal or the stickers here, so open pages reload them. */
export const JOURNAL_SYNCED_EVENT = 'mai-tutor:journal-synced'

// Reloads on JOURNAL_SYNCED_EVENT.
function useReload(load: () => void) {
  useEffect(() => {
    load()
    window.addEventListener(JOURNAL_SYNCED_EVENT, load)
    return () => window.removeEventListener(JOURNAL_SYNCED_EVENT, load)
  }, [load])
}

/** "2026-10-01T21:30" for now, in local time, for a datetime-local input. */
export function nowLocal(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// Latest on top: by the date the user gave, then by when the entry was made.
const latestFirst = (a: JournalEntry, b: JournalEntry) =>
  b.when.localeCompare(a.when) || b.createdAt.localeCompare(a.createdAt)

/** The journal, latest entry first. `error` is set when this browser can't store it (e.g. private mode). */
export function useJournal() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useReload(
    useCallback(() => {
      allEntries()
        .then((all) => setEntries(all.sort(latestFirst)))
        .catch(() => {
          setEntries([])
          setError("This browser can't save journal entries (private browsing can block it).")
        })
    }, []),
  )

  const save = useCallback(async (entry: JournalEntry) => {
    const saved = { ...entry, changedAt: new Date().toISOString() }
    await putEntry(saved)
    askToPersist()
    notifyLocalChange()
    setEntries((list) => [...(list ?? []).filter((e) => e.id !== saved.id), saved].sort(latestFirst))
  }, [])

  const remove = useCallback(async (id: string) => {
    await deleteEntry(id)
    recordDeleted('entry', id)
    setEntries((list) => (list ?? []).filter((e) => e.id !== id))
  }, [])

  return { entries, error, save, remove }
}

/** Stickers the user has made, newest first, to reuse on any entry. */
export function useStickers() {
  const [stickers, setStickers] = useState<Sticker[]>([])

  useReload(
    useCallback(() => {
      allStickers()
        .then((all) => setStickers(all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
        .catch(() => {})
    }, []),
  )

  const add = useCallback(async (sticker: Sticker) => {
    setStickers((list) => [sticker, ...list])
    await putSticker(sticker).then(notifyLocalChange, () => {})
  }, [])

  const remove = useCallback(async (id: string) => {
    setStickers((list) => list.filter((s) => s.id !== id))
    await deleteSticker(id).then(() => recordDeleted('sticker', id), () => {})
  }, [])

  return { stickers, add, remove }
}

// Object URLs for saved pictures and recordings, one per Blob and kept until the page closes. Revoking
// them as components unmount would break pictures shown in two places at once (an entry and the editor),
// and a journal holds few enough files that keeping them is cheap.
const objectUrls = new WeakMap<Blob, string>()

/** An object URL for a Blob, to show it in <img> or <audio>. */
export function objectUrl(blob: Blob): string {
  let url = objectUrls.get(blob)
  if (!url) {
    url = URL.createObjectURL(blob)
    objectUrls.set(blob, url)
  }
  return url
}

// The journal's extra checks (other regions' words, one word for "I"), off by default: the review is a
// spellchecker unless the learner turns them on in Settings. Saved as "true"/"false".
const BOOLEAN: Codec<boolean> = { parse: (raw) => raw === 'true', serialize: String }

export function useJournalExtraChecks(): [boolean, (on: boolean) => void] {
  return useStored('mai-tutor:journal-extra-checks', false, BOOLEAN)
}
