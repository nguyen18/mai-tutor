import { useSyncExternalStore } from 'react'
import { useTargetLanguage } from './languages'

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

// The countries whose voices suit a region of the language being learned, best first (owner's question
// 2026-11-02, "are there different dialects for the voices?"): Spanish voices come per country (es-MX, es-ES,
// es-US…). Vietnamese voices aren't per region (vi-VN; Apple's Linh and Google's are Northern), so a Southern
// learner hears a Northern voice until Mai has one of her own.
const LATIN_AMERICA = ['MX', '419', 'US', 'CO', 'AR']
const REGION_COUNTRIES: Record<string, string[]> = {
  Spain: ['ES'],
  Mexico: ['MX', ...LATIN_AMERICA],
  'Latin America': LATIN_AMERICA,
  Argentina: ['AR', ...LATIN_AMERICA],
  Colombia: ['CO', ...LATIN_AMERICA],
}
// Apple's character voices (Grandma, Rocko, Zarvox…) are listed for every language; a learner wants a plain one.
const NOVELTY = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/

/** The device's best voice for a language code ("vi", "es"): the region's country first, then a plain voice
 * over a character one, a local one over an online one. */
export function voiceFor(list: SpeechSynthesisVoice[], lang: string, region?: string): SpeechSynthesisVoice | undefined {
  const code = lang.toLowerCase()
  const countries = (region && REGION_COUNTRIES[region]) || []
  const score = (v: SpeechSynthesisVoice) => {
    const country = v.lang.replace('_', '-').split('-')[1]?.toUpperCase() ?? ''
    const at = countries.indexOf(country)
    return (at < 0 ? 0 : 10 * (countries.length - at)) + (NOVELTY.test(v.name) ? 0 : 4) + (v.localService ? 2 : 0) + (v.default ? 1 : 0)
  }
  const fits = list.filter((v) => v.lang.toLowerCase().replace('_', '-').split('-')[0] === code)
  return fits.reduce<SpeechSynthesisVoice | undefined>((best, v) => (!best || score(v) > score(best) ? v : best), undefined)
}

/** The voice for `lang`, or undefined when the device has none (or no speech at all). Words in the language
 * being learned get a voice from the learner's region (Settings). */
export function useVoice(lang: string | undefined) {
  const list = useSyncExternalStore(subscribe, snapshot, () => cached)
  const [target] = useTargetLanguage()
  return lang ? voiceFor(list, lang, target.code === lang ? target.region : undefined) : undefined
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
