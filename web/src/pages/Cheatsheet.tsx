import { use, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Popover } from '../components/Popover'
import {
  loadBank,
  myWordsList,
  type CheatsheetEntry,
  type CheatsheetList,
  type ContractionPart,
  type Meaning,
  type TranslationOption,
} from '../lib/cheatsheet'
import { meaningKey, optionKey, partKey, pronounKey, usePicks, type Picks } from '../lib/cheatsheetPicks'
import {
  cellChoices,
  COLUMN_GROUPS,
  COLUMN_LABELS,
  pronounRole,
  pronounTextOrDefault,
  type PronounRole,
  type PronounRow,
  type PronounTable,
  type Speaker,
} from '../lib/pronounTable'
import { toCheatsheetList, useCustomLists, type CustomEntry, type CustomList } from '../lib/customLists'
import { targetById, useTargetLanguage } from '../lib/languages'
import { useMyWords } from '../lib/myWords'
import { useWordEntries } from '../lib/translateWords'
import { MyWordsControls } from '../components/MyWordsControls'

export function Cheatsheet() {
  // Suspends until the language's pre-built translations have loaded (App shows a loading message
  // meanwhile), including after switching languages in Settings. Words not in them are translated by
  // the backend while the page shows them as "translating…".
  const [target] = useTargetLanguage()
  const bank = use(loadBank(target))
  const myWords = useMyWords()
  const mine = useWordEntries(target, bank, myWords.words)
  const myList = myWordsList(target, bank, mine.entries)
  const { picks, setPick } = usePicks()
  const custom = useCustomLists()
  const [creating, setCreating] = useState(false)

  return (
    <main className="app">
      <header className="header">
        <div className="page-title-row">
          <h1>Cheatsheets</h1>
          {/* The description behind an ⓘ, as on the Journal (owner's request 2026-10-30). */}
          <Popover
            title="About the cheatsheets"
            trigger="i"
            triggerClassName="page-info"
            triggerLabel="About the cheatsheets"
            align="start"
            wrapClassName="page-info-wrap"
          >
            {/* With how to use the lists, moved here from each list (owner's request 2026-10-30). */}
            <div className="page-intro">
              <p>Handy word lists to keep nearby while you learn.</p>
              <p>
                Tap an English word to choose the meaning you mean; its translation follows. Tap a translation for
                other options and examples, and star the one you like best.
              </p>
            </div>
          </Popover>
        </div>
      </header>

      <ListCard key={myList.id} list={myList} picks={picks} setPick={setPick} onRemoveEntry={myWords.remove} emptyText="">
        <MyWordsControls
          words={myWords.words}
          onAdd={myWords.add}
          onReplace={myWords.replace}
          translating={mine.translating}
          failedCount={mine.failedCount}
          onRetry={mine.retry}
        />
      </ListCard>

      {custom.lists.map((list) => (
        <ListCard
          key={list.id}
          list={toCheatsheetList(list)}
          picks={picks}
          setPick={setPick}
          onRemoveEntry={(word) => custom.removeEntry(list.id, word)}
        >
          <CustomListControls
            list={list}
            onAdd={(entry) => custom.addEntry(list.id, entry)}
            onDelete={() => custom.deleteList(list.id)}
          />
        </ListCard>
      ))}

      {creating ? (
        <NewListForm
          onCreate={(title) => {
            custom.addList(title, target.id)
            setCreating(false)
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button type="button" className="add-list" onClick={() => setCreating(true)}>
          + Add a new list
        </button>
      )}
    </main>
  )
}

type ListCardProps = {
  list: CheatsheetList
  picks: Picks
  setPick: (key: string, value: string | null) => void
  // Lists the user edits: shows a remove button on each word.
  onRemoveEntry?: (word: string) => void
  // Lists the user edits: the add-word form and list actions, shown under the words.
  children?: ReactNode
  // Shown when the list has no words ('' for none).
  emptyText?: string
}

// One word list as a collapsible card. Built-in and custom lists share it.
// What rows need to show pronoun words from the table: the picked rows for who you're talking to and
// about, the speaker's gender if set, and how to change them.
type PronounProps = {
  table: PronounTable
  listener: PronounRow
  about: PronounRow
  speaker?: Speaker
  onPickRow: (relation: 'listener' | 'about', rowId: string) => void
  onPickSpeaker: (speaker: Speaker | null) => void
}

function ListCard({ list, picks, setPick, onRemoveEntry, children, emptyText = 'No words yet. Add your first one below.' }: ListCardProps) {
  const table = list.pronounTable
  const rowFor = (relation: 'listener' | 'about') => {
    const fallback = relation === 'listener' ? table!.defaultListener : table!.defaultAbout
    return table!.rows.find((r) => r.id === picks[pronounKey(list.id, relation)]) ?? table!.rows.find((r) => r.id === fallback) ?? table!.rows[0]
  }
  const savedSpeaker = picks[pronounKey(list.id, 'speaker')]
  const pronoun: PronounProps | undefined = table?.rows.length
    ? {
        table,
        listener: rowFor('listener'),
        about: rowFor('about'),
        speaker: savedSpeaker === 'male' || savedSpeaker === 'female' ? savedSpeaker : undefined,
        // Picking the default row clears the saved pick.
        onPickRow: (relation, rowId) =>
          setPick(pronounKey(list.id, relation), rowId === (relation === 'listener' ? table.defaultListener : table.defaultAbout) ? null : rowId),
        onPickSpeaker: (speaker) => setPick(pronounKey(list.id, 'speaker'), speaker),
      }
    : undefined
  return (
    // Native <details>: collapsible with keyboard and screen reader support; the summary (title) stays visible.
    <details className="card cheat-list" open>
      <summary className="card-head">
        <h2>{list.title}</h2>
        <span className="muted">
          {list.entries.length} {list.entries.length === 1 ? 'word' : 'words'}
        </span>
        <svg className="chevron" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      {list.description && <p className="muted">{list.description}</p>}
      {list.translationLang && list.entries.length > 0 && (
        <p className="cheat-legend muted">
          <span className="cheat-word">English</span> ·{' '}
          <span className="cheat-translation">{list.translationLang.label}</span>
        </p>
      )}
      {list.entries.length > 0 ? (
        <ol className="cheat-grid">
          {list.entries.map((entry, i) => (
            <Row
              key={entry.word}
              rank={i + 1}
              entry={entry}
              list={list}
              picks={picks}
              setPick={setPick}
              pronoun={pronoun}
              onRemove={onRemoveEntry && (() => onRemoveEntry(entry.word))}
            />
          ))}
        </ol>
      ) : (
        emptyText && <p className="muted empty-list">{emptyText}</p>
      )}
      {list.attribution && list.entries.length > 0 && <p className="attribution muted">{list.attribution}</p>}
      {children}
    </details>
  )
}

type RowProps = {
  rank: number
  entry: CheatsheetEntry
  list: CheatsheetList
  picks: Picks
  setPick: (key: string, value: string | null) => void
  pronoun?: PronounProps
  onRemove?: () => void
}

// One word: the English word (its chosen meaning) and the translation for that meaning.
// What a row steps down through until its word and translation fit on one line (owner's feedback
// 2026-10-30: "something" → "alguna cosa +1", "lamentablemente" ran past the row; wrapping looked worse):
// smaller text, then smaller still without the part-of-speech tag (its box still says it), then the
// translation cut short with "…" (its box has it in full).
const FIT_STEPS = ['', 'small', 'tiny', 'clip'] as const

/** Shrinks a cheatsheet row's text (data-fit) when it doesn't fit its column, measured after each render
 *  and when the column's width changes. */
function useFitRow() {
  const ref = useRef<HTMLLIElement>(null)
  const fit = () => {
    const li = ref.current
    if (!li) return
    // An open word box hangs off the row and would count as overflow (picking a meaning re-fits the row
    // while its box is open, which shrank the row's text for good; owner's report 2026-10-30), so it's
    // left out of the measuring.
    const tips = [...li.querySelectorAll<HTMLElement>('.tip')]
    for (const tip of tips) tip.style.display = 'none'
    try {
      for (const step of FIT_STEPS) {
        li.dataset.fit = step
        if (li.scrollWidth <= li.clientWidth) return
      }
    } finally {
      for (const tip of tips) tip.style.display = ''
    }
  }
  useLayoutEffect(fit)
  useEffect(() => {
    const li = ref.current
    if (!li) return
    const observer = new ResizeObserver(() => fit())
    observer.observe(li)
    return () => observer.disconnect()
  }, [])
  return ref
}

function Row({ rank, entry, list, picks, setPick, pronoun, onRemove }: RowProps) {
  const rowRef = useFitRow()
  const mKey = meaningKey(list.id, entry.word)
  // The default meaning is the first one with a translation. A saved pick that no longer exists (data
  // regenerated) falls back to it.
  const defaultMeaning = entry.meanings.find((m) => m.options.length) ?? entry.meanings[0]
  const meaning = entry.meanings.find((m) => m.id === picks[mKey]) ?? defaultMeaning
  const oKey = optionKey(list.id, entry.word, meaning?.id ?? '')
  const lang = list.translationLang?.code

  // Contractions: each part's picked (or first) translation, joined in order ("tui" + "sẽ" → "tui sẽ").
  // Helper parts ("do" in "don't") add nothing.
  // Pronoun parts ("I" in "I'll") follow the pronoun table ("I'll" + friend → "mình sẽ").
  const partPicks = entry.parts?.map((part) => {
    if (part.helper) return null
    const partRole = pronounRole(part.word)
    if (pronoun && partRole) {
      const text = pronounTextOrDefault(partRole, partRole.relation === 'listener' ? pronoun.listener : pronoun.about, pronoun.table, pronoun.speaker)
      if (text) return { text }
    }
    return part.options.find((o) => o.text === picks[partKey(list.id, part.word)]) ?? part.options[0] ?? null
  })
  const role = pronounRole(entry.word)
  const combinedText = partPicks?.filter((o): o is TranslationOption => Boolean(o)).map((o) => o.text).join(' ')
  const combined =
    entry.parts && combinedText ? { text: combinedText, formula: entry.parts.map((p) => p.word).join(' + ') } : undefined

  return (
    <li ref={rowRef}>
      <span className="rank">{rank}</span>
      <WordCell
        entry={entry}
        meaning={meaning}
        defaultId={defaultMeaning?.id}
        // Picking the default clears the saved pick, so the default can change when the data does.
        onPick={(m) => setPick(mKey, m.id === defaultMeaning?.id ? null : m.id)}
      />
      {meaning ? (
        <TranslationCell
          word={entry.word}
          meaning={meaning}
          lang={lang}
          langLabel={list.translationLang?.label}
          pickedText={picks[oKey]}
          onPick={(text, isDefault) => setPick(oKey, isDefault ? null : text)}
          combined={combined}
          parts={entry.parts}
          partPicks={partPicks}
          onPickPart={(part, text, isDefault) => setPick(partKey(list.id, part), isDefault ? null : text)}
          pronoun={pronoun && (role || entry.parts?.some((p) => pronounRole(p.word))) ? { ...pronoun, role } : undefined}
        />
      ) : entry.status === 'translating' ? (
        <span className="cheat-trans-wrap cheat-pending muted">translating…</span>
      ) : entry.status === 'failed' ? (
        <span className="cheat-trans-wrap cheat-pending muted" title="Couldn’t translate this word">
          not translated
        </span>
      ) : (
        // Not in the dictionary at all (e.g. "going to").
        <span className="cheat-translation cheat-trans-wrap" title="Not found in the dictionary">
          —
        </span>
      )}
      {onRemove && (
        <button type="button" className="remove-word" aria-label={`Remove “${entry.word}”`} onClick={onRemove}>
          ✕
        </button>
      )}
    </li>
  )
}

// Short part-of-speech labels for the list, e.g. "adj" for "Adjective".
const POS_ABBR: Record<string, string> = {
  noun: 'n.', verb: 'v.', adj: 'adj.', adv: 'adv.', pron: 'pron.', det: 'det.', article: 'art.', prep: 'prep.',
  conj: 'conj.', intj: 'interj.', particle: 'part.', num: 'num.', contraction: 'contr.', phrase: 'phr.',
  prep_phrase: 'phr.', name: 'n.',
}

type WordCellProps = { entry: CheatsheetEntry; meaning?: Meaning; defaultId?: string; onPick: (m: Meaning) => void }

function WordCell({ entry, meaning, defaultId, onPick }: WordCellProps) {
  const abbr = meaning?.pos ? (POS_ABBR[meaning.pos] ?? meaning.pos) : null
  // Custom words have a single meaning with no part of speech: nothing to choose.
  if (!meaning || (entry.meanings.length < 2 && !meaning.pos)) return <span className="cheat-word">{entry.word}</span>

  const count = entry.meanings.length
  return (
    <Popover
      title={entry.word}
      align="start"
      wrapClassName="cheat-word-wrap"
      triggerClassName="cheat-word word-trigger"
      triggerLabel={`${entry.word}, ${meaning.posName ?? ''}: ${meaning.gloss ?? ''}${count > 1 ? `. ${count} meanings` : ''}`}
      contentKey={meaning.id}
      trigger={
        <>
          {entry.word}
          {abbr && (
            <span className="pos-tag" aria-hidden="true">
              {abbr}
            </span>
          )}
        </>
      }
      report={{ word: entry.word, context: { language: 'en', meaning: meaning.gloss ?? '' } }}
    >
      <div className="tip-options" role="group" aria-label={`Meanings of “${entry.word}”`}>
        <p className="tip-note-label">
          {count > 1 ? `Which meaning? (${count})` : 'Meaning'}
        </p>
        <ul>
          {entry.meanings.map((m) => {
            const isPicked = m.id === meaning.id
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className={isPicked ? 'tip-option meaning-option picked' : 'tip-option meaning-option'}
                  aria-pressed={isPicked}
                  onClick={() => onPick(m)}
                >
                  <span className="star" aria-hidden="true">
                    {isPicked ? '★' : '☆'}
                  </span>
                  <span className="pos-name">{m.posName ?? m.pos}</span>
                  <span className="tip-option-usage">
                    <span className="meaning-gloss">{m.gloss}</span>
                    {m.labels?.length ? <span className="label-chips"> {m.labels.join(', ')}</span> : null}
                    {m.example && <span className="meaning-example">“{m.example}”</span>}
                    {m.options.length === 0 && <span className="meaning-example">No translation found</span>}
                  </span>
                  {m.id === defaultId && <span className="default-tag">default</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Popover>
  )
}

type TranslationCellProps = {
  word: string
  meaning: Meaning
  lang?: string
  langLabel?: string
  // Text of the option the user starred for this meaning, if any.
  pickedText?: string
  onPick: (text: string, isDefault: boolean) => void
  // Contractions only: the parts' combined translation (first option), the parts, and each part's pick.
  combined?: { text: string; formula: string }
  parts?: ContractionPart[]
  partPicks?: (TranslationOption | null)[]
  onPickPart?: (part: string, text: string, isDefault: boolean) => void
  // Pronoun words: the "who are you talking to?" table. `role` is set for pronoun words; contractions
  // leave it unset and use the table for their pronoun part ("I" in "I'll").
  pronoun?: PronounProps & { role?: PronounRole }
}

// The translation for the chosen meaning, with a box listing the other options and an example.
function TranslationCell({
  word,
  meaning,
  lang,
  langLabel,
  pickedText,
  onPick,
  combined,
  parts,
  partPicks,
  onPickPart,
  pronoun,
}: TranslationCellProps) {
  // Pronoun words show the table's word for the picked row, and the table instead of a ranked list.
  if (pronoun?.role) {
    const row = pronoun.role.relation === 'listener' ? pronoun.listener : pronoun.about
    const text = pronounTextOrDefault(pronoun.role, row, pronoun.table, pronoun.speaker) ?? meaning.options[0]?.text ?? '—'
    return (
      <Popover
        title={word}
        wrapClassName="cheat-trans-wrap"
        triggerClassName="cheat-translation"
        lang={lang}
        contentKey={`${meaning.id}|${row.id}|${pronoun.speaker ?? ''}`}
        triggerLabel={`${text}, depends on who you're talking ${pronoun.role.relation === 'about' ? 'about' : 'to'}`}
        trigger={text}
        report={{ word: text, context: { language: lang ?? '', english: word } }}
      >
        <PronounTableView pronoun={pronoun} role={pronoun.role} lang={lang} />
      </Popover>
    )
  }
  // A contraction's combined translation comes first; the word's own translations follow. When a part
  // is a pronoun from the "who are you talking to?" table ("I" in "I'm"), the word's own translations are
  // just pronouns ("con", "anh"…) that the table already covers, so only the combined one is shown.
  const pronounPart = Boolean(pronoun && parts?.some((p) => pronounRole(p.word)))
  const options: TranslationOption[] = combined
    ? [
        { text: combined.text, gloss: `${combined.formula}, from its parts (change them below)` },
        ...(pronounPart ? [] : meaning.options.filter((o) => o.text !== combined.text)),
      ]
    : meaning.options
  const found = options.findIndex((o) => o.text === pickedText)
  const pickedIndex = found >= 0 ? found : 0
  const picked = options[pickedIndex]
  const extra = options.length - 1

  // A custom word: just the user's translation.
  if (!meaning.pos && options.length === 1 && !picked.gloss) {
    return (
      <span className="cheat-translation cheat-trans-wrap" lang={lang}>
        {picked.text}
      </span>
    )
  }

  const meaningLine = meaning.gloss && (
    <p className="tip-meaning">
      <span className="pos-name">{meaning.posName ?? meaning.pos}</span> {meaning.gloss}
    </p>
  )

  return (
    <Popover
      title={word}
      wrapClassName="cheat-trans-wrap"
      triggerClassName="cheat-translation"
      lang={picked ? lang : undefined}
      contentKey={`${meaning.id}|${pickedIndex}`}
      triggerLabel={
        picked
          ? extra > 0
            ? `${picked.text}, ${extra} more ${extra === 1 ? 'option' : 'options'}`
            : undefined
          : `No translation for this meaning of ${word}`
      }
      trigger={
        picked ? (
          <>
            {picked.text}
            {extra > 0 && (
              <span className="more-tag" aria-hidden="true">
                +{extra}
              </span>
            )}
          </>
        ) : (
          '—'
        )
      }
      report={{
        word: picked?.text ?? word,
        context: { language: lang ?? '', english: word, meaning: meaning.gloss ?? '' },
      }}
    >
      {meaningLine}
      {picked ? (
        <>
          <div className="tip-options" role="group" aria-label={`Translations of “${word}”`}>
            <p className="tip-note-label">{options.length > 1 ? 'Star the one to show in the list' : 'Translation'}</p>
            <ul>
              {options.map((option, i) => {
                const isPicked = i === pickedIndex
                return (
                  <li key={option.text}>
                    <button
                      type="button"
                      className={isPicked ? 'tip-option picked' : 'tip-option'}
                      aria-pressed={isPicked}
                      onClick={() => onPick(option.text, i === 0)}
                    >
                      <span className="star" aria-hidden="true">
                        {isPicked ? '★' : '☆'}
                      </span>
                      <span className="tip-option-text" lang={lang}>
                        {option.text}
                      </span>
                      <span className="tip-option-usage">
                        {option.gloss}
                        {option.regions?.length ? <span className="region-badge"> {option.regions.join(', ')}</span> : null}
                        {option.labels?.length ? <span className="label-chips"> {option.labels.join(', ')}</span> : null}
                      </span>
                      {i === 0 && <span className="default-tag">default</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
          {picked.example && (
            <div className="tip-example">
              <p className="tip-translated" lang={lang}>
                {picked.example.text}
              </p>
              {picked.example.translation && <p className="tip-en">{picked.example.translation}</p>}
            </div>
          )}
          {parts && (
            <div className="tip-parts">
              <p className="tip-note-label">
                {word} = {parts.map((p) => p.word).join(' + ')}
              </p>
              <div className={pronounPart ? 'tip-parts-list with-table' : 'tip-parts-list'}>
                {parts.map((part, pi) =>
                  pronoun && pronounRole(part.word) ? (
                    <div key={part.word} className="part-pronoun">
                      <p className="part-name">{part.word}</p>
                      <PronounTableView pronoun={pronoun} role={pronounRole(part.word)!} lang={lang} />
                    </div>
                  ) : part.helper ? (
                    <p key={part.word} className="part-helper">
                      <span className="part-name">{part.word}</span> English helper word; no word needed
                    </p>
                  ) : (
                    <div key={part.word} role="group" aria-label={`Translations of “${part.word}”`}>
                      <p className="part-name">{part.word}</p>
                      {part.options.length ? (
                        <ul>
                          {part.options.map((option, i) => {
                            const isPicked = partPicks?.[pi]?.text === option.text
                            return (
                              <li key={option.text}>
                                <button
                                  type="button"
                                  className={isPicked ? 'tip-option picked' : 'tip-option'}
                                  aria-pressed={isPicked}
                                  onClick={() => onPickPart?.(part.word, option.text, i === 0)}
                                >
                                  <span className="star" aria-hidden="true">
                                    {isPicked ? '★' : '☆'}
                                  </span>
                                  <span className="tip-option-text" lang={lang}>
                                    {option.text}
                                  </span>
                                  <span className="tip-option-usage">
                                    {option.gloss}
                                    {option.labels?.length ? <span className="label-chips"> {option.labels.join(', ')}</span> : null}
                                  </span>
                                  {i === 0 && <span className="default-tag">default</span>}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      ) : (
                        <p className="part-helper">No translation found</p>
                      )}
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="tip-note">
          <p className="tip-note-label">No translation found</p>
          <p>
            The dictionary has no {langLabel ?? 'translation'} word for this meaning of “{word}”. Grammar words often
            have no direct equivalent. Try another meaning by tapping the English word.
          </p>
        </div>
      )}
    </Popover>
  )
}

function NewListForm({ onCreate, onCancel }: { onCreate: (title: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (title.trim()) onCreate(title.trim())
  }

  return (
    <form className="card new-list-form" onSubmit={submit}>
      <label htmlFor="new-list-title" className="form-label">
        Name your new list
      </label>
      <div className="form-row">
        <input
          id="new-list-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel()}
          placeholder="e.g. Food words, Things I say at work"
          maxLength={60}
          // The form only appears after pressing "Add a new list", so focusing it is expected.
          autoFocus
        />
        <button type="submit" className="primary" disabled={!title.trim()}>
          Create
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

type CustomListControlsProps = {
  list: CustomList
  onAdd: (entry: CustomEntry) => void
  onDelete: () => void
}

// Under a custom list's words: a form to add a word, and a button to delete the list.
function CustomListControls({ list, onAdd, onDelete }: CustomListControlsProps) {
  const [word, setWord] = useState('')
  const [translation, setTranslation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const wordRef = useRef<HTMLInputElement>(null)
  const formId = useId()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const w = word.trim()
    const t = translation.trim()
    if (!w || !t) return
    // Words identify entries (React keys, removal), so each can appear once per list.
    if (list.entries.some((entry) => entry.word.toLowerCase() === w.toLowerCase())) {
      setError(`“${w}” is already in this list.`)
      return
    }
    onAdd({ word: w, translation: t })
    setWord('')
    setTranslation('')
    setError(null)
    wordRef.current?.focus()
  }

  const confirmDelete = () => {
    const count = list.entries.length
    const message =
      count > 0
        ? `Delete “${list.title}” and its ${count} ${count === 1 ? 'word' : 'words'}?`
        : `Delete “${list.title}”?`
    if (window.confirm(message)) onDelete()
  }

  return (
    <div className="custom-controls">
      <form className="add-word-form" onSubmit={submit} aria-label={`Add a word to ${list.title}`}>
        <div className="form-row">
          <input
            ref={wordRef}
            id={`${formId}-word`}
            aria-label="English word"
            value={word}
            onChange={(e) => {
              setWord(e.target.value)
              setError(null)
            }}
            placeholder="English word"
            autoCapitalize="off"
            maxLength={60}
          />
          <input
            aria-label={`${targetById(list.target).label} translation`}
            lang={targetById(list.target).code}
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            placeholder="Translation"
            autoCapitalize="off"
            maxLength={80}
          />
          <button type="submit" className="primary" disabled={!word.trim() || !translation.trim()}>
            Add
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
      <button type="button" className="link danger-link" onClick={confirmDelete}>
        Delete list
      </button>
    </div>
  )
}

type PronounTableViewProps = {
  pronoun: PronounProps
  role: PronounRole
  lang?: string
}

// "Who are you talking to (or about)?" with the words for each relationship; tap a row to use it.
// Talking-to tables show only the looked-at word's column ("I" for I/me/my, "you" for you/your, "we" for
// we), per the owner's request; talking-about tables show he·she and they together.
function PronounTableView({ pronoun, role, lang }: PronounTableViewProps) {
  const { table, speaker } = pronoun
  const row = role.relation === 'listener' ? pronoun.listener : pronoun.about
  const defaultId = role.relation === 'listener' ? table.defaultListener : table.defaultAbout
  const columns = role.relation === 'listener' ? [role.column] : COLUMN_GROUPS[role.column]
  // The man/woman choice only matters if a shown word depends on it.
  const speakerMatters = table.rows.some((r) => columns.some((c) => r.cells[c]?.some((cell) => cell.speaker)))

  return (
    <div className="tip-pronouns">
      <p className="tip-note-label">{role.relation === 'about' ? 'Who are you talking about?' : 'Who are you talking to?'}</p>
      {speakerMatters && (
        <div className="speaker-toggle" role="group" aria-label="You are">
          <span className="muted">I’m</span>
          {(['male', 'female'] as const).map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              aria-pressed={speaker === s}
              onClick={() => pronoun.onPickSpeaker(speaker === s ? null : s)}
            >
              {s === 'male' ? 'a man' : 'a woman'}
            </button>
          ))}
        </div>
      )}
      {/* Scrolls on its own inside a contraction's box ("I'm"), so the other part stays in view. */}
      <div className="pronoun-table-scroll">
        <table className="pronoun-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Use</span>
              </th>
              <th scope="col">{role.relation === 'about' ? 'Talking about' : 'Talking to'}</th>
              {columns.map((c) => (
                <th key={c} scope="col" className={c === role.column ? 'highlight' : undefined}>
                  {COLUMN_LABELS[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => {
              const isPicked = r.id === row.id
              const pick = () => pronoun.onPickRow(role.relation, r.id)
              return (
                <tr key={r.id} className={isPicked ? 'picked' : undefined} onClick={pick}>
                  <td>
                    <button
                      type="button"
                      className="pronoun-star"
                      aria-pressed={isPicked}
                      aria-label={`Use: ${r.who}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        pick()
                      }}
                    >
                      {isPicked ? '★' : '☆'}
                    </button>
                  </td>
                  <th scope="row">
                    {r.who}
                    {r.id === defaultId && <span className="default-tag">default</span>}
                    {r.warning && <span className="pronoun-note">⚠ {r.warning}</span>}
                  </th>
                  {columns.map((c) => {
                    const cells = cellChoices(r, c, speaker, c === role.column ? role.gender : undefined)
                    return (
                      <td key={c} className={c === role.column ? 'highlight' : undefined} lang={lang}>
                        {cells.length
                          ? cells.map((cell, i) => (
                              <span key={cell.word + i} className="pronoun-word">
                                {cell.word}
                                {!speaker && cell.speaker && <span className="pronoun-tag">{cell.speaker === 'male' ? 'if you’re a man' : 'if you’re a woman'}</span>}
                                {cell.gender && c.startsWith('third') && <span className="pronoun-tag">{cell.gender === 'male' ? 'he' : 'she'}</span>}
                                {cell.inclusive !== undefined && <span className="pronoun-tag">{cell.inclusive ? 'incl. you' : 'not you'}</span>}
                              </span>
                            ))
                          : '—'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
