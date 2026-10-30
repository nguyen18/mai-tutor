import { useEffect, useRef, useState } from 'react'
import { newId, nowLocal, objectUrl, useStickers, type JournalEntry, type SheetItem, type Sticker } from '../lib/journal'
import { firstSlot, type Frame } from '../lib/frames'
import { shrinkImage } from '../lib/images'
import type { TargetLanguage } from '../lib/languages'
import { entryDate } from '../lib/journalDates'
import { AudioNoteRecorder } from './AudioNoteRecorder'
import { EntryHead } from './EntryHead'
import { FramesBrowser } from './FramesBrowser'
import { JournalSheet, type SheetApi } from './JournalSheet'
import { StickerMaker } from './StickerMaker'

// Writing or editing a journal entry, laid out like a zine page (owner's reference: Daplit): a top bar
// (← cancel, title, Save), the dated page (date row and week, as on saved entries) with the text, photos
// and stickers placed anywhere, and a toolbar (Photo, Stickers, Frames, Audio) whose tools open one at a
// time in a panel above it. On a phone the editor covers the screen, the toolbar within thumb's reach.

type Props = {
  target: TargetLanguage
  /** The entry being edited; a new one when missing. */
  entry?: JournalEntry
  onSave: (entry: JournalEntry) => Promise<void>
  onCancel: () => void
}

type Panel = 'stickers' | 'frames' | 'audio'
const PANEL_NAMES: Record<Panel, string> = { stickers: 'Stickers', frames: 'Sentence frames', audio: 'Audio note' }
const PANEL_SHORT: Record<Panel, string> = { stickers: 'Stickers', frames: 'Frames', audio: 'Audio' }
const PANEL_ICONS: Record<Panel, string> = { stickers: '✂️', frames: '💡', audio: '🎙' }

// New photos and stickers go below the writing and everything already on the page, alternating left
// and right, so they never cover anything; they can be dragged anywhere after. `textBottom` is where the
// text ends, as a fraction of the sheet's width.
function placeNew(items: SheetItem[], w: number, textBottom: number): Pick<SheetItem, 'x' | 'y' | 'rotation'> {
  const right = items.length % 2 === 1
  const lowest = Math.max(textBottom, ...items.map((i) => i.y + i.w * i.aspect))
  return { x: right ? Math.max(0.04, 0.96 - w) : 0.04, y: lowest + 0.03, rotation: right ? 3 : -3 }
}

export function JournalEditor({ target, entry, onSave, onCancel }: Props) {
  const [when, setWhen] = useState(entry?.when ?? nowLocal)
  const [text, setText] = useState(entry?.text ?? '')
  const [items, setItems] = useState<SheetItem[]>(entry?.items ?? [])
  const [audio, setAudio] = useState(entry?.audio)
  const [makingSticker, setMakingSticker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { stickers, add: addSticker, remove: removeSticker } = useStickers()
  const photoRef = useRef<HTMLInputElement>(null)
  const sheetApi = useRef<SheetApi | null>(null)
  // The tool panel open above the toolbar: one at a time, so the page stays in view on a phone.
  const [panel, setPanel] = useState<Panel | null>(null)
  const toggle = (p: Panel) => setPanel((open) => (open === p ? null : p))

  // On a phone the editor covers the screen; the page behind it shouldn't scroll.
  useEffect(() => {
    document.body.classList.add('journal-editing')
    return () => document.body.classList.remove('journal-editing')
  }, [])
  // A frame's pattern goes in at the cursor (or the end), its first slot ("{place}") selected so typing
  // replaces it.
  const insertFrame = (frame: Frame) => sheetApi.current?.insert(frame.text, firstSlot(frame.text) ?? undefined)

  const addItem = (kind: SheetItem['kind'], image: Blob, aspect: number) => {
    const w = kind === 'photo' ? 0.42 : 0.26
    const below = sheetApi.current?.textBottom() ?? 0
    setItems((list) => [...list, { id: newId(), kind, image, aspect, w, ...placeNew(list, w, below) }])
  }

  const addPhoto = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const { blob, aspect } = await shrinkImage(file, 1600, 'image/jpeg')
      addItem('photo', blob, aspect)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const keepSticker = (made: { blob: Blob; aspect: number }) => {
    void addSticker({ id: newId(), image: made.blob, aspect: made.aspect, createdAt: new Date().toISOString() })
    addItem('sticker', made.blob, made.aspect)
    setMakingSticker(false)
  }

  // Pasting a picture (an iPhone sticker or a copied cut-out keeps its see-through background) makes it a
  // sticker, unless the text box has focus and the clipboard holds text.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      shrinkImage(file, 800, 'image/png')
        .then((made) => {
          void addSticker({ id: newId(), image: made.blob, aspect: made.aspect, createdAt: new Date().toISOString() })
          addItem('sticker', made.blob, made.aspect)
        })
        .catch((err: Error) => setError(err.message))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addSticker])

  const spokenOnly = Boolean(audio) && !text.trim()
  const empty = !text.trim() && !audio && !items.length

  const save = async () => {
    setSaving(true)
    setError(null)
    const now = new Date().toISOString()
    try {
      await onSave({
        id: entry?.id ?? newId(),
        targetId: entry?.targetId ?? target.id,
        when: when || nowLocal(),
        text: text.trim(),
        items,
        audio,
        check: entry?.check,
        createdAt: entry?.createdAt ?? now,
        updatedAt: now,
      })
    } catch (err) {
      // The browser's reason, so a failure on one phone can be told apart from another.
      const reason = err instanceof Error || err instanceof DOMException ? `${err.name}: ${err.message}` : String(err)
      console.error('Saving the journal entry failed:', err)
      setError(`Couldn't save the entry. Try again. (${reason})`)
      setSaving(false)
    }
  }

  const title = entry ? 'Edit entry' : 'New entry'
  const date = entryDate(when || nowLocal(), target.code)

  return (
    <section className="journal-editor" aria-label={title}>
      <header className="editor-bar">
        <button type="button" className="icon-button" aria-label="Cancel" title="Cancel" onClick={onCancel} disabled={saving}>
          ←
        </button>
        <h2 className="slashed">{entry ? 'Edit' : 'New entry'}</h2>
        <button type="button" className="primary" onClick={save} disabled={saving || empty}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <div className="editor-body">
        <EntryHead when={when} date={date} lang={target.code}>
          <span className="entry-date editor-date">
            <input
              id="journal-when"
              className="journal-when"
              type="datetime-local"
              aria-label="Date and time"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
            <span className="muted" lang={target.code}>
              {date.date}
            </span>
          </span>
        </EntryHead>

        <div className="editor-page">
          <JournalSheet
            apiRef={sheetApi}
            text={text}
            items={items}
            onTextChange={setText}
            onItemsChange={setItems}
            lang={target.code}
            label={`Your entry, in ${target.label}`}
            placeholder={`Write your entry in ${target.label}. Stuck on a word? Write it in English…`}
            captionPlaceholder={`Label it in ${target.label}…`}
          />
        </div>
        {audio && panel !== 'audio' && (
          <p className={spokenOnly ? 'journal-nudge' : 'muted editor-audio-note'}>
            🎙 Audio note added.{spokenOnly && ' Type out what you said on the page, so Mai can check it.'}
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      {panel && (
        <section className="editor-panel" aria-label={PANEL_NAMES[panel]}>
          <div className="editor-panel-head">
            <h3 className="slashed">{PANEL_NAMES[panel]}</h3>
            <button type="button" className="icon-button small" aria-label="Close" onClick={() => setPanel(null)}>
              ✕
            </button>
          </div>
          {panel === 'stickers' && (
            <>
              <button type="button" className="make-sticker" onClick={() => setMakingSticker(true)}>
                ✂️ Make a sticker
              </button>
              <div className="sticker-tray" aria-label="Your stickers">
                {stickers.length ? (
                  stickers.map((s) => (
                    <TraySticker key={s.id} sticker={s} onAdd={() => addItem('sticker', s.image, s.aspect)} onRemove={() => removeSticker(s.id)} />
                  ))
                ) : (
                  <p className="muted">
                    Your stickers show up here. Cut one out of a photo, or paste one (on an iPhone, touch and hold part
                    of a photo, then Copy).
                  </p>
                )}
              </div>
            </>
          )}
          {panel === 'frames' && (
            <>
              <p className="muted">Tap a frame to put it in your entry, then type over the part in {'{braces}'}.</p>
              <FramesBrowser target={target} onPick={insertFrame} />
            </>
          )}
          {panel === 'audio' && (
            <>
              <AudioNoteRecorder audio={audio} onChange={setAudio} />
              <p className="muted">Spoke your entry? Type out what you said on the page too, so Mai can check it.</p>
            </>
          )}
        </section>
      )}

      <div className="editor-toolbar-area">
        {/* A nudge to read the entry aloud: once there's writing and no recording yet. */}
        {text.trim() && !audio && panel !== 'audio' && (
          <button type="button" className="record-nudge" onClick={() => setPanel('audio')}>
            Now read it out loud! Tap to record yourself 🎙
          </button>
        )}
        <nav className="editor-toolbar" aria-label="Add to your entry">
          <button type="button" onClick={() => photoRef.current?.click()}>
            <span aria-hidden="true">📷</span>
            Photo
          </button>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void addPhoto(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {(['stickers', ...(target.frames ? (['frames'] as const) : []), 'audio'] as const).map((p) => (
            <button key={p} type="button" aria-pressed={panel === p} onClick={() => toggle(p)}>
              <span aria-hidden="true">{PANEL_ICONS[p]}</span>
              {PANEL_SHORT[p]}
              {p === 'audio' && audio && <span className="toolbar-dot" aria-label="(added)" />}
            </button>
          ))}
        </nav>
      </div>

      {makingSticker && <StickerMaker onDone={keepSticker} onCancel={() => setMakingSticker(false)} />}
    </section>
  )
}

function TraySticker({ sticker, onAdd, onRemove }: { sticker: Sticker; onAdd: () => void; onRemove: () => void }) {
  const url = objectUrl(sticker.image)
  return (
    <span className="tray-sticker">
      <button type="button" className="tray-add" onClick={onAdd} aria-label="Add this sticker to the page">
        <img src={url} alt="" />
      </button>
      <button type="button" className="tray-remove" onClick={onRemove} aria-label="Delete this sticker">
        ✕
      </button>
    </span>
  )
}
