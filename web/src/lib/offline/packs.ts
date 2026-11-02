// Mai offline: which-dialect's data packages, downloaded to the device so the journal's corrections, word
// boxes and sentence frames run in the browser (./worker.ts) instead of the backend's functions. Each
// language's package covers all its regions; English is the bridge every language needs. The versions are
// the ones the functions read (supabase/functions/_shared/versions.ts), so both give the same results.

import { DATA_VERSIONS } from '../../../../supabase/functions/_shared/versions.ts'

/** English: every language translates through it. */
export const BRIDGE = 'en'

/** One language's data package at the version the app reads, e.g. "vi@0.2.0". */
export const packId = (lang: string) => `${lang}@${DATA_VERSIONS[lang]}`

/** The packages a language needs, its own first. */
export const packsFor = (lang: string) => (lang === BRIDGE ? [BRIDGE] : [lang, BRIDGE])

/** The published package, from npm (versions never change once published; npm allows any site). */
export const tarballUrl = (lang: string) =>
  `https://registry.npmjs.org/which-dialect-${lang}/-/which-dialect-${lang}-${DATA_VERSIONS[lang]}.tgz`

/** Download sizes in bytes, for the Settings card before a download (measured 2026-11-01). */
export const DOWNLOAD_SIZES: Record<string, number> = { en: 35_688_218, vi: 3_465_806, es: 12_262_517 }

/** A downloaded (or downloading) package: `complete` once every file is stored. */
export type PackRecord = {
  id: string
  lang: string
  version: string
  files: number
  /** Bytes stored on the device (compressed). */
  bytes: number
  complete: boolean
  updatedAt: string
}
