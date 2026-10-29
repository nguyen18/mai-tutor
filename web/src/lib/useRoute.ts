import { useEffect, useState } from 'react'

// Hash-based routes, so refresh and the back button work without a router library or server config.
// The journal is the home page (owner's request 2026-10-22, replacing the old Home page).
export type Route = 'discover' | 'cheatsheet' | 'journal' | 'settings'

export const ROUTE_HREF: Record<Route, string> = {
  discover: '#/discover',
  cheatsheet: '#/cheatsheet',
  journal: '#/',
  settings: '#/settings',
}

function readRoute(): Route {
  const match = (Object.keys(ROUTE_HREF) as Route[]).find((r) => ROUTE_HREF[r] === window.location.hash)
  // Anything else is the journal, including its old address (#/journal) in bookmarks and home-screen apps.
  return match ?? 'journal'
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(readRoute)
  useEffect(() => {
    const onChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
