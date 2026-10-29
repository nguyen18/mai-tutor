// Feedback from a signed-in user, made into a ticket on the owner's Notion board (owner's request
// 2026-10-29). POST multipart/form-data with the user's access token (Authorization: Bearer …):
//
// - summary: the one-sentence feedback, the ticket's title (required, up to MAX_SUMMARY characters)
// - details: more details, the ticket page's text (optional)
// - image:   one screenshot or picture (optional; the browser has already shrunk it to a JPEG)
// - context: JSON with where it was sent from (page, screen, browser), shown at the bottom of the ticket
//
// Returns { id, ticket } (ticket: the Notion page's URL, or null when Notion failed: the feedback is
// still saved). The feedback is saved first, as the user (RLS: supabase/migrations/…_feedback.sql), so
// nothing is lost if Notion fails. The reporter's email comes from their sign-in, not from the form.
//
// The ticket: Name = summary, Status = Not started, User reported = the email, Assign = the owner (who
// Notion then notifies); the page holds the details, the image, and the context. Secrets: NOTION_TOKEN
// (the "Mai feedback" internal integration, connected to the mai tutor page), NOTION_DATA_SOURCE_ID (the
// "user tickets" board), NOTION_ASSIGNEE_ID (the owner's Notion user id).

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'
import { CORS, withCors } from '../_shared/journal.ts'

const MAX_SUMMARY = 200
const MAX_DETAILS = 5000
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
// Tickets a user can send in an hour.
const HOURLY_LIMIT = 5

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2025-09-03'
// Notion's longest text run.
const NOTION_TEXT_LIMIT = 2000

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } })

const handler = async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  // Whoever is signed in, from their access token.
  const authorization = req.headers.get('authorization') ?? ''
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    // Capitalized like supabase-js's own header, so it replaces it instead of making a second one (which
    // the gateway rejects as a bad request).
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const { data: auth, error: authError } = await db.auth.getUser(authorization.replace(/^Bearer\s+/i, ''))
  if (authError) console.error('feedback: sign-in check failed', authError.message)
  const user = auth.user
  if (!user?.email) return json({ error: 'Sign in to send feedback.'}, 401)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json({ error: 'Expected a form.' }, 400)
  }
  const summary = String(form.get('summary') ?? '').trim()
  const details = String(form.get('details') ?? '').trim()
  const image = form.get('image')
  let context: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(String(form.get('context') ?? '{}'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) context = parsed
  } catch {
    // No context, then.
  }
  context.received = new Date().toISOString()

  if (!summary) return json({ error: 'Write your feedback in a sentence first.' }, 400)
  if (summary.length > MAX_SUMMARY) return json({ error: `Keep the first box under ${MAX_SUMMARY} characters.` }, 400)
  if (details.length > MAX_DETAILS) return json({ error: `The details can be up to ${MAX_DETAILS} characters.` }, 400)
  if (image !== null && !(image instanceof File)) return json({ error: 'The image is not a file.' }, 400)
  if (image && !(image.type in IMAGE_TYPES)) return json({ error: 'The image must be a JPEG, PNG, WebP or GIF.' }, 400)
  if (image && image.size > MAX_IMAGE_BYTES) return json({ error: 'The image is too big (10 MB at most).' }, 400)

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await db.from('feedback').select('id', { count: 'exact', head: true }).gte('created_at', since)
  if ((count ?? 0) >= HOURLY_LIMIT) return json({ error: "That's a lot of feedback at once. Try again in an hour." }, 429)

  // Saved first.
  const id = crypto.randomUUID()
  let imagePath: string | null = null
  if (image) {
    imagePath = `${user.id}/${id}.${IMAGE_TYPES[image.type]}`
    const { error } = await db.storage.from('feedback-images').upload(imagePath, image, { contentType: image.type })
    if (error) return json({ error: `Couldn't save the image: ${error.message}` }, 500)
  }
  const { error: saveError } = await db
    .from('feedback')
    .insert({ id, email: user.email, summary, details, image_path: imagePath, context })
  if (saveError) return json({ error: `Couldn't save your feedback: ${saveError.message}` }, 500)

  // Then the ticket.
  try {
    const ticket = await createTicket({ summary, details, image, email: user.email, context })
    await db.from('feedback').update({ notion_url: ticket }).eq('id', id)
    return json({ id, ticket })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('feedback: Notion failed', id, message)
    await db.from('feedback').update({ notion_error: message.slice(0, 1000) }).eq('id', id)
    return json({ id, ticket: null })
  }
}

async function notion(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${Deno.env.get('NOTION_TOKEN')}`,
      'notion-version': NOTION_VERSION,
      ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Notion ${path} ${res.status}: ${(body as { message?: string }).message ?? res.statusText}`)
  return body
}

/** Uploads the image to Notion and returns its file upload id, for an image block. */
async function uploadImage(image: File): Promise<string> {
  const upload = await notion('/file_uploads', {
    method: 'POST',
    body: JSON.stringify({ filename: image.name || `screenshot.${IMAGE_TYPES[image.type]}`, content_type: image.type }),
  })
  const form = new FormData()
  form.append('file', image, image.name || 'screenshot')
  await notion(`/file_uploads/${upload.id}/send`, { method: 'POST', body: form })
  return upload.id as string
}

// Text as Notion paragraphs: one per line break pair, each split into runs Notion accepts.
const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({
      type: 'paragraph',
      paragraph: { rich_text: chunks(p).map((content) => ({ type: 'text', text: { content } })) },
    }))

const chunks = (text: string) => {
  const out: string[] = []
  for (let i = 0; i < text.length; i += NOTION_TEXT_LIMIT) out.push(text.slice(i, i + NOTION_TEXT_LIMIT))
  return out
}

async function createTicket(f: {
  summary: string
  details: string
  image: File | null
  email: string
  context: Record<string, unknown>
}): Promise<string> {
  const imageId = f.image ? await uploadImage(f.image) : null
  const contextLines = Object.entries(f.context)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n')
  const children = [
    ...(f.details ? paragraphs(f.details) : [{ type: 'paragraph', paragraph: { rich_text: [] } }]),
    ...(imageId ? [{ type: 'image', image: { type: 'file_upload', file_upload: { id: imageId } } }] : []),
    { type: 'divider', divider: {} },
    {
      type: 'paragraph',
      paragraph: {
        rich_text: chunks(`Sent from Mai by ${f.email}\n${contextLines}`).map((content) => ({
          type: 'text',
          text: { content },
          annotations: { color: 'gray' },
        })),
      },
    },
  ]
  const assignee = Deno.env.get('NOTION_ASSIGNEE_ID')
  const page = await notion('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'data_source_id', data_source_id: Deno.env.get('NOTION_DATA_SOURCE_ID') },
      properties: {
        Name: { title: [{ type: 'text', text: { content: f.summary } }] },
        Status: { status: { name: 'Not started' } },
        'User reported': { email: f.email },
        ...(assignee ? { Assign: { people: [{ id: assignee }] } } : {}),
      },
      children,
    }),
  })
  return page.url as string
}

export default withCors(handler)
