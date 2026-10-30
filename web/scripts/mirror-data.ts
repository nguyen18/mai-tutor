// Copies which-dialect's dictionary data into Supabase Storage, where the backend's functions read it.
//
//   npm run mirror-data                  (from web/; to the local Supabase started with `npx supabase start`)
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… npm run mirror-data      (to a hosted project)
//   npm run mirror-data -- --if-missing  (skip data sets already marked complete; what scripts/local.sh runs)
//
// For a hosted project, SUPABASE_SECRET_KEY must be the legacy `service_role` key (a JWT): hosted Storage
// rejects the new `sb_secret_…` keys in the Authorization header ("Invalid Compact JWS"). The local
// Supabase accepts either.
//
// Why: the functions look words up as they go. Loading the data from the jsDelivr CDN made translating a
// word ~20 s, because files nobody had asked for recently take ~1 s each and a word needs dozens of them in
// a row. From Storage, next to the functions, every file is fast.
//
// The data comes from the published npm packages (which-dialect-en / -vi / -es, the versions below) and goes
// to the public bucket `which-dialect` as <lang>@<version>/<path>. Already-uploaded files are skipped
// (upsert: false), so an interrupted run can just be started again. Run it again when the data versions
// change (DATA_SETS here and DATA_VERSIONS in supabase/functions/_shared/data.ts).

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// The data package versions every function reads (supabase/functions/_shared/data.ts's DATA_VERSIONS must
// match), each in a folder named <lang>@<version>. (Folders from before 2026-10-01's bump to which-dialect
// 0.5.0, named after the package version: 0.1.1, 0.2.0, 0.3.0, 0.4.0, are unused and can be deleted.)
const DATA_SETS: { lang: string; version: string }[] = [
  { lang: 'en', version: '0.2.1' },
  { lang: 'vi', version: '0.2.0' },
  { lang: 'es', version: '0.2.3' },
]
const BUCKET = 'which-dialect'
// Uploaded into a data set's folder once all its files are there, so --if-missing can skip the set without
// trying every file again (a full pass of "already exists" answers takes a while).
const COMPLETE = '_complete.json'
const IF_MISSING = process.argv.includes('--if-missing')
const PARALLEL = 24

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(WEB, 'node_modules', '.cache', 'which-dialect-data')

// The local Supabase's URL and secret key, unless given.
function connection() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }
  }
  const status = JSON.parse(
    execFileSync('npx', ['-y', 'supabase@2.119.0', 'status', '-o', 'json', '--workdir', join(WEB, '..')], { encoding: 'utf8' }),
  )
  return { url: status.API_URL as string, key: status.SECRET_KEY as string }
}

// Downloads and unpacks which-dialect-<lang>@<version> once; returns its data folder.
function packageData(lang: string, version: string): string {
  const dir = join(CACHE, version, lang)
  if (!existsSync(join(dir, 'package', 'data'))) {
    execFileSync('mkdir', ['-p', dir])
    console.log(`Downloading which-dialect-${lang}@${version}`)
    const tgz = execFileSync('npm', ['pack', `which-dialect-${lang}@${version}`, '--pack-destination', dir], {
      encoding: 'utf8',
    }).trim().split('\n').pop()!
    execFileSync('tar', ['xzf', join(dir, tgz), '-C', dir])
  }
  return join(dir, 'package', 'data')
}

async function files(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await files(path)))
    else if (entry.name.endsWith('.json')) out.push(path)
  }
  return out
}

async function main() {
  const { url, key } = connection()
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  console.log(`Mirroring which-dialect data to ${url}`)

  // Public, so the function (and anyone) can read files by URL without a key; only the secret key writes.
  const bucket = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  })
  if (!bucket.ok && !(await bucket.text()).includes('already exists')) throw new Error(`Creating the bucket failed (${bucket.status})`)

  for (const { lang, version } of DATA_SETS) {
    const folder = `${lang}@${version}`
    if (IF_MISSING) {
      const marker = await fetch(`${url}/storage/v1/object/public/${BUCKET}/${folder}/${COMPLETE}`)
      if (marker.ok) {
        console.log(`${folder}: already complete`)
        continue
      }
    }
    const data = packageData(lang, version)
    const paths = await files(data)
    let done = 0
    let skipped = 0
    const queue = [...paths]
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        for (let path = queue.shift(); path; path = queue.shift()) {
          const name = `${folder}/${relative(data, path)}`
          const body = await readFile(path)
          // Hosted Storage answers the odd upload with a 500 under this many parallel requests: try again.
          for (let attempt = 1; ; attempt++) {
            const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${name}`, {
              method: 'POST',
              headers: { ...headers, 'content-type': 'application/json', 'x-upsert': 'false' },
              body,
            })
            if (res.ok) break
            const text = await res.text()
            if (res.status === 409 || text.includes('already exists') || text.includes('Duplicate')) {
              skipped++
              break
            }
            if (res.status < 500 || attempt === 4) throw new Error(`Uploading ${name} failed (${res.status}): ${text}`)
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
          }
          if (++done % 1000 === 0) console.log(`  ${folder}: ${done}/${paths.length}`)
        }
      }),
    )
    const marked = await fetch(`${url}/storage/v1/object/${BUCKET}/${folder}/${COMPLETE}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-upsert': 'true' },
      body: JSON.stringify({ files: paths.length, at: new Date().toISOString() }),
    })
    if (!marked.ok) throw new Error(`Marking ${folder} complete failed (${marked.status}): ${await marked.text()}`)
    console.log(`${folder}: ${paths.length} files (${skipped} were already there)`)
  }
}

await mkdir(CACHE, { recursive: true })
main().catch((err) => {
  console.error(err)
  process.exit(1)
})
