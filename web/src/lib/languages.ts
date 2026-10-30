import { useStored, type Codec } from './localStore'
import { TARGET_LANGUAGES, type TargetLanguage } from './targets'

export { TARGET_LANGUAGES, type TargetLanguage } from './targets'

// Southern Vietnamese was the only language before Settings existed (2026-10-01).
export const DEFAULT_TARGET = TARGET_LANGUAGES[0]

export function targetById(id: string | null | undefined): TargetLanguage {
  return TARGET_LANGUAGES.find((t) => t.id === id) ?? DEFAULT_TARGET
}

// Saved as the plain id ("vi-Southern"), not JSON.
const PLAIN: Codec<string | null> = { parse: (raw) => raw, serialize: (id) => id ?? '' }

/** The language the site translates into, shared by every page and kept in sync across tabs and devices. */
export function useTargetLanguage(): [TargetLanguage, (id: string) => void] {
  const [id, setId] = useStored<string | null>('mai-tutor:target-language', null, PLAIN)
  return [targetById(id), setId]
}
