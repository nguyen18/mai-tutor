// Feedback sent while offline waits here, on the device, and is sent by flushFeedbackOutbox when the
// phone is back online (or the app comes back to the front). Its own IndexedDB database, like
// lib/offline/store.ts. Pictures are kept as bytes, not Blobs: iPhone Safari can fail storing Blobs.

import { OfflineError, postFeedback, SignedOutError, type FeedbackKind } from './feedback'

export type QueuedFeedback = {
  id: string
  summary: string
  details: string
  kind: FeedbackKind
  context: Record<string, string>
  image?: { bytes: ArrayBuffer; type: string; name: string }
  queuedAt: string
}

const DB_NAME = 'mai-outbox'
const STORE = 'feedback'

let dbPromise: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => {
      const opened = req.result
      opened.onversionchange = () => {
        opened.close()
        dbPromise = null
      }
      resolve(opened)
    }
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error)
  })
const result = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Puts a feedback item in the outbox, to be sent by flushFeedbackOutbox. */
export async function queueFeedback(item: Omit<QueuedFeedback, 'id' | 'queuedAt'>): Promise<void> {
  const full: QueuedFeedback = { ...item, id: newId(), queuedAt: new Date().toISOString() }
  const tx = (await db()).transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(full)
  return done(tx)
}

async function readAll(): Promise<QueuedFeedback[]> {
  const tx = (await db()).transaction(STORE)
  return result(tx.objectStore(STORE).getAll() as IDBRequest<QueuedFeedback[]>)
}

async function remove(id: string): Promise<void> {
  const tx = (await db()).transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(id)
  return done(tx)
}

let flushing: Promise<void> | null = null

/** Sends the queued feedback, oldest first. Stops at the first network failure or when signed out; drops items the server rejects. */
export async function flushFeedbackOutbox(): Promise<void> {
  if (!navigator.onLine) return
  // One run at a time: a second call (say, 'online' during a run) joins the one in progress.
  flushing ??= drainOutbox().finally(() => {
    flushing = null
  })
  return flushing
}

async function drainOutbox(): Promise<void> {
  const items = (await readAll()).sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : a.queuedAt > b.queuedAt ? 1 : 0))
  for (const item of items) {
    try {
      await postFeedback({
        summary: item.summary,
        details: item.details,
        image: item.image ? new File([item.image.bytes], item.image.name, { type: item.image.type }) : null,
        context: item.context,
        kind: item.kind,
      })
    } catch (err) {
      // Still offline: keep this and everything after it for the next try.
      if (err instanceof OfflineError) return
      // Not signed in: keep everything until they are.
      if (err instanceof SignedOutError) return
      // The server rejected it: log it and drop it, so it can't block the queue forever.
      console.error('Dropped a queued feedback the server rejected', err)
    }
    await remove(item.id)
  }
}

let started = false

/** Call once at startup: sends the outbox now, when the phone goes online, and when the app comes back to the front. */
export function startFeedbackOutbox(): void {
  if (started) return
  started = true
  const flush = () => flushFeedbackOutbox().catch(console.error)
  flush()
  window.addEventListener('online', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flush()
  })
}
