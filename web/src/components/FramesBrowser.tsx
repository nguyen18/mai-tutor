import { useEffect, useState } from 'react'
import { FRAME_TOPICS, loadFrames, type Frame } from '../lib/frames'
import type { TargetLanguage } from '../lib/languages'
import { OfflineHint } from './OfflineHint'

// Sentence frames to write with, by topic, in the learner's region: tapping one puts its pattern into the
// entry (JournalEditor selects the first slot, so typing replaces "{place}").

type Props = { target: TargetLanguage; onPick: (frame: Frame) => void }

export function FramesBrowser({ target, onPick }: Props) {
  const [frames, setFrames] = useState<Frame[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [topic, setTopic] = useState(FRAME_TOPICS[0].id)

  useEffect(() => {
    let cancelled = false
    loadFrames(target)
      .then((f) => !cancelled && setFrames(f))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [target])

  if (failed)
    return (
      <p className="muted">
        Couldn't load the sentence frames. Check your connection and try again.
        <OfflineHint target={target} />
      </p>
    )
  if (!frames) return <p className="muted">Loading sentence frames…</p>
  if (!frames.length) return <p className="muted">No sentence frames for {target.label} yet.</p>

  const shown = frames.filter((f) => f.topic === topic)
  return (
    <div className="frames-browser">
      <div className="chips" role="tablist" aria-label="Topics">
        {FRAME_TOPICS.filter((t) => frames.some((f) => f.topic === t.id)).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === topic}
            className={t.id === topic ? 'chip picked' : 'chip'}
            onClick={() => setTopic(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ul className="frames-list">
        {shown.map((f) => (
          <li key={f.id}>
            <button type="button" className="frame-option" onClick={() => onPick(f)}>
              <span className="frame-text" lang={target.code}>
                {f.text}
              </span>
              <span className="muted">{f.en}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
