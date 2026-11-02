import type { TargetLanguage } from '../lib/languages'
import { isDownloaded, useOffline } from '../lib/offline/client'
import { ROUTE_HREF } from '../lib/useRoute'

// Added to "couldn't check / translate / look up" messages (owner's request 2026-11-02): when the language
// isn't downloaded, suggest Mai offline, which runs on the device and doesn't depend on the backend's
// limits. Nothing when it's already downloaded, or the browser can't run it.
export function OfflineHint({ target }: { target: TargetLanguage }) {
  const { packs, loaded } = useOffline()
  if (!loaded || typeof Worker === 'undefined' || isDownloaded(packs, target.code)) return null
  return (
    <>
      {' '}
      Downloading {target.language} for offline use in <a className="inline-link" href={ROUTE_HREF.settings}>Settings</a> might help.
    </>
  )
}
