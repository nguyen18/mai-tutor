import { useSyncExternalStore } from 'react'

// Reading words aloud with the device's built-in voices (owner's request 2026-11-02: hear any word or phrase
// in a word box). Free and offline where the device has a voice for the language (macOS and iOS ship Vietnamese
// "Linh", Android's Google voices cover it); with none, the speak button isn't shown.

// A little slower than normal, for learners.
const RATE = 0.85

const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null)

// Voices load late in some browsers (Chrome fills the list after a `voiceschanged` event), so components
// subscribe to it.
function subscribe(onChange: () => void) {
  const s = synth()
  s?.addEventListener('voiceschanged', onChange)
  return () => s?.removeEventListener('voiceschanged', onChange)
}
const voices = () => synth()?.getVoices() ?? []
let cached: SpeechSynthesisVoice[] = []
function snapshot() {
  const now = voices()
  if (now.length !== cached.length || now.some((v, i) => v !== cached[i])) cached = now
  return cached
}

/** The device's best voice for a language code ("vi", "es"): a local one first, then the browser's default. */
export function voiceFor(list: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
  const code = lang.toLowerCase()
  const fits = list.filter((v) => v.lang.toLowerCase().replace('_', '-').split('-')[0] === code)
  return fits.find((v) => v.localService && v.default) ?? fits.find((v) => v.localService) ?? fits.find((v) => v.default) ?? fits[0]
}

/** The voice for `lang`, or undefined when the device has none (or no speech at all). */
export function useVoice(lang: string | undefined) {
  const list = useSyncExternalStore(subscribe, snapshot, () => cached)
  return lang ? voiceFor(list, lang) : undefined
}

/** Reads `text` aloud with `voice`, stopping anything already being read. */
export function speak(text: string, voice: SpeechSynthesisVoice) {
  const s = synth()
  if (!s || !text.trim()) return
  s.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  u.rate = RATE
  s.speak(u)
}
