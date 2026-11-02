import type { TargetLanguage } from '../lib/languages'
import { isDownloaded, useOffline } from '../lib/offline/client'
import { ROUTE_HREF } from '../lib/useRoute'

// Added to "couldn't check / translate / look up" messages (owner's request 2026-11-02): when the language
// isn't on the device yet, say so; it downloads by itself (useAutoDownload) and then doesn't depend on the
// backend's limits. Nothing when it's already downloaded, or the browser can't run it.
export function OfflineHint({ target }: { target: TargetLanguage }) {
  const { packs, loaded, downloading, errors } = useOffline()
  if (!loaded || typeof Worker === 'undefined' || isDownloaded(packs, target.code)) return null
  if (downloading.includes(target.code)) return <> Mai is still downloading {target.language} to this device; try again in a moment.</>
  return (
    <>
      {' '}
      {errors[target.code] ? `${target.language} couldn't be downloaded to this device` : `${target.language} isn't on this device yet`} (see{' '}
      <a className="inline-link" href={ROUTE_HREF.settings}>Settings</a>); it downloads when you open Mai.
    </>
  )
}
