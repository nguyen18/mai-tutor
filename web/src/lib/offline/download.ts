// Downloads one data package into the device's store (./store.ts). Runs in the worker: the npm tarball is
// read as it arrives (gunzip, then tar), and each data file is deflated and stored in batches, so the phone
// never holds the whole package (English is 36 MB to download, ~140 MB unpacked).

import { deflateSync } from 'fflate'
import { DATA_VERSIONS } from '../../../../supabase/functions/_shared/versions.ts'
import { packId, tarballUrl, type PackRecord } from './packs'
import { getPacks, putFiles, putPack, removePack } from './store'

export type Progress = { lang: string; received: number; total: number }

// Files per write: one transaction each.
const BATCH_FILES = 250
const DATA_PREFIX = 'package/data/'

/** Reads exactly `n` bytes at a time from a byte stream (null at the end). */
function byteReader(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  let chunks: Uint8Array[] = []
  let buffered = 0
  return async function read(n: number): Promise<Uint8Array | null> {
    while (buffered < n) {
      const { done, value } = await reader.read()
      if (done) return null
      chunks.push(value)
      buffered += value.length
    }
    const out = new Uint8Array(n)
    let at = 0
    while (at < n) {
      const chunk = chunks[0]
      const take = Math.min(chunk.length, n - at)
      out.set(chunk.subarray(0, take), at)
      at += take
      if (take === chunk.length) chunks.shift()
      else chunks[0] = chunk.subarray(take)
    }
    buffered -= n
    if (!chunks.length) chunks = []
    return out
  }
}

const text = new TextDecoder()
const field = (header: Uint8Array, start: number, length: number) =>
  text.decode(header.subarray(start, start + length)).replace(/\0.*$/s, '')

/** The tar archive's regular files, in order. */
async function* tarFiles(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ name: string; data: Uint8Array }> {
  const read = byteReader(stream)
  for (;;) {
    const header = await read(512)
    if (!header || header.every((b) => b === 0)) return
    const size = parseInt(field(header, 124, 12).trim() || '0', 8)
    const type = field(header, 156, 1)
    const prefix = field(header, 345, 155)
    const name = (prefix ? `${prefix}/` : '') + field(header, 0, 100)
    const data = await read(Math.ceil(size / 512) * 512)
    if (!data) throw new Error('The download ended early.')
    if (type === '0' || type === '') yield { name, data: data.subarray(0, size) }
  }
}

/** Downloads a language's package, replacing an unfinished or older one. */
export async function downloadPack(lang: string, onProgress: (p: Progress) => void): Promise<PackRecord> {
  const id = packId(lang)
  // Packages of this language at other versions, and an unfinished one at this version, are removed first.
  for (const old of await getPacks()) if (old.lang === lang && (old.id !== id || !old.complete)) await removePack(old.id)

  const res = await fetch(tarballUrl(lang))
  if (!res.ok || !res.body) throw new Error(`Couldn't download ${lang} (${res.status})`)
  const total = Number(res.headers.get('content-length')) || 0
  let received = 0
  const counted = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.length
        onProgress({ lang, received, total })
        controller.enqueue(chunk)
      },
    }),
  )
  const tar = counted.pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>)

  const pack: PackRecord = { id, lang, version: DATA_VERSIONS[lang], files: 0, bytes: 0, complete: false, updatedAt: new Date().toISOString() }
  await putPack(pack)
  let batch: [string, Uint8Array][] = []
  const flush = async () => {
    if (!batch.length) return
    await putFiles(batch)
    batch = []
  }
  for await (const file of tarFiles(tar)) {
    if (!file.name.startsWith(DATA_PREFIX) || !file.name.endsWith('.json')) continue
    // Level 1: most of the size saving for a fraction of the time (this runs on the phone).
    const stored = deflateSync(file.data, { level: 1 })
    batch.push([`${id}/${file.name.slice(DATA_PREFIX.length)}`, stored])
    pack.files++
    pack.bytes += stored.length
    if (batch.length >= BATCH_FILES) await flush()
  }
  await flush()
  if (!pack.files) throw new Error(`The ${lang} download had no data.`)
  pack.complete = true
  pack.updatedAt = new Date().toISOString()
  await putPack(pack)
  return pack
}
