// Shared by the journal's functions (check-spelling, sentence-frames): the languages the site offers and
// where which-dialect's data lives in Storage.

// Languages the site offers (TARGET_LANGUAGES in web/src/lib/languages.ts).
export const TARGETS: Record<string, { code: string; region?: string }> = {
  'vi-Southern': { code: 'vi', region: 'Southern' },
  'vi-Central': { code: 'vi', region: 'Central' },
  'vi-Northern': { code: 'vi', region: 'Northern' },
  'es-Spain': { code: 'es', region: 'Spain' },
  'es-Mexico': { code: 'es', region: 'Mexico' },
  'es-Argentina': { code: 'es', region: 'Argentina' },
  'es-Colombia': { code: 'es', region: 'Colombia' },
  // A region group: any Latin American country's words.
  'es-Latin-America': { code: 'es', region: 'Latin America' },
}

// which-dialect's data in Storage (see ./data.ts).
export { dataUrl } from './data.ts'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Serves a handler with CORS headers on every reply, including the preflight. */
export function withCors(handler: (req: Request) => Promise<Response>) {
  return {
    async fetch(req: Request) {
      if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
      const res = await handler(req)
      const headers = new Headers(res.headers)
      for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
      return new Response(res.body, { status: res.status, headers })
    },
  }
}
