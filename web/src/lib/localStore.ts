import { useSyncExternalStore } from 'react'

// The app's small saved data (words, lists, picks, settings…): localStorage values that sync to the
// user's account when they're signed in (lib/sync.ts). Every change goes through `storeSet`, which
// records when it was made, so a sync can tell which device's value is newer. Pages read values with
// `useStored`, which also picks up changes from other tabs and from a sync.

/** The localStorage keys that sync to the user's account. */
export const SYNCED_KEYS = [
  'mai-tutor:my-words',
  'mai-tutor:custom-lists',
  'mai-tutor:cheatsheet-picks-v2',
  'mai-tutor:target-language',
  'mai-tutor:journal-extra-checks',
  'mai-tutor:chat',
] as const
export type SyncedKey = (typeof SYNCED_KEYS)[number]

// When each key last changed on this device. A key with no time (saved before accounts existed) counts
// as older than any change made on another device.
const TIMES_KEY = 'mai-tutor:sync-times'
// Entries and stickers deleted on this device that the account hasn't heard about yet.
const DELETED_KEY = 'mai-tutor:sync-deleted'
const CHANGE_EVENT = 'mai-tutor:store-change'

// Used when localStorage is unavailable (blocked, or full): values then last until the page reloads.
const memory = new Map<string, string>()

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null
  } catch {
    return memory.get(key) ?? null
  }
}

function writeRaw(key: string, raw: string) {
  memory.set(key, raw)
  try {
    localStorage.setItem(key, raw)
    memory.delete(key)
  } catch {
    // Kept in memory instead.
  }
}

function readJson<T>(key: string, fallback: T): T {
  const raw = readRaw(key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** How a value is saved: JSON by default; some older keys hold a plain string. */
export type Codec<T> = { parse: (raw: string) => T; serialize: (value: T) => string }
const jsonCodec = <T,>(): Codec<T> => ({ parse: (raw) => JSON.parse(raw) as T, serialize: (v) => JSON.stringify(v) })

// Something on this device changed that the account should get: lib/sync.ts listens.
const localChangeListeners = new Set<() => void>()
export function onLocalChange(listener: () => void): () => void {
  localChangeListeners.add(listener)
  return () => localChangeListeners.delete(listener)
}
export function notifyLocalChange() {
  for (const listener of localChangeListeners) listener()
}

/** Saves a value the user changed, and marks it for syncing. Saving the same value again does nothing. */
export function storeSet<T>(key: SyncedKey, value: T, codec: Codec<T> = jsonCodec<T>()) {
  const raw = codec.serialize(value)
  if (raw === readRaw(key)) return
  writeRaw(key, raw)
  writeRaw(TIMES_KEY, JSON.stringify({ ...changeTimes(), [key]: new Date().toISOString() }))
  window.dispatchEvent(new Event(CHANGE_EVENT))
  notifyLocalChange()
}

/** Reads a saved value outside React; `fallback` when it's missing or unreadable. */
export function storeGet<T>(key: SyncedKey, fallback: T, codec: Codec<T> = jsonCodec<T>()): T {
  const raw = readRaw(key)
  if (raw === null) return fallback
  try {
    return codec.parse(raw)
  } catch {
    return fallback
  }
}

// Parsed values by key, so `useStored` returns the same object until the saved text changes.
const parsed = new Map<string, { raw: string | null; value: unknown }>()

/**
 * A saved value and a setter, like useState but kept in localStorage, shared by every component and tab
 * using the key, and updated when a sync brings in another device's change. `fallback` must be a
 * constant (it's returned as is while nothing is saved).
 */
export function useStored<T>(
  key: SyncedKey,
  fallback: T,
  codec: Codec<T> = jsonCodec<T>(),
): [T, (next: T | ((current: T) => T)) => void] {
  const value = useSyncExternalStore(subscribe, () => {
    const raw = readRaw(key)
    const cached = parsed.get(key)
    if (cached && cached.raw === raw) return cached.value as T
    const value = storeGet(key, fallback, codec)
    parsed.set(key, { raw, value })
    return value
  })
  const set = (next: T | ((current: T) => T)) => {
    const value = typeof next === 'function' ? (next as (current: T) => T)(storeGet(key, fallback, codec)) : next
    storeSet(key, value, codec)
  }
  return [value, set]
}

function subscribe(onChange: () => void) {
  // `storage` fires in other tabs; the custom event in this one.
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

// For lib/sync.ts.

/** When each synced key last changed on this device (ISO times). */
export function changeTimes(): Partial<Record<SyncedKey, string>> {
  return readJson(TIMES_KEY, {})
}

/** The saved text of a synced key, or null. */
export const storeRaw = (key: SyncedKey) => readRaw(key)

/** Saves another device's value (from a sync) with that device's change time, without marking it for syncing. */
export function storeApply(key: SyncedKey, raw: string, changedAt: string) {
  writeRaw(key, raw)
  writeRaw(TIMES_KEY, JSON.stringify({ ...changeTimes(), [key]: changedAt }))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export type Deleted = { kind: 'entry' | 'sticker'; id: string; at: string }

/** Remembers that an entry or sticker was deleted here, so the next sync deletes it everywhere. */
export function recordDeleted(kind: Deleted['kind'], id: string) {
  writeRaw(DELETED_KEY, JSON.stringify([...pendingDeletes(), { kind, id, at: new Date().toISOString() }]))
  notifyLocalChange()
}

export const pendingDeletes = (): Deleted[] => readJson(DELETED_KEY, [])

/** Forgets deletes the account now has. */
export function clearDeletes(done: Deleted[]) {
  writeRaw(DELETED_KEY, JSON.stringify(pendingDeletes().filter((d) => !done.some((x) => x.kind === d.kind && x.id === d.id))))
}
