import { useEffect, useSyncExternalStore } from 'react'

// Light or dark (owner's request 2026-10-30): the device's setting by default, or one chosen in Settings.
// The choice is this device's own (not synced: a phone and a laptop can differ). The page wears the result
// as <html data-theme="light|dark">, which App.css's dark tokens key on; index.html sets it before the
// first paint (from the same localStorage key) so a dark page never flashes white.

export type ThemeChoice = 'system' | 'light' | 'dark'
export const THEME_KEY = 'mai-tutor:theme'

const listeners = new Set<() => void>()

function readChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    return raw === 'light' || raw === 'dark' ? raw : 'system'
  } catch {
    return 'system'
  }
}

let current = readChoice()

function setChoice(choice: ThemeChoice) {
  current = choice
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, choice)
  } catch {
    // Kept for this visit only.
  }
  for (const listener of listeners) listener()
}

// Another tab changed it.
window.addEventListener('storage', (e) => {
  if (e.key !== THEME_KEY) return
  current = readChoice()
  for (const listener of listeners) listener()
})

export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const choice = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => current,
  )
  return [choice, setChoice]
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Keeps <html data-theme> in step with the choice, and with the device's setting while it's "system". */
export function useApplyTheme() {
  const [choice] = useThemeChoice()
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const apply = () => {
      const dark = choice === 'dark' || (choice === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [choice])
}
