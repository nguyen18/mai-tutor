import { useEffect, useRef, useState } from 'react'
import { speak, stopSpeaking } from '../lib/speech'

// The triangle's box is a little right of centre (3.5–13.6 of 16), so it looks centred in the circle.
const PLAY = 'M3.5 2.6v10.8a.6.6 0 0 0 .9.5l8.6-5.4a.6.6 0 0 0 0-1L4.4 2.1a.6.6 0 0 0-.9.5z'
const PAUSE = 'M4 2.5h2.6v11H4zM9.4 2.5H12v11H9.4z'

// A word box's play button (lib/speech.ts): reads the text aloud, showing pause while it plays (owner's request
// 2026-11-03); pressing it then stops. Closing the box stops it too.
export function SpeakButton({ text, lang, voice }: { text: string; lang: string; voice: SpeechSynthesisVoice }) {
  const [playing, setPlaying] = useState(false)
  const utterance = useRef<SpeechSynthesisUtterance | undefined>(undefined)
  const playingRef = useRef(false)
  useEffect(() => {
    playingRef.current = playing
  })
  useEffect(
    () => () => {
      if (playingRef.current) stopSpeaking()
    },
    [],
  )

  const onClick = () => {
    if (playing) {
      stopSpeaking()
      setPlaying(false)
      return
    }
    const u = speak(text, voice, () => {
      if (utterance.current === u) setPlaying(false)
    })
    utterance.current = u
    setPlaying(Boolean(u))
  }

  return (
    <button
      type="button"
      className="tip-speak"
      lang={lang}
      aria-label={playing ? `Stop reading “${text}”` : `Hear “${text}”`}
      title={playing ? 'Stop' : `Hear “${text}”`}
      aria-pressed={playing}
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d={playing ? PAUSE : PLAY} fill="currentColor" />
      </svg>
    </button>
  )
}
