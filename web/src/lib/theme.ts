import { useEffect, useSyncExternalStore } from 'react'

// Light or dark (owner's request 2026-10-30): the device's setting by default, or one chosen in Settings.
// The choice is this device's own (not synced: a phone and a laptop can differ). The page wears the result
// as <html data-theme="light|dark">, which App.css's dark tokens key on; index.html sets it before the
// first paint (from the same localStorage key) so a dark page never flashes white. The colorblind-friendly
// dark mode (owner's request 2026-10-30) is dark plus <html data-palette="colorblind">, which swaps Mai's
// colour codes (correction highlights, red corrections and translations) for the Okabe-Ito palette.

export type ThemeChoice = 'system' | 'light' | 'dark' | 'dark-colorblind'
export const THEME_KEY = 'mai-tutor:theme'

const listeners = new Set<() => void>()

function readChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    return raw === 'light' || raw === 'dark' || raw === 'dark-colorblind' ? raw : 'system'
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
      const colorblind = choice === 'dark-colorblind'
      const dark = choice === 'dark' || colorblind || (choice === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      if (colorblind) document.documentElement.dataset.palette = 'colorblind'
      else delete document.documentElement.dataset.palette
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [choice])
}
