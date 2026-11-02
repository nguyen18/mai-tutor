import { useState } from 'react'
import { TARGET_LANGUAGES, type TargetLanguage } from '../lib/languages'
import { download, isDownloaded, remove, useOffline } from '../lib/offline/client'
import { BRIDGE, DOWNLOAD_SIZES, packId, packsFor } from '../lib/offline/packs'

// Settings: the languages on this device (lib/offline). The one being learned is downloaded and updated by
// itself (useAutoDownload, owner's request 2026-11-02), so it has no buttons; others can be downloaded or
// removed here. English is listed as included while any language needs it. Per device.

const LANGUAGES = [...new Map(TARGET_LANGUAGES.map((t) => [t.code, t.language])).entries()]

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`

export function OfflineCard({ target }: { target: TargetLanguage }) {
  const { packs, loaded, progress, downloading, errors } = useOffline()
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const languages = [...LANGUAGES].sort(([a], [b]) => (a === target.code ? -1 : b === target.code ? 1 : 0))
  const stored = (lang: string) => packs.find((p) => p.id === packId(lang) && p.complete)
  // A package of this language at another version: the app reads a newer one now.
  const outdated = (lang: string) => !stored(lang) && packs.some((p) => p.lang === lang && p.id !== packId(lang))
  const neededBy = languages.filter(([code]) => isDownloaded(packs, code)).map(([, name]) => name)
  const total = packs.reduce((n, p) => n + p.bytes, 0)

  const status = (lang: string) => {
    const p = progress[lang]
    if (p) return `Downloading… ${p.total ? Math.floor((p.received / p.total) * 100) : 0}%`
    if (downloading.includes(lang)) return 'Waiting…'
    const s = stored(lang)
    if (s) return `On this device · ${mb(s.bytes)}`
    return `${mb(DOWNLOAD_SIZES[lang] ?? 0)} download${outdated(lang) ? ' · update available' : ''}`
  }

  const row = (lang: string, name: string) => {
    const busy = downloading.some((l) => packsFor(lang).includes(l))
    // The language being learned stays: it would only download again.
    const learning = lang === target.code
    const ready = lang === BRIDGE ? !!stored(lang) : isDownloaded(packs, lang)
    // English stays while a language needs it or is downloading.
    const bridgeInUse = lang === BRIDGE && (neededBy.length > 0 || downloading.length > 0)
    if (learning) {
      return (
        <li key={lang} className="offline-pack">
          <span>
            <strong>{name}</strong>
            <span className="muted">
              {busy ? status(lang) : ready ? `${status(lang)} · kept up to date` : 'Downloads when you open Mai'}
            </span>
            {errors[lang] && <span className="error">Couldn't download: {errors[lang]}. It tries again next time you open Mai.</span>}
          </span>
        </li>
      )
    }
    return (
      <li key={lang} className="offline-pack">
        <span>
          <strong>{name}</strong>
          <span className="muted">
            {status(lang)}
            {lang === BRIDGE && ' · every language needs it'}
            {lang !== BRIDGE && !ready && !busy && !stored(BRIDGE) && ` + English ${mb(DOWNLOAD_SIZES[BRIDGE])}`}
          </span>
          {errors[lang] && <span className="error">Couldn't download: {errors[lang]}. Try again.</span>}
        </span>
        {busy ? null : ready ? (
          !bridgeInUse &&
          (confirmRemove === lang ? (
            <span className="offline-confirm">
              <button type="button" className="chip" onClick={() => void remove(lang).then(() => setConfirmRemove(null))}>
                Remove
              </button>
              <button type="button" className="chip" onClick={() => setConfirmRemove(null)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="chip" onClick={() => setConfirmRemove(lang)}>
              Remove
            </button>
          ))
        ) : (
          lang !== BRIDGE && (
            <button type="button" className="chip" onClick={() => void download(lang)}>
              {outdated(lang) ? 'Update' : 'Download'}
            </button>
          )
        )}
      </li>
    )
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Languages on this device</h2>
      </div>
      <p className="muted">
        Mai keeps the language you're learning on this device, so corrections and word boxes are fast and work
        offline, and updates it when there's something new. Other languages can be downloaded here too. Saved on
        this device only.
      </p>
      {!loaded ? (
        <p className="muted">Checking what's on this device…</p>
      ) : (
        <>
          <ul className="offline-packs">
            {languages.map(([code, name]) => row(code, name))}
            {stored(BRIDGE) || downloading.includes(BRIDGE) ? row(BRIDGE, 'English') : null}
          </ul>
          {total > 0 && <p className="muted settings-note">On this device: {mb(total)}</p>}
        </>
      )}
    </section>
  )
}
