import { useEffect, useMemo, useRef, useState } from 'react'
import { QUESTION_COUNT, MAI_SCRIPT } from '../lib/conversation'
import { displayWord, tokenize, topWords } from '../lib/wordCounts'
import { saveMyWords } from '../lib/myWords'
import { useStored } from '../lib/localStore'
import { ROUTE_HREF } from '../lib/useRoute'
import { dictationSupported, useDictation } from '../lib/useDictation'
import maiAvatar from '../assets/mai-placeholder.png'

const FILLER_CHIPS = ['um', 'uh']

type SavedState = {
  replies: string[]
  draft: string
}

const EMPTY_STATE: SavedState = { replies: [], draft: '' }

// The Personal Word List Discoverer: chat with Mai, then see your top 100 words.
export function Discoverer() {
  const [state, setState] = useStored<SavedState>('mai-tutor:chat', EMPTY_STATE)
  const [view, setView] = useState<'chat' | 'results'>('chat')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { replies, draft } = state
  const finished = replies.length >= QUESTION_COUNT

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [replies.length, view])

  const setDraft = (text: string) => setState((s) => ({ ...s, draft: text }))

  const dictation = useDictation((text) =>
    setState((s) => {
      const sep = s.draft && !/\s$/.test(s.draft) ? ' ' : ''
      return { ...s, draft: s.draft + sep + text }
    }),
  )

  // Stop dictating when leaving the chat so speech never lands somewhere unexpected.
  const { stop: stopDictation } = dictation
  useEffect(() => stopDictation(), [view, stopDictation])

  const send = () => {
    if (!draft.trim() || finished) return
    dictation.stop()
    setState((s) => ({ replies: [...s.replies, s.draft.trim()], draft: '' }))
  }

  const insertFiller = (filler: string) => {
    const el = textareaRef.current
    const start = el?.selectionStart ?? draft.length
    const end = el?.selectionEnd ?? draft.length
    const before = draft.slice(0, start)
    const lead = before && !/\s$/.test(before) ? ' ' : ''
    const insert = `${lead}${filler}, `
    setDraft(before + insert + draft.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      const pos = start + insert.length
      el?.setSelectionRange(pos, pos)
    })
  }

  const startOver = () => {
    if (!window.confirm('Clear the conversation and start over?')) return
    setState(EMPTY_STATE)
    setView('chat')
  }

  if (view === 'results') {
    return <Results texts={replies} onBack={() => setView('chat')} onStartOver={startOver} />
  }

  // Mai's lines shown so far: one per reply, plus the next line waiting for an answer (or the goodbye).
  const maiLines = MAI_SCRIPT.slice(0, replies.length + 1)

  return (
    <main className="app">
      <header className="header">
        <p className="eyebrow">Personal Word List Discoverer</p>
        <h1>Chat with Mai</h1>
        <p className="muted">
          {Math.min(replies.length, QUESTION_COUNT)} of {QUESTION_COUNT} replies · talk the way you
          normally would
        </p>
      </header>

      <section className="messages">
        {maiLines.map((line, i) => (
          <div key={i} className="turn">
            <div className="mai-row">
              <img className="mai-avatar" src={maiAvatar} alt="" />
              <div className="bubble mai">
                <span className="speaker">Mai</span>
                {line}
              </div>
            </div>
            {replies[i] !== undefined && <div className="bubble user">{replies[i]}</div>}
          </div>
        ))}
        <div ref={bottomRef} />
      </section>

      {finished ? (
        <div className="footer-actions">
          <button type="button" className="primary" onClick={() => setView('results')}>
            See my top 100 words
          </button>
        </div>
      ) : (
        <section className="composer">
          {dictation.listening && (
            <p className="interim muted">{dictation.interim || 'Listening…'}</p>
          )}
          {dictation.error && <p className="error">{dictation.error}</p>}

          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Reply to Mai… (Enter to send, Shift+Enter for a new line)"
            rows={3}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />

          <div className="chips">
            {dictationSupported ? (
              <button
                type="button"
                className={dictation.listening ? 'mic listening' : 'mic'}
                onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
              >
                {dictation.listening ? '■ Stop' : '🎤 Dictate'}
              </button>
            ) : (
              <span className="muted">This browser can't dictate. Try Chrome or Safari, or your OS dictation.</span>
            )}
            {FILLER_CHIPS.map((f) => (
              <button key={f} type="button" className="chip" onClick={() => insertFiller(f)}>
                + {f}
              </button>
            ))}
            <button
              type="button"
              className="primary send"
              onClick={send}
              disabled={!draft.trim()}
            >
              Send
            </button>
          </div>

          {replies.length > 0 && (
            <button type="button" className="link" onClick={() => setView('results')}>
              End chat and see my top 100 words
            </button>
          )}
        </section>
      )}
    </main>
  )
}

function Results({
  texts,
  onBack,
  onStartOver,
}: {
  texts: string[]
  onBack: () => void
  onStartOver: () => void
}) {
  const words = useMemo(() => topWords(texts, 100), [texts])
  const totalWords = useMemo(() => texts.reduce((n, t) => n + tokenize(t).length, 0), [texts])
  const fromAnswers = words.filter((w) => !w.suggested).length
  const max = words[0]?.count || 1

  return (
    <main className="app">
      <header className="header">
        <p className="eyebrow">Personal Word List Discoverer</p>
        <h1>Your top {words.length} words</h1>
        <p className="muted">
          From {texts.length} replies · {totalWords} words total
        </p>
        {fromAnswers < words.length && (
          <p className="muted">
            {fromAnswers} came from your replies. The other {words.length - fromAnswers} are common
            everyday words, marked "suggested".
          </p>
        )}
      </header>

      <ol className="word-list">
        {words.map(({ word, count, suggested }, i) => (
          <li key={word} className={suggested ? 'suggested' : undefined}>
            <span className="rank">{i + 1}</span>
            <span className="word">{displayWord(word)}</span>
            {suggested ? (
              <span className="suggested-label">suggested</span>
            ) : (
              <span className="bar">
                <span style={{ width: `${(count / max) * 100}%` }} />
              </span>
            )}
            <span className="count">{suggested ? '' : count}</span>
          </li>
        ))}
      </ol>

      <div className="footer-actions">
        {fromAnswers > 0 && (
          // Only the user's own words (not the suggested ones) become their Cheatsheet list.
          <button
            type="button"
            className="primary"
            onClick={() => {
              saveMyWords(words.filter((w) => !w.suggested).map((w) => displayWord(w.word)))
              window.location.hash = ROUTE_HREF.cheatsheet
            }}
          >
            Use my words on the Cheatsheet
          </button>
        )}
        <button type="button" onClick={onBack}>
          Back to the chat
        </button>
        <button type="button" onClick={onStartOver}>
          Start over
        </button>
      </div>
    </main>
  )
}
