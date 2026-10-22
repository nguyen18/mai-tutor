import type { SupabaseClient } from '@supabase/supabase-js'

// The Supabase backend's edge functions (supabase/functions). Set VITE_SUPABASE_URL and
// VITE_SUPABASE_PUBLISHABLE_KEY (see web/.env.example); without them, features that need it say so.

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
export const backendConfigured = Boolean(URL && KEY)

/** POSTs JSON to an edge function and returns its JSON reply; throws with `failMessage` on an error status. */
export async function callFunction<T>(name: string, body: unknown, failMessage: string): Promise<T> {
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: KEY!, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${failMessage} (${res.status})`)
  return (await res.json()) as T
}

/**
 * The Supabase client, for accounts and syncing (lib/account.ts, lib/sync.ts). Loaded on first use, so
 * the library isn't in the main bundle. Keeps the signed-in session in localStorage.
 */
let client: Promise<SupabaseClient> | null = null
export function supabase(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(
    ({ createClient }) => createClient(URL!, KEY!),
    (error) => {
      // Offline, or a new deploy replaced the chunk: try again next time.
      client = null
      throw error
    },
  )
  return client
}
