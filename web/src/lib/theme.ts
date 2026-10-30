import { useEffect, useSyncExternalStore } from 'react'

// Light or dark (owner's request 2026-10-30): the device's setting by default, or one chosen in Settings.
// The choice is this device's own (not synced: a phone and a laptop can differ). The page wears the result
// as <html data-theme="light|dark">, which index.css's dark tokens key on; index.html sets it before the
// first paint (from the same localStorage keys) so a dark page never flashes white.
//
// Colorblind-friendly colours (owner's requests 2026-10-30, dark first, then light) are a separate switch,
// so they go with Device, Light and Dark alike: <html data-palette="colorblind"> swaps Mai's colour codes
// (correction highlights, red corrections and translations) for the Okabe-Ito palette, in either theme.

export type ThemeChoice = 'system' | 'light' | 'dark'
export const THEME_KEY = 'mai-tutor:theme'
export const COLORBLIND_KEY = 'mai-tutor:colorblind'

const listeners = new Set<() => void>()
const notify = () => {
  for (const listener of listeners) listener()
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Kept for this visit only.
  }
}

// Before the switch, the colorblind-friendly mode was a theme of its own, "dark-colorblind".
if (read(THEME_KEY) === 'dark-colorblind') {
  write(THEME_KEY, 'dark')
  write(COLORBLIND_KEY, '1')
}

const readTheme = (): ThemeChoice => {
  const raw = read(THEME_KEY)
  return raw === 'light' || raw === 'dark' ? raw : 'system'
}
const readColorblind = () => read(COLORBLIND_KEY) === '1'

let theme = readTheme()
let colorblind = readColorblind()

function setTheme(choice: ThemeChoice) {
  theme = choice
  write(THEME_KEY, choice === 'system' ? null : choice)
  notify()
}

function setColorblind(on: boolean) {
  colorblind = on
  write(COLORBLIND_KEY, on ? '1' : null)
  notify()
}

// Another tab changed them.
window.addEventListener('storage', (e) => {
  if (e.key !== THEME_KEY && e.key !== COLORBLIND_KEY) return
  theme = readTheme()
  colorblind = readColorblind()
  notify()
})

const subscribe = (onChange: () => void) => {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  return [useSyncExternalStore(subscribe, () => theme), setTheme]
}

export function useColorblind(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, () => colorblind), setColorblind]
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Keeps <html data-theme> and data-palette in step with the choices, and with the device's setting. */
export function useApplyTheme() {
  const [choice] = useThemeChoice()
  const [cb] = useColorblind()
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const apply = () => {
      const dark = choice === 'dark' || (choice === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      if (cb) document.documentElement.dataset.palette = 'colorblind'
      else delete document.documentElement.dataset.palette
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [choice, cb])
}
