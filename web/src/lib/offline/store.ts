// Where the downloaded packages live: their own IndexedDB database (not the journal's, so its upgrades
// stay separate), readable from the page (Settings) and the worker. Each data file is stored deflated,
// keyed "<pack id>/<path in the data folder>" ("vi@0.2.0/words/kh.json"), so English takes ~40 MB on the
// device instead of ~140 MB.

import type { PackRecord } from './packs'

const DB_NAME = 'mai-offline'
const FILES = 'files'
const PACKS = 'packs'

let dbPromise: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(FILES)
      req.result.createObjectStore(PACKS, { keyPath: 'id' })
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

export async function getFile(key: string): Promise<Uint8Array | undefined> {
  const tx = (await db()).transaction(FILES)
  return result(tx.objectStore(FILES).get(key) as IDBRequest<Uint8Array | undefined>)
}

/** Stores a batch of files in one transaction (thousands of single writes are slow on phones). */
export async function putFiles(files: [key: string, data: Uint8Array][]): Promise<void> {
  const tx = (await db()).transaction(FILES, 'readwrite')
  const store = tx.objectStore(FILES)
  for (const [key, data] of files) store.put(data, key)
  return done(tx)
}

export async function getPacks(): Promise<PackRecord[]> {
  const tx = (await db()).transaction(PACKS)
  return result(tx.objectStore(PACKS).getAll() as IDBRequest<PackRecord[]>)
}

export async function putPack(pack: PackRecord): Promise<void> {
  const tx = (await db()).transaction(PACKS, 'readwrite')
  tx.objectStore(PACKS).put(pack)
  return done(tx)
}

/** Removes a package's record and every file it stored. */
export async function removePack(id: string): Promise<void> {
  const tx = (await db()).transaction([FILES, PACKS], 'readwrite')
  tx.objectStore(FILES).delete(IDBKeyRange.bound(`${id}/`, `${id}/￿`))
  tx.objectStore(PACKS).delete(id)
  return done(tx)
}
