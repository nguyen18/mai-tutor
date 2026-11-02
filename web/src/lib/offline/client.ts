// The page's side of Mai offline: which languages are on this device, downloading and removing them
// (Settings), and `viaMai`, which runs a request in the worker when the language is downloaded and on the
// backend otherwise. Per device: nothing here syncs to the account.

import { useSyncExternalStore } from 'react'
import { packId, packsFor, type PackRecord } from './packs'
import type { Progress } from './download'
import { getPacks } from './store'
import type { Request, Target } from './worker'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

function call<T>(req: Request): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id?: number; result?: unknown; error?: string; progress?: Progress }>) => {
      if (e.data.progress) return setState({ progress: { ...state.progress, [e.data.progress.lang]: e.data.progress } })
      const p = pending.get(e.data.id!)
      if (!p) return
      pending.delete(e.data.id!)
      if (e.data.error !== undefined) p.reject(new Error(e.data.error))
      else p.resolve(e.data.result)
    }
  }
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    worker!.postMessage({ id, req })
  })
}

// What the Settings card shows: stored packages, downloads in progress, and the last error per language.
export type OfflineState = {
  packs: PackRecord[]
  loaded: boolean
  progress: Record<string, Progress>
  downloading: string[]
  errors: Record<string, string>
}
let state: OfflineState = { packs: [], loaded: false, progress: {}, downloading: [], errors: {} }
const listeners = new Set<() => void>()
function setState(next: Partial<OfflineState>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

// Read on the page (not through the worker), so a device with nothing downloaded never starts the worker.
let refreshing: Promise<void> | null = null
function refresh(): Promise<void> {
  refreshing ??= getPacks()
    .then((packs) => setState({ packs, loaded: true }))
    .catch(() => setState({ loaded: true }))
    .finally(() => (refreshing = null))
  return refreshing
}

const isStored = (packs: PackRecord[], lang: string) => packs.some((p) => p.id === packId(lang) && p.complete)
/** Whether everything a language needs (its package and English) is on this device. */
export const isDownloaded = (packs: PackRecord[], lang: string) => packsFor(lang).every((l) => isStored(packs, l))

export function useOffline(): OfflineState {
  const snapshot = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
  if (!state.loaded && !refreshing && typeof indexedDB !== 'undefined') void refresh()
  return snapshot
}

/** Downloads a language and English if it isn't stored yet. */
export async function download(lang: string): Promise<void> {
  if (state.downloading.includes(lang)) return
  await refresh()
  setState({ downloading: [...state.downloading, lang], errors: { ...state.errors, [lang]: '' } })
  try {
    for (const l of packsFor(lang)) {
      if (isStored(state.packs, l)) continue
      setState({ downloading: [...new Set([...state.downloading, l])] })
      await call<PackRecord>({ op: 'download', lang: l })
      await refresh()
    }
  } catch (err) {
    setState({ errors: { ...state.errors, [lang]: err instanceof Error ? err.message : String(err) } })
    await refresh()
  } finally {
    const done = (l: string) => packsFor(lang).includes(l)
    setState({
      downloading: state.downloading.filter((l) => !done(l)),
      progress: Object.fromEntries(Object.entries(state.progress).filter(([l]) => !done(l))),
    })
  }
}

export async function remove(lang: string): Promise<void> {
  await call({ op: 'remove', lang })
  await refresh()
}

/**
 * Runs a request on the device when the target's language is downloaded, and on the backend (`server`)
 * otherwise. If the device fails, the backend is asked instead.
 */
export async function viaMai<T>(target: Target, req: Request, server: () => Promise<T>): Promise<T> {
  if (typeof Worker === 'undefined' || typeof indexedDB === 'undefined') return server()
  if (!state.loaded) await refresh()
  if (!isDownloaded(state.packs, target.code)) return server()
  try {
    return await call<T>(req)
  } catch (err) {
    console.error('Mai on this device failed, asking the backend:', err)
    return server()
  }
}

/**
 * Starts Mai on the device ahead of a check, when the language is downloaded: the first check of a visit
 * loads the worker, the library and the language's common files (~2 s on a computer for a long entry);
 * after this one, ~0.5 s (2026-11-01). Called when the journal opens.
 */
export function warmUp(target: Target): void {
  void viaMai(target, { op: 'review', target, text: 'hello', checks: {} }, async () => null).catch(() => {})
}
