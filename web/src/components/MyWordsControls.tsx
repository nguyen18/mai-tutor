import { useId, useRef, useState, type FormEvent } from 'react'
import { ACCEPTED_FILES, MAX_MY_WORDS, readWordsFile, wordsFromText } from '../lib/myWords'
import { backendConfigured } from '../lib/backend'
import { ROUTE_HREF } from '../lib/useRoute'

type Props = {
  words: string[]
  onAdd: (words: string[]) => number
  onReplace: (words: string[]) => void
  translating: boolean
  failedCount: number
  onRetry: () => void
}

// Words found in pasted text or a file, waiting for the user to replace or add to their list.
type Found = { words: string[]; source: string }

// Under the "100 most common words you use" list: ways to fill it (the Discoverer, typing or pasting,
// uploading a file), translation status, and clearing it.
export function MyWordsControls({ words, onAdd, onReplace, translating, failedCount, onRetry }: Props) {
  const id = useId()
  const [text, setText] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const empty = words.length === 0
  // A full list hides the box for typing words (owner's request 2026-10-01); uploading stays, since a
  // file can replace the list.
  const full = words.length >= MAX_MY_WORDS

  const offer = (found: string[], source: string) => {
    setMessage(null)
    if (!found.length) return setMessage(`No English words found in ${source}.`)
    // An empty list just takes them (no "Added N words from …" line: the list shows them; owner's
    // request 2026-10-30); otherwise ask whether to replace the list or add to it.
    if (empty) onReplace(found)
    else setFound({ words: found, source })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    const parsed = wordsFromText(text)
    // A few words typed in go straight in; a pasted list or text gets the replace/add choice.
    if (!empty && parsed.length <= 5 && !text.includes('\n')) {
      const added = onAdd(parsed)
      setMessage(
        added
          ? null
          : words.length >= MAX_MY_WORDS
            ? `Your list is full (${MAX_MY_WORDS} words). Remove some words first.`
            : 'Already in your list.',
      )
    } else offer(parsed, 'what you entered')
    setText('')
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    try {
      offer(wordsFromText(await readWordsFile(file)), `“${file.name}”`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Couldn’t read that file.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="custom-controls my-words-controls">
      {empty && (
        <div className="my-words-intro">
          <p>Make this list your own: your most common words, translated.</p>
          <ul>
            <li>
              <a href={ROUTE_HREF.discover}>Chat with Mai</a> and she’ll find them for you,
            </li>
            <li>type or paste English words below (or any English text, and the most common words are used),</li>
            <li>or upload a .txt or Word (.docx) file with your words or your writing.</li>
          </ul>
        </div>
      )}

      {translating && <p className="muted my-words-status">Translating your words…</p>}
      {failedCount > 0 &&
        (backendConfigured ? (
          <p className="error my-words-status">
            Couldn’t translate {failedCount} {failedCount === 1 ? 'word' : 'words'}.{' '}
            <button type="button" className="link" onClick={onRetry}>
              Try again
            </button>
          </p>
        ) : (
          <p className="muted my-words-status">
            {failedCount} {failedCount === 1 ? 'word isn’t' : 'words aren’t'} in the built-in translations, and the
            translation service isn’t set up here (see web/.env.example).
          </p>
        ))}

      {found ? (
        <div className="my-words-found" role="group" aria-label="Words found">
          <p>
            Found {found.words.length} {found.words.length === 1 ? 'word' : 'words'} in {found.source}:{' '}
            <span className="muted">
              {found.words.slice(0, 12).join(', ')}
              {found.words.length > 12 ? ', …' : ''}
            </span>
          </p>
          <div className="form-row">
            <button
              type="button"
              className="primary"
              onClick={() => {
                onReplace(found.words)
                setFound(null)
              }}
            >
              Replace my list
            </button>
            <button
              type="button"
              onClick={() => {
                const added = onAdd(found.words)
                const full = words.length + added >= MAX_MY_WORDS
                // Only the warning, not "Added N new words".
                setMessage(full ? `Your list is full (${MAX_MY_WORDS} words): remove some to add more.` : null)
                setFound(null)
              }}
            >
              Add to my list
            </button>
            <button type="button" className="link" onClick={() => setFound(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        // Compact once the list has words: the box and buttons share one row, and the count and "Clear list"
        // a small line under it (owner's feedback 2026-10-01: the section took up too much space).
        <form className={empty ? 'add-word-form' : 'add-word-form compact'} onSubmit={submit} aria-label="Add your words">
          {!full && (
            <label htmlFor={`${id}-words`} className="sr-only">
              English words or text
            </label>
          )}
          <div className="form-row my-words-input">
            {full ? (
              <span className="muted my-words-full">Your list is full. Remove a word (✕) to add another.</span>
            ) : (
              <>
                <textarea
                  id={`${id}-words`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter adds; Shift+Enter starts a new line (for pasting or typing a list).
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      e.currentTarget.form?.requestSubmit()
                    }
                  }}
                  placeholder={empty ? 'I, you, like, so, yeah… or paste some of your writing' : 'Add a word, or paste more'}
                  rows={empty ? 3 : 1}
                  autoCapitalize="off"
                />
                <button type="submit" className="primary" disabled={!text.trim()}>
                  Add
                </button>
              </>
            )}
            <button type="button" className="upload-words" onClick={() => fileRef.current?.click()}>
              Upload your list of words
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_FILES}
              hidden
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </div>
        </form>
      )}
      {message && <p className="muted my-words-status">{message}</p>}
      {!empty && (
        <p className="muted my-words-meta">
          {words.length} of {MAX_MY_WORDS} words ·{' '}
          {confirmingClear ? (
            <>
              Clear all {words.length} words?{' '}
              <button
                type="button"
                className="link danger-link"
                onClick={() => {
                  onReplace([])
                  setConfirmingClear(false)
                }}
              >
                Clear
              </button>{' '}
              <button type="button" className="link" onClick={() => setConfirmingClear(false)}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" className="link danger-link" onClick={() => setConfirmingClear(true)}>
              Clear list
            </button>
          )}
        </p>
      )}
      {/* The Discoverer's way in from the Cheatsheet (owner's request 2026-10-01: here, not in the menu). */}
      <a className="discover-link" href={ROUTE_HREF.discover}>
        <span>
          Find your words by chatting with Mai: <strong>Personal Word List Discoverer</strong>
        </span>
        <span aria-hidden="true">→</span>
      </a>
    </div>
  )
}
