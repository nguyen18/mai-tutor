import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AudioNotePlayer } from '../components/AudioNoteRecorder'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { JournalEditor } from '../components/JournalEditor'
import { JournalSheet } from '../components/JournalSheet'
import { backendConfigured } from '../lib/backend'
import { nowLocal, useJournal, useJournalExtraChecks, type JournalEntry } from '../lib/journal'
import { Popover } from '../components/Popover'
import {
  changeKey,
  keepCapital,
  keptWordKey,
  checkCaption,
  checkSpelling,
  kindOf,
  reviewNotes,
  alignSentence,
  joinedWordsIn,
  sameLetters,
  shownWord,
  wordTokens,
  withAcceptedHints,
  type SpellingCheck,
  type WordOption,
  type ReviewChange,
} from '../lib/spelling'
import type { CheatsheetEntry, Meaning } from '../lib/cheatsheet'
import { targetById, useTargetLanguage, type TargetLanguage } from '../lib/languages'
import { entryFor } from '../lib/translateWords'
import { entryDate, monthLabel } from '../lib/journalDates'
import { EntryHead } from '../components/EntryHead'
import { loadWordOptions, type WordAlternatives } from '../lib/wordOptions'
import { currentCheck, useWordLookups } from '../lib/wordLookups'

// The journal: entries written in the target language (English where the learner doesn't know a word yet),
// latest on top. Each shows the user's own words untouched (blue), and underneath, Mai's corrected copy
// (red), sentence by sentence, from which-dialect's journal review.

// The page is styled like a zine journal (Daplit, owner's reference 2026-10-01): graph paper, thin ink
// lines, headings framed by slashes ("/ Journal /").

type Editing = { entry?: JournalEntry } | null
// Per entry: a check in progress, or the last one that failed.
type CheckState = Record<string, 'checking' | 'failed'>

export function Journal() {
  const [target] = useTargetLanguage()
  const { entries, error, save, remove } = useJournal()
  const [extraChecks] = useJournalExtraChecks()
  const [editing, setEditing] = useState<Editing>(null)
  // The month whose entries show ("2026-10"; owner's request 2026-10-30): this month to start with.
  const [month, setMonth] = useState(() => nowLocal().slice(0, 7))
  const [checks, setChecks] = useState<CheckState>({})
  // Every word box's content, fetched ahead of a tap and saved with the entry.
  useWordLookups(entries, save)
  // The latest entries, for checks that finish after the entry was edited again.
  const entriesRef = useRef(entries)
  useLayoutEffect(() => {
    entriesRef.current = entries
  })

  const runCheck = async (entry: JournalEntry) => {
    if (!entry.text || !backendConfigured) return
    setChecks((c) => ({ ...c, [entry.id]: 'checking' }))
    try {
      const check = await checkSpelling(targetById(entry.targetId), entry.text, extraChecks)
      // Saved onto the entry as it is now, unless its words changed while Mai was checking.
      const latest = entriesRef.current?.find((e) => e.id === entry.id)
      if (latest && latest.text === entry.text) await save({ ...latest, check })
      setChecks((c) => {
        const next = { ...c }
        delete next[entry.id]
        return next
      })
    } catch {
      setChecks((c) => ({ ...c, [entry.id]: 'failed' }))
    }
  }

  // Captions are checked one by one (a few words each), and saved onto the entry as it is by then, for
  // captions that didn't change while Mai was checking.
  const runCaptionChecks = async (entry: JournalEntry) => {
    if (!backendConfigured) return
    const stale = entry.items.filter((i) => i.caption?.trim() && i.captionCheck?.input !== i.caption)
    if (!stale.length) return
    const lang = targetById(entry.targetId)
    const results = await Promise.all(
      stale.map(async (i) => ({ id: i.id, caption: i.caption!, check: await checkCaption(lang, i.caption!, extraChecks).catch(() => null) })),
    )
    const latest = entriesRef.current?.find((e) => e.id === entry.id)
    if (!latest) return
    const items = latest.items.map((i) => {
      const r = results.find((x) => x.id === i.id && x.caption === i.caption && x.check)
      return r ? { ...i, captionCheck: r.check! } : i
    })
    await save({ ...latest, items })
  }

  const onSave = async (entry: JournalEntry) => {
    await save(entry)
    setEditing(null)
    // An entry dated in another month shows there, rather than seeming to disappear.
    setMonth(entry.when.slice(0, 7))
    window.scrollTo(0, 0)
    // Check again only what changed since the last check: the words, then the captions (one after the
    // other, so neither save overwrites the other's).
    void (async () => {
      if (entry.text && entry.check?.input !== entry.text) await runCheck(entry)
      await runCaptionChecks(entry)
    })()
  }

  return (
    <main className="journal-page">
      {/* New entry, in the top-right corner: fixed on a computer, at the top of the page on a phone (App.css).
          The editor opens at the top of the page, so the page scrolls up to it. */}
      <div className="journal-corner">
        {!editing && (
          <button
            type="button"
            className="icon-button new-entry-fab"
            aria-label="New entry"
            title="New entry"
            onClick={() => {
              setEditing({})
              window.scrollTo(0, 0)
            }}
          >
            ＋
          </button>
        )}
      </div>
      <div className="journal-inner">
        <header className="journal-top">
          {/* No visible title (owner's request): the page's heading is for screen readers. */}
          <h1 className="sr-only">Journal</h1>
          {entries && entries.length > 0 && (
            <MonthPicker month={month} entries={entries} lang={target.code} onChange={setMonth} />
          )}
          {/* The how-to sits behind an ⓘ at the end of the highlight key (owner's request 2026-10-30, with the
              page title gone): hover on a computer, tap on a phone. */}
          <HighlightKey
            extraChecks={extraChecks}
            target={target}
            info={
              <Popover
                title="How the journal works"
                trigger="i"
                triggerClassName="page-info"
                triggerLabel="How the journal works"
                align="start"
                wrapClassName="page-info-wrap"
              >
                <div className="page-intro">
                  <p>
                    Write about your favorite topics, feelings or your day in <strong>{target.label}</strong>.
                  </p>
                  <p>
                    Stuck on a word? Write it in English and Mai fills it in: your words stay blue, Mai's notes
                    are red.
                  </p>
                </div>
              </Popover>
            }
          />
        </header>

        {error && <p className="error">{error}</p>}

        {editing ? (
          <JournalEditor
            key={editing.entry?.id ?? 'new'}
            target={editing.entry ? targetById(editing.entry.targetId) : target}
            entry={editing.entry}
            onSave={onSave}
            onCancel={() => setEditing(null)}
          />
        ) : (
          entries?.length === 0 && (
            <div className="journal-new">
              <button type="button" className="primary" onClick={() => setEditing({})}>
                ✎ Write your first entry
              </button>
            </div>
          )
        )}

        {entries === null ? (
          <p className="muted">Loading your journal…</p>
        ) : entries.length === 0 ? null : !entries.some((e) => e.when.startsWith(month)) ? (
          <p className="muted journal-month-empty">No entries in {monthLabel(month, target.code)} yet.</p>
        ) : (
          <ol className="journal-list">
            {entries
              .filter((e) => e.when.startsWith(month) && e.id !== editing?.entry?.id)
              .map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  currentTarget={target.id}
                  checkState={checks[entry.id]}
                  onCheck={() => runCheck(entry)}
                  extraChecks={extraChecks}
                  onAcceptHint={(key) =>
                    entry.check &&
                    save({ ...entry, check: { ...entry.check, acceptedHints: [...(entry.check.acceptedHints ?? []), key] } })
                  }
                  onPickWord={(key, word) =>
                    entry.check && save({ ...entry, check: { ...entry.check, wordPicks: { ...entry.check.wordPicks, [key]: word } } })
                  }
                  onEdit={() => {
                    setEditing({ entry })
                    window.scrollTo(0, 0)
                  }}
                  onDelete={() => remove(entry.id)}
                />
              ))}
          </ol>
        )}
      </div>
    </main>
  )
}

type CardProps = {
  entry: JournalEntry
  /** The language being learned now: an entry in another one says which. */
  currentTarget: string
  checkState?: 'checking' | 'failed'
  onCheck: () => void
  extraChecks: boolean
  onAcceptHint: (key: string) => void
  onPickWord: (key: string, word: string) => void
  onEdit: () => void
  onDelete: () => void
}

// The paper's bottom row (the audio note, ✎ and ✕) sits in the middle of a row of its grid (owner's
// feedback 2026-10-31): the paper is made just tall enough to end on a grid line, a row below what's written.
// The text's line boxes start 6px below the grid's lines (App.css), so up to SPILL px of content may run into
// the bottom row: that's the leading under a line's letters.
const SPILL = 10
// Paper left under the bottom row (owner's request 2026-10-31); .entry-tools sits this far up (App.css).
const UNDER_ROW = 8

function useGridBottomRow(paperRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const paper = paperRef.current
    if (!paper) return
    const snap = () => {
      const style = getComputedStyle(paper)
      const row = parseFloat(style.backgroundSize)
      const offset = parseFloat(style.backgroundPositionY)
      if (!row) return
      const top = paper.getBoundingClientRect().top
      let end = 0
      for (const el of paper.children) {
        if (el.classList.contains('entry-tools') || getComputedStyle(el).position === 'fixed') continue
        end = Math.max(end, el.getBoundingClientRect().bottom - top + parseFloat(getComputedStyle(el).marginBottom))
      }
      const rowTop = offset + Math.max(0, Math.ceil((end - SPILL - offset) / row)) * row
      paper.style.paddingBottom = `${rowTop + row - end + UNDER_ROW}px`
    }
    snap()
    const observer = new ResizeObserver(snap)
    for (const el of paper.children) if (!el.classList.contains('entry-tools')) observer.observe(el)
    return () => observer.disconnect()
  })
}

function EntryCard({ entry, currentTarget, checkState, onCheck, extraChecks, onAcceptHint, onPickWord, onEdit, onDelete }: CardProps) {
  const paperRef = useRef<HTMLDivElement>(null)
  useGridBottomRow(paperRef)
  const [confirming, setConfirming] = useState(false)
  const [asking, setAsking] = useState(false)
  const lang = targetById(entry.targetId)
  // A check from before the entry was last edited (or in an older format) doesn't count.
  const check = currentCheck(entry)

  const date = entryDate(entry.when, lang.code)

  return (
    <li className="journal-entry">
      <EntryHead when={entry.when} date={date} label={entry.targetId !== currentTarget ? lang.label : undefined} lang={lang.code} />

      {/* One sheet of paper: the learner's page, then Mai's notes written at the bottom of it. */}
      <div ref={paperRef} className={check ? 'entry-paper annotated' : 'entry-paper'}>
        {/* The audio note's bar, then edit and delete, along the bottom of the page under the text. */}
        <div className={entry.audio ? 'entry-tools with-audio' : 'entry-tools'}>
          {entry.audio && !confirming && <AudioNotePlayer audio={entry.audio} bare />}
          {confirming ? (
            <span className="journal-confirm">
              <button type="button" className="chip danger" onClick={() => setAsking(true)}>
                Delete
              </button>{' '}
              <button type="button" className="chip" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </span>
          ) : (
            <>
              <button type="button" className="icon-button small" aria-label="Edit entry" title="Edit" onClick={onEdit}>
                ✎
              </button>
              <button type="button" className="icon-button small" aria-label="Delete entry" title="Delete" onClick={() => setConfirming(true)}>
                ✕
              </button>
            </>
          )}
        </div>
        {/* Three clicks to delete (owner's request 2026-10-30): ✕, the red Delete, then Yes here. */}
        {asking && (
          <ConfirmDialog
            title="Are you sure?"
            message="This entry will be deleted. It can't be undone."
            confirmLabel="Yes"
            cancelLabel="No"
            onConfirm={onDelete}
            onCancel={() => {
              setAsking(false)
              setConfirming(false)
            }}
          />
        )}
        {(entry.text || entry.items.length > 0) && (
          <JournalSheet
            text={entry.text}
            items={entry.items}
            lang={lang.code}
            richText={check && <AnnotatedText check={check} onPickWord={onPickWord} target={lang} />}
          />
        )}

        {entry.text ? (
          <Correction
            check={check}
            state={checkState}
            onCheck={onCheck}
            extraChecks={extraChecks}
            onAcceptHint={onAcceptHint}
          />
        ) : (
          <p className="journal-nudge">
            Type out what you said in your audio note so Mai can check it. <button type="button" className="inline-link" onClick={onEdit}>Add it now</button>
          </p>
        )}
      </div>

    </li>
  )
}

type CorrectionProps = {
  check?: SpellingCheck
  state?: 'checking' | 'failed'
  onCheck: () => void
  /** The current setting, to offer a new check when the entry was checked with the other one. */
  extraChecks: boolean
  onAcceptHint: (key: string) => void
}

function Correction({ check, state, onCheck, extraChecks, onAcceptHint }: CorrectionProps) {
  if (!backendConfigured) {
    return <p className="muted journal-check-status">Corrections aren't set up on this site yet.</p>
  }
  if (state === 'checking') return <p className="muted journal-check-status">Mai is checking your entry…</p>
  if (!check) {
    return (
      <p className="muted journal-check-status">
        {state === 'failed' ? "Couldn't check the entry. " : 'Not checked yet. '}
        <button type="button" className="inline-link" onClick={onCheck}>
          {state === 'failed' ? 'Try again' : 'Check now'}
        </button>
      </p>
    )
  }

  const review = withAcceptedHints(check)
  const { hints } = reviewNotes(review)
  const accepted = new Set(check.acceptedHints ?? [])
  const openHints = hints.filter((h) => !accepted.has(h.key) && h.suggestions[0] !== undefined)

  // The corrections are written on the page (AnnotatedText); here, only what needs the learner: tips to
  // use, and a new check after the settings changed. (The "/ Mai's notes / N changes" line was removed,
  // owner's feedback 2026-10-01.)
  if (!openHints.length && check.extraChecks === extraChecks) return null
  return (
    <section className="journal-correction" aria-label="Mai's corrections">
      {openHints.length > 0 && (
        <ul className="journal-notes">
          {openHints.map((h) => (
            <li key={h.key} className="journal-tip">
              Tip: {h.message}{' '}
              <button type="button" className="chip" onClick={() => onAcceptHint(h.key)}>
                Use “{h.suggestions[0]}”
              </button>
            </li>
          ))}
        </ul>
      )}

      {check.extraChecks !== extraChecks && (
        <p className="muted journal-check-status">
          Checked {check.extraChecks ? 'with' : 'without'} regional words and pronouns.{' '}
          <button type="button" className="inline-link" onClick={onCheck}>
            Check again {extraChecks ? 'with' : 'without'} them
          </button>
        </p>
      )}

    </section>
  )
}

type AnnotatedProps = {
  check: SpellingCheck
  onPickWord: (key: string, word: string) => void
  target: TargetLanguage
}

/**
 * The learner's own text with Mai's corrections written above the words they replace, like a teacher's red
 * pen (owner's request 2026-10-01): English words are crossed out in red with the target-language word
 * over them; other fixes ("hom nay" → "hôm nay") are written over the original. Every word can be tapped:
 * corrections for why and other words to pick, the rest for their meaning and alternatives.
 */
export function AnnotatedText({ check, onPickWord, target }: AnnotatedProps) {
  const review = withAcceptedHints(check)
  const picks = check.wordPicks ?? {}
  const out: ReactNode[] = []
  // Words are buttons, and browsers may break a line after one, even before a full stop: punctuation right
  // after a word stays with it ("học." doesn't become "học" + "." on the next line).
  const pushPunctuation = (text: string, key: string) => {
    const glued = /^[^\s]+/.exec(text)?.[0]
    const last = out[out.length - 1]
    if (glued && last && typeof last === 'object') {
      out[out.length - 1] = (
        <span key={`${key}-glue`} className="nowrap">
          {last}
          {glued}
        </span>
      )
      if (text.length > glued.length) out.push(text.slice(glued.length))
    } else {
      out.push(text)
    }
  }
  let at = 0
  review.sentences.forEach((sentence, si) => {
    if (sentence.start > at) out.push(review.text.slice(at, sentence.start))
    const keyOf = (c: ReviewChange) => changeKey(si, sentence.changes.indexOf(c))
    for (const seg of alignSentence(sentence)) {
      if (seg.change) {
        const change = seg.change
        out.push(
          <ChangeMark
            key={`${si}-${seg.start}`}
            change={change}
            original={seg.text}
            shown={shownWord(change, picks[keyOf(change)])}
            onPick={(word) => onPickWord(keyOf(change), word)}
            target={target}
          />,
        )
        continue
      }
      for (const t of wordTokens(seg.text, joinedWordsIn(seg.text, sentence))) {
        const start = seg.start + t.start
        if (!t.word) {
          pushPunctuation(t.text, `${si}-${start}`)
          continue
        }
        const key = keptWordKey(si, start)
        out.push(
          <WordMark key={`${si}-${start}`} word={t.text} pick={picks[key]} onPick={(word) => onPickWord(key, word)} target={target} />,
        )
      }
    }
    at = sentence.end
  })
  if (at < review.text.length) out.push(review.text.slice(at))
  return <>{out}</>
}

type ChangeMarkProps = {
  change: ReviewChange
  /** The learner's words the change replaces: the correction is written above them. */
  original?: string
  /** The word shown: the learner's pick, or the review's. */
  shown: string
  onPick: (word: string) => void
  target: TargetLanguage
}

// A changed word in the corrected copy. Hover (or tap) opens a box like the Cheatsheet's: why it changed,
// and the other words it could be, to star the one that fits. English words Mai translated show every
// meaning of the English word with its translations (the meaning holding Mai's word first, since that's
// the one the sentence uses); other changes show the checker's alternatives ("khong": không, khổng, khống).
function ChangeMark({ change, original, shown, onPick, target }: ChangeMarkProps) {
  const kind = kindOf(change.kind)
  const lang = target.code
  const hasOptions = (change.options?.length ?? 0) > 1
  // Every correction to a word can be looked at and changed: English words through their Cheatsheet entry,
  // the others through the spellchecker's options and the word's own alternatives. Frame clauses can't.
  const choosable = change.kind === 'foreign-word' || (change.kind !== 'frame' && Boolean(change.to))
  const english = change.kind === 'foreign-word' || change.kind === 'frame'
  const meantTarget = english && original !== undefined && Boolean(shown) && sameLetters(original, shown)
  return (
    <Popover
      title={`${change.from} → ${shown}`}
      trigger={
        original !== undefined ? (
          // English (a word, or a clause a frame filled in) is crossed out; other fixes keep the original.
          // A pick with the same letters ("rat" → "rất": the learner meant a Vietnamese word) is an accent fix,
          // tinted and drawn like one; other English stays crossed out.
          <ruby className={meantTarget ? 'fix' : english ? 'fix crossed' : 'fix'}>
            <span className="fix-original">{original}</span>
            {/* A word left out ("the") is only crossed out: nothing goes above it. */}
            <rt className="fix-new" data-kind={shown ? (meantTarget ? kindOf('spelling').color : kind.color) : undefined}>
              {shown}
            </rt>
          </ruby>
        ) : (
          <>
            {shown}
            {choosable && <span className="choice-dot" aria-hidden="true" />}
          </>
        )
      }
      triggerClassName="change-mark"
      triggerLabel={`${shown}, changed from “${change.from}”: ${kind.label}${choosable ? '. Other words to choose from' : ''}`}
      wrapClassName={`change-wrap kind-${kind.color}`}
      lang={lang}
      align="start"
      contentKey={shown}
      report={{ word: shown || change.from, context: { language: lang, written: change.from, change: change.kind } }}
    >
      <p className="change-why">
        <span className="change-kind" data-kind={kind.color}>
          {kind.label}
        </span>
        <span>
          <s lang={lang}>{change.from}</s> → <strong lang={lang}>{shown}</strong>
        </span>
        <span>{change.why}</span>
      </p>
      {change.kind === 'foreign-word' ? (
        <TranslationChoices change={change} shown={shown} onPick={onPick} target={target} />
      ) : (
        choosable && (
          <>
            {hasOptions && (
              <WordOptions words={change.options!} shown={shown} reviewWord={change.to} onPick={onPick} lang={lang} />
            )}
            <WordAlternativesBox
              word={change.to}
              shown={shown}
              onPick={onPick}
              target={target}
              tag="Mai's pick"
              skipAccents={hasOptions}
            />
          </>
        )
      )}
    </Popover>
  )
}

// A word to choose: the checker's suggestion with its meanings, or a Cheatsheet translation with its gloss.
type Choice = WordOption | { text: string; gloss?: string; regions?: string[]; labels?: string[] }

type WordOptionsProps = {
  words: Choice[]
  shown: string
  /** The review's own choice (or the learner's own word), tagged with `tag`. */
  reviewWord: string
  tag?: string
  onPick: (word: string) => void
  lang: string
}

// Words to star, like the Cheatsheet's translation box, each with what it means so the learner can tell
// them apart ("muốn" to want, "muộn" late, "mượn" to borrow).
function WordOptions({ words, shown, reviewWord, tag = "Mai's pick", onPick, lang }: WordOptionsProps) {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  return (
    <div className="tip-options" role="group" aria-label="Words to choose from">
      <p className="tip-note-label">Star the one that fits</p>
      <ul>
        {words.map((option) => {
          const isPicked = same(option.text, shown)
          return (
            <li key={option.text}>
              <button
                type="button"
                className={isPicked ? 'tip-option picked' : 'tip-option'}
                aria-pressed={isPicked}
                onClick={() => onPick(option.text)}
              >
                <span className="star" aria-hidden="true">
                  {isPicked ? '★' : '☆'}
                </span>
                <span className="tip-option-text" lang={lang}>
                  {option.text}
                </span>
                <span className="tip-option-usage">
                  {'meanings' in option ? (
                    option.meanings.length ? (
                      option.meanings.map((m, mi) => (
                        <span key={mi} className="option-meaning">
                          <span className="pos-name">{m.posName}</span> {m.gloss}
                          {m.regions?.length ? <span className="region-badge"> {m.regions.join(', ')}</span> : null}
                          {m.labels?.length ? <span className="label-chips"> {m.labels.join(', ')}</span> : null}
                        </span>
                      ))
                    ) : (
                      <span className="muted">No definition found</span>
                    )
                  ) : (
                    <>
                      {option.gloss}
                      {option.regions?.length ? <span className="region-badge"> {option.regions.join(', ')}</span> : null}
                      {option.labels?.length ? <span className="label-chips"> {option.labels.join(', ')}</span> : null}
                    </>
                  )}
                </span>
                {same(option.text, reviewWord) && <span className="default-tag">{tag}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// An English word's meanings, each with its translations (the Cheatsheet's data, from the backend).
function TranslationChoices({ change, shown, onPick, target }: Omit<ChangeMarkProps, 'change'> & { change: ReviewChange }) {
  const [entry, setEntry] = useState<CheatsheetEntry | null | undefined>(undefined)
  const [meaningId, setMeaningId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    entryFor(target, change.from.toLowerCase())
      .then((e) => !cancelled && setEntry(e))
      .catch(() => !cancelled && setEntry(null))
    return () => {
      cancelled = true
    }
  }, [target, change.from])

  // No meanings to show: the checker's words, if it had more than one.
  const fallback =
    (change.options?.length ?? 0) > 1 ? (
      <WordOptions
        words={change.options!.map((o) => ({ text: o.text }))}
        shown={shown}
        reviewWord={change.to}
        onPick={onPick}
        lang={target.code}
      />
    ) : null
  // The learner may have meant a word of the language typed without accents ("rat": rất, very), which the
  // review took for English: offer those too.
  const meant = <MeantInTarget word={change.from} shown={shown} onPick={onPick} target={target} />
  if (entry === undefined) return <p className="muted">Looking up “{change.from}”…</p>
  const meanings = entry?.meanings.filter((m) => m.options.length > 0) ?? []
  if (!meanings.length) {
    return (
      <>
        {fallback}
        {meant}
      </>
    )
  }

  // The meaning the sentence uses: the one holding the shown word, else the one holding Mai's word.
  const holds = (m: Meaning, w: string) => m.options.some((o) => o.text.toLowerCase() === w.toLowerCase())
  const meaning =
    meanings.find((m) => m.id === meaningId) ??
    meanings.find((m) => holds(m, shown)) ??
    meanings.find((m) => holds(m, change.to)) ??
    meanings[0]

  const others = meanings.filter((m) => m.id !== meaning.id)
  return (
    <>
      <p className="tip-meaning">
        <span className="pos-name">{meaning.posName ?? meaning.pos}</span> {meaning.gloss}
      </p>
      <WordOptions words={meaning.options} shown={shown} reviewWord={change.to} onPick={onPick} lang={target.code} />
      {others.length > 0 && (
        <details className="other-meanings">
          <summary>
            Other meanings of “{change.from}” ({others.length})
          </summary>
          <ul className="tip-options" aria-label={`Other meanings of “${change.from}”`}>
            {others.map((m) => (
              <li key={m.id}>
                <button type="button" className="tip-option meaning-option" onClick={() => setMeaningId(m.id)}>
                  <span className="pos-name">{m.posName ?? m.pos}</span>
                  <span className="tip-option-usage">
                    <span className="meaning-gloss">{m.gloss}</span>
                    <span className="meaning-example" lang={target.code}>
                      {m.options
                        .slice(0, 3)
                        .map((o) => o.text)
                        .join(', ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {meant}
    </>
  )
}

// "Did you mean a Vietnamese word?": the words of the language spelled with the same letters as the one Mai
// took for English, with their meanings ("rat": rất "very", rát "burning"…). Nothing when there are none.
function MeantInTarget({ word, shown, onPick, target }: { word: string; shown: string; onPick: (w: string) => void; target: TargetLanguage }) {
  const [accents, setAccents] = useState<WordOption[] | null>(null)
  useEffect(() => {
    let cancelled = false
    loadWordOptions(target, word)
      .then((o) => !cancelled && setAccents(o?.accents ?? []))
      .catch(() => !cancelled && setAccents([]))
    return () => {
      cancelled = true
    }
  }, [target, word])
  if (!accents?.length) return null
  return (
    <>
      <p className="tip-note-label word-options-label">Or did you mean a {target.language} word?</p>
      <WordOptions words={accents} shown={shown} reviewWord="" onPick={onPick} lang={target.code} />
    </>
  )
}

type WordMarkProps = { word: string; pick?: string; onPick: (word: string) => void; target: TargetLanguage }

// A word Mai left as it is. Hover (or tap) for a box like the Cheatsheet's: what it means, the same letters
// with other accents (a real word with the wrong tone passes the spellchecker), and other words with the
// same meaning, to star another one. A pick shows in place of the word, tinted.
function WordMark({ word, pick, onPick, target }: WordMarkProps) {
  const shown = pick === undefined ? word : keepCapital(word, pick)
  const changed = shown.toLowerCase() !== word.toLowerCase()
  return (
    <Popover
      title={shown}
      trigger={
        changed ? (
          <ruby className="fix">
            <span className="fix-original">{word}</span>
            <rt className="fix-new picked">{shown}</rt>
          </ruby>
        ) : (
          shown
        )
      }
      triggerClassName={changed ? 'word-mark picked' : 'word-mark'}
      triggerLabel={`${shown}: see what it means and other words`}
      wrapClassName="word-wrap"
      lang={target.code}
      align="start"
      contentKey={shown}
      report={{ word: shown, context: { language: target.code, written: word } }}
    >
      <WordAlternativesBox word={word} shown={shown} onPick={onPick} target={target} />
    </Popover>
  )
}

type WordAlternativesProps = Omit<WordMarkProps, 'pick'> & {
  shown: string
  /** How the word itself is tagged in the lists: the learner's ("your word") or Mai's correction. */
  tag?: string
  /** Leave out "Same letters, other accents" (a correction already lists the spellchecker's). */
  skipAccents?: boolean
}

// A word's meaning and the words that could replace it, loaded from `word-options`: for words Mai left
// alone, and for corrections, so "hom nay" → "hôm nay" also shows "today" and "bữa nay".
function WordAlternativesBox({ word, shown, onPick, target, tag = 'your word', skipAccents = false }: WordAlternativesProps) {
  const [options, setOptions] = useState<WordAlternatives | null | undefined>(undefined)

  // Loaded the first time the box opens (the Popover renders its content only while open).
  useEffect(() => {
    let cancelled = false
    loadWordOptions(target, word)
      .then((o) => !cancelled && setOptions(o))
      .catch(() => !cancelled && setOptions(null))
    return () => {
      cancelled = true
    }
  }, [target, word])

  if (options === undefined) return <p className="muted">Looking up “{word}”…</p>
  if (options === null) return <p className="muted">Couldn't look up “{word}”.</p>

  const own = { ...options.word, text: word.toLowerCase() }
  const lang = target.code
  const accents = skipAccents ? [] : options.accents
  const alternatives = accents.length + options.synonyms.length > 0
  return (
    <>
      {/* With alternatives, the word's meanings show on its own row in the list; with skipAccents, in the
          correction's list above. */}
      {!alternatives && !skipAccents &&
        (own.meanings.length ? (
          <div className="tip-meanings">
            {own.meanings.map((m, i) => (
              <p key={i} className="tip-meaning">
                <span className="pos-name">{m.posName}</span> {m.gloss}
                {m.regions?.length ? <span className="region-badge"> {m.regions.join(', ')}</span> : null}
              </p>
            ))}
          </div>
        ) : (
          <p className="muted">No definition found for “{word}”.</p>
        ))}
      {accents.length > 0 && (
        <>
          <p className="tip-note-label word-options-label">Same letters, other accents</p>
          <WordOptions words={[own, ...accents]} shown={shown} reviewWord={own.text} tag={tag} onPick={onPick} lang={lang} />
        </>
      )}
      {options.synonyms.length > 0 && (
        <>
          <p className="tip-note-label word-options-label">Same meaning, other words</p>
          <WordOptions
            words={accents.length || skipAccents ? options.synonyms : [own, ...options.synonyms]}
            shown={shown}
            reviewWord={own.text}
            tag={tag}
            onPick={onPick}
            lang={lang}
          />
        </>
      )}
      {!alternatives && !skipAccents && <p className="muted">No other words to choose from.</p>}
    </>
  )
}


// The month and year whose entries show, where the page title was (owner's request 2026-10-30): ‹ and ›
// step to the next month with entries, older or newer; the dropdown lists every month that has entries
// (and the one showing), newest first, written in the language being learned like the entries' dates.
function MonthPicker({
  month,
  entries,
  lang,
  onChange,
}: {
  month: string
  entries: JournalEntry[]
  lang: string
  onChange: (month: string) => void
}) {
  const months = [...new Set([month, ...entries.map((e) => e.when.slice(0, 7))])].sort().reverse()
  const i = months.indexOf(month)
  const newer = months[i - 1]
  const older = months[i + 1]
  return (
    <div className="month-picker">
      <button
        type="button"
        className="month-step"
        aria-label={older ? `Earlier: ${monthLabel(older, lang)}` : 'No earlier entries'}
        disabled={!older}
        onClick={() => older && onChange(older)}
      >
        ‹
      </button>
      {/* The month as text, sized to fit, with the dropdown laid over it unseen (a select is as wide as its
          longest month). */}
      <span className="month-current">
        <span className="month-label" lang={lang} aria-hidden="true">
          {monthLabel(month, lang)}
        </span>
        <select value={month} lang={lang} aria-label="Month" onChange={(e) => onChange(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m, lang)}
            </option>
          ))}
        </select>
      </span>
      <button
        type="button"
        className="month-step"
        aria-label={newer ? `Later: ${monthLabel(newer, lang)}` : 'No later entries'}
        disabled={!newer}
        onClick={() => newer && onChange(newer)}
      >
        ›
      </button>
    </div>
  )
}

// The page's highlighter key, under its description: what each tint in Mai's notes means. The regional
// word and pronoun tints only appear when those checks are on (Settings), and frame and pronoun tints only
// for languages that have them. `info` (the page's ⓘ) follows the last one.
function HighlightKey({ extraChecks, target, info }: { extraChecks: boolean; target: TargetLanguage; info: ReactNode }) {
  const kinds = [
    'spelling',
    'foreign-word',
    ...(target.frames ? ['frame'] : []),
    ...(extraChecks ? ['dialect', ...(target.pronouns ? ['pronoun-consistency'] : [])] : []),
  ]
  return (
    <ul className="change-legend page-legend" aria-label="What Mai's highlights mean">
      {kinds.map((k) => (
        <li key={k} data-kind={kindOf(k).color}>
          {kindOf(k).label}
        </li>
      ))}
      {/* Last in the row, however many highlights there are. */}
      <li className="legend-info">{info}</li>
    </ul>
  )
}
