// The offline app (owner's request 2026-11-19): registers the service worker that vite-plugin-pwa builds
// (vite.config.ts), which keeps the app's files on the device so Mai opens with no connection.
//
// Updates: a new version downloads in the background and waits. It's applied only when the app starts, by
// reloading straight away before anything can be typed, never in the middle of a visit, since a reload
// would throw away an open journal editor. So a deploy reaches a device on its second open after it.
// (Waiting also keeps the old version's files for a page that's still open: its lazy chunks keep loading.)

const STARTED_AT = performance.now()
// A waiting update found this soon after the page loaded is applied: nothing has been typed yet.
const APPLY_WITHIN_MS = 3000

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        const apply = (waiting: ServiceWorker | null) => {
          if (!waiting || !navigator.serviceWorker.controller) return
          if (performance.now() - STARTED_AT > APPLY_WITHIN_MS) return
          navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
          // generateSW's worker listens for this message when it doesn't skip waiting by itself.
          waiting.postMessage({ type: 'SKIP_WAITING' })
        }
        apply(reg.waiting)
        // Look for a new version whenever the app comes back into view (a home-screen app may stay open
        // for days); it waits for the next start.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => {})
        })
      })
      .catch((err: unknown) => console.error("Couldn't start the offline app:", err))
  })
}

/**
 * Saves a file for offline use ahead of time, if it isn't saved yet: the service worker's runtime caches
 * (vite.config.ts) keep whatever goes through them. Used for the Cheatsheet of the language being learned,
 * so it opens offline even if it was never opened online.
 */
export async function keepOffline(url: string): Promise<void> {
  if (!import.meta.env.PROD || !('caches' in window) || !('serviceWorker' in navigator)) return
  // On the first visit the new worker takes over the page as it starts (clientsClaim); wait for that, or
  // the fetch would bypass it.
  await navigator.serviceWorker.ready
  if (!navigator.serviceWorker.controller)
    await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
  if (await caches.match(url).catch(() => undefined)) return
  await fetch(url).catch(() => {})
}
