import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { backendConfigured, supabase } from './backend'
import {
  allEntries,
  allStickers,
  deleteEntry,
  deleteSticker,
  entryChangedAt,
  JOURNAL_SYNCED_EVENT,
  putEntry,
  putSticker,
  type JournalEntry,
  type Sticker,
} from './journal'
import {
  changeTimes,
  clearDeletes,
  onLocalChange,
  pendingDeletes,
  storeApply,
  storeRaw,
  SYNCED_KEYS,
  type SyncedKey,
} from './localStore'

// Syncs this device with the signed-in user's account (the `user_records` table and the `user-files`
// bucket, supabase/migrations/…_user_records.sql). Each device keeps its own full copy and works offline;
// a sync compares change times record by record and copies whichever side is newer, so the first sync
// on a device uploads what it already had. Deletes travel as tombstones (`deleted`). Runs on sign-in, on
// startup, shortly after each local change, and when the app comes back into view.

type Kind = 'entry' | 'sticker' | 'setting'

// One kind of record on this device. `read` and `write` use the record as the account stores it: JSON,
// with Blobs in it (photos, stickers, audio) uploaded as files.
type Side = {
  /** Every record here and when it last changed ('' when unknown: older than any change elsewhere). */
  list(): Promise<{ id: string; changedAt: string }[]>
  read(id: string): Promise<unknown>
  write(id: string, data: unknown, changedAt: string): Promise<void>
  remove(id: string): Promise<void>
}

function sides(): Record<Kind, Side> {
  return {
    entry: {
      list: async () => (await allEntries()).map((e) => ({ id: e.id, changedAt: entryChangedAt(e) })),
      read: async (id) => (await allEntries()).find((e) => e.id === id),
      write: (_id, data) => putEntry(data as JournalEntry).then(() => {}),
      remove: (id) => deleteEntry(id).then(() => {}),
    },
    sticker: {
      // Stickers never change once made.
      list: async () => (await allStickers()).map((s) => ({ id: s.id, changedAt: s.createdAt })),
      read: async (id) => (await allStickers()).find((s) => s.id === id),
      write: (_id, data) => putSticker(data as Sticker).then(() => {}),
      remove: (id) => deleteSticker(id).then(() => {}),
    },
    setting: {
      list: async () => {
        const times = changeTimes()
        return SYNCED_KEYS.filter((key) => storeRaw(key) !== null).map((key) => ({ id: key, changedAt: times[key] ?? '' }))
      },
      // Stored as the localStorage text, whatever format the key uses.
      read: async (id) => storeRaw(id as SyncedKey),
      write: async (id, data, changedAt) => {
        if (SYNCED_KEYS.includes(id as SyncedKey) && typeof data === 'string') storeApply(id as SyncedKey, data, changedAt)
      },
      remove: async () => {},
    },
  }
}

const time = (iso: string) => (iso ? Date.parse(iso) : 0)
// The change time sent for a record whose time is unknown.
const UNKNOWN_TIME = new Date(0).toISOString()

// Files: uploaded to `<user id>/<sha-256>` and replaced by { $file: path } in the stored JSON.
const BUCKET = 'user-files'
const uploaded = new Set<string>()

async function upload(client: SupabaseClient, userId: string, blob: Blob): Promise<string> {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const path = `${userId}/${hash}`
  if (uploaded.has(path)) return path
  const { error } = await client.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || undefined })
  // Already there: an earlier sync (or another device) uploaded the same file.
  if (error && !/exists|duplicate/i.test(error.message)) throw error
  uploaded.add(path)
  return path
}

async function withFilesUploaded(value: unknown, put: (blob: Blob) => Promise<string>): Promise<unknown> {
  if (value instanceof Blob) return { $file: await put(value) }
  if (Array.isArray(value)) return Promise.all(value.map((v) => withFilesUploaded(v, put)))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = await withFilesUploaded(v, put)
    return out
  }
  return value
}

async function withFilesDownloaded(value: unknown, client: SupabaseClient): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((v) => withFilesDownloaded(v, client)))
  if (value && typeof value === 'object') {
    const file = (value as { $file?: unknown }).$file
    if (typeof file === 'string') {
      const { data, error } = await client.storage.from(BUCKET).download(file)
      if (error) throw error
      return data
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = await withFilesDownloaded(v, client)
    return out
  }
  return value
}

type RemoteRow = { kind: Kind; id: string; changed_at: string; deleted: boolean }

async function syncOnce(client: SupabaseClient, userId: string) {
  const local = sides()
  const { data: rows, error } = await client.from('user_records').select('kind, id, changed_at, deleted')
  if (error) throw error
  const remote = new Map((rows as RemoteRow[]).map((r) => [`${r.kind}|${r.id}`, r]))
  let journalChanged = false

  // Deletes made here: tell the account, unless it has a newer version.
  const deletes = pendingDeletes()
  const tombstones = deletes
    .filter((d) => {
      const r = remote.get(`${d.kind}|${d.id}`)
      return !r || (!r.deleted && time(d.at) >= time(r.changed_at))
    })
    .map((d) => ({ kind: d.kind, id: d.id, data: null, changed_at: d.at, deleted: true }))
  if (tombstones.length) {
    const { error } = await client.from('user_records').upsert(tombstones)
    if (error) throw error
  }
  clearDeletes(deletes)
  const deletedHere = new Set(deletes.map((d) => `${d.kind}|${d.id}`))

  for (const kind of ['setting', 'sticker', 'entry'] as const) {
    const side = local[kind]
    const here = new Map((await side.list()).map((r) => [r.id, r.changedAt]))
    const pull: RemoteRow[] = []

    for (const r of rows as RemoteRow[]) {
      if (r.kind !== kind || deletedHere.has(`${kind}|${r.id}`)) continue
      const changedAt = here.get(r.id)
      const remoteNewer = changedAt === undefined || time(changedAt) < time(r.changed_at)
      if (!remoteNewer) continue
      if (r.deleted) {
        if (changedAt !== undefined) {
          await side.remove(r.id)
          journalChanged ||= kind !== 'setting'
        }
      } else pull.push(r)
    }

    // Fetched in batches: entries can carry a long spelling check.
    for (let i = 0; i < pull.length; i += 50) {
      const ids = pull.slice(i, i + 50).map((r) => r.id)
      const { data, error } = await client.from('user_records').select('id, data, changed_at').eq('kind', kind).in('id', ids)
      if (error) throw error
      for (const row of data as { id: string; data: unknown; changed_at: string }[]) {
        await side.write(row.id, await withFilesDownloaded(row.data, client), row.changed_at)
        journalChanged ||= kind !== 'setting'
      }
    }

    // Newer here, or missing there: upload.
    for (const [id, changedAt] of here) {
      const r = remote.get(`${kind}|${id}`)
      if (r && time(changedAt) <= time(r.changed_at)) continue
      const data = await withFilesUploaded(await side.read(id), (blob) => upload(client, userId, blob))
      const { error } = await client
        .from('user_records')
        .upsert({ kind, id, data, changed_at: changedAt || UNKNOWN_TIME, deleted: false })
      if (error) throw error
    }
  }

  if (journalChanged) window.dispatchEvent(new Event(JOURNAL_SYNCED_EVENT))
}

// The sync's state, for the Account page.
export type SyncStatus =
  | { state: 'signed-out' }
  | { state: 'syncing' | 'synced' | 'failed'; email: string; lastSynced?: string; error?: string }

let status: SyncStatus = { state: 'signed-out' }
const statusListeners = new Set<() => void>()
function setStatus(next: SyncStatus) {
  status = next
  for (const listener of statusListeners) listener()
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (onChange) => {
      statusListeners.add(onChange)
      return () => statusListeners.delete(onChange)
    },
    () => status,
  )
}

let running = false
let again = false
let timer: ReturnType<typeof setTimeout> | undefined

/** Syncs after `delay` ms (resetting an earlier request's wait), if someone is signed in. */
export function requestSync(delay = 0) {
  clearTimeout(timer)
  timer = setTimeout(() => void run(), delay)
}

async function run() {
  if (running) {
    again = true
    return
  }
  const client = await supabase()
  const { data } = await client.auth.getSession()
  const user = data.session?.user
  if (!user) return
  running = true
  const email = user.email ?? ''
  const lastSynced = status.state === 'signed-out' ? undefined : status.lastSynced
  setStatus({ state: 'syncing', email, lastSynced })
  try {
    await syncOnce(client, user.id)
    setStatus({ state: 'synced', email, lastSynced: new Date().toISOString() })
  } catch (e) {
    setStatus({ state: 'failed', email, lastSynced, error: e instanceof Error ? e.message : String(e) })
  } finally {
    running = false
    if (again) {
      again = false
      requestSync()
    }
  }
}

let started = false

/** Starts syncing for whoever is signed in on this device (called once, at startup). */
export async function startSync() {
  if (started || !backendConfigured) return
  started = true
  const client = await supabase().catch(() => {
    // Couldn't load the client (offline?): the next startup tries again.
    started = false
  })
  if (!client) return
  client.auth.onAuthStateChange((event, session) => {
    if (!session) setStatus({ state: 'signed-out' })
    else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') requestSync()
  })
  // A local change waits a moment, so a burst of typing or edits is one sync.
  onLocalChange(() => requestSync(2000))
  window.addEventListener('online', () => requestSync())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && requestSync())
}

/** Signs in with email and password; throws with a message to show when it fails. */
export async function signIn(email: string, password: string) {
  const { error } = await (await supabase()).auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
}

/** Signs out. This device keeps its copy of the journal and settings, but stops syncing. */
export async function signOut() {
  await (await supabase()).auth.signOut()
}
