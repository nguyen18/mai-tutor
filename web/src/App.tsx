import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Discoverer } from './pages/Discoverer'
import { Settings } from './pages/Settings'
import { ROUTE_HREF, useRoute, type Route } from './lib/useRoute'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FeedbackButton } from './components/FeedbackButton'
import { startSync } from './lib/sync'
import './App.css'

// The Cheatsheet carries ~100 KB of dictionary data, so it loads only when opened.
const Cheatsheet = lazy(() => import('./pages/Cheatsheet').then((m) => ({ default: m.Cheatsheet })))
// The journal (editor, stickers, audio) loads only when opened, too.
const Journal = lazy(() => import('./pages/Journal').then((m) => ({ default: m.Journal })))

const MENU_ITEMS: { route: Route; label: string }[] = [
  { route: 'journal', label: 'Journal' },
  { route: 'cheatsheet', label: 'Cheatsheet' },
  { route: 'settings', label: 'Settings' },
]

function App() {
  const route = useRoute()

  // Syncing with the user's account, when they're signed in. The Supabase client loads in the background.
  useEffect(() => {
    void startSync()
  }, [])

  // Pages start at the top, except the Discoverer, which scrolls itself to the latest message.
  useEffect(() => {
    if (route !== 'discover') window.scrollTo(0, 0)
  }, [route])

  return (
    <>
      {/* Keyed by route so the menu starts closed on every page, including after Back. */}
      <SiteMenu key={route} route={route} />
      <FeedbackButton raised={route === 'discover'} />
      {route === 'discover' ? (
        <Discoverer />
      ) : route === 'cheatsheet' ? (
        <ErrorBoundary message="Couldn't load the cheatsheet. Check your connection and try again.">
          <Suspense fallback={<main className="app"><p className="muted">Loading the cheatsheet…</p></main>}>
            <Cheatsheet />
          </Suspense>
        </ErrorBoundary>
      ) : route === 'settings' ? (
        <Settings />
      ) : (
        <ErrorBoundary message="Couldn't load the journal. Check your connection and try again.">
          <Suspense fallback={<main className="app"><p className="muted">Loading your journal…</p></main>}>
            <Journal />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  )
}

// The site's menu: a button floating in the bottom-left corner, fixed while the page scrolls, whose
// options open to its right (owner's request 2026-10-01; it replaced the header with the "✦ Language
// Helper ✦" wordmark and a ☰ Menu button). On the chat page it sits above the reply box; it hides while
// the journal editor covers a phone's screen.
function SiteMenu({ route }: { route: Route }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the menu on Escape or on a click outside it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div className={route === 'discover' ? 'site-menu raised' : 'site-menu'} ref={menuRef}>
      <button
        type="button"
        className="menu-fab"
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? 'Close menu' : 'Menu'}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? '✕' : '☰'}
      </button>
      {open && (
        <nav id="site-menu" className="menu-panel">
          {MENU_ITEMS.map((item) => (
            <a
              key={item.route}
              href={ROUTE_HREF[item.route]}
              aria-current={item.route === route ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  )
}

export default App
