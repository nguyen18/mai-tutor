import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { objectUrl, type SheetItem } from '../lib/journal'
import { useOutlines, useWidth, wrapFloats } from '../lib/textWrap'

// The entry sheet: the journal text on graph paper, with photos and stickers placed anywhere on it, and
// the text flowing around them (lib/textWrap.ts). Positions and sizes are fractions of the sheet's width
// (see SheetItem), so the page looks the same on a phone and a laptop; CSS turns them into lengths with
// container query units (cqw). Editing, the text is a plain-text editable area (a textarea can't wrap
// around anything); the editor reaches it through `apiRef`.

/** What the editor can do with the page's text. */
export type SheetApi = {
  /** Puts `text` at the cursor (or the end), after a space when needed, and selects `select` within it. */
  insert: (text: string, select?: { start: number; end: number }) => void
  /** Where the text ends, as a fraction of the page's width from its top. */
  textBottom: () => number
}

const MIN_W = 0.08
const MAX_W = 1
// Keeps items from being dragged off the page entirely.
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

type Props = {
  text: string
  items: SheetItem[]
  /** Given when editing: the text is a textarea and items can be moved, resized, rotated and removed. */
  onTextChange?: (text: string) => void
  onItemsChange?: (items: SheetItem[]) => void
  placeholder?: string
  /** Shown in an empty caption box under a selected picture: "Label it in Southern Vietnamese…". */
  captionPlaceholder?: string
  lang?: string
  label?: string
  apiRef?: RefObject<SheetApi | null>
  /** Read-only: the text as rendered with Mai's corrections written over it, in place of plain `text`. */
  richText?: ReactNode
  /** Space the text keeps clear in the top-right corner, for buttons laid over the page. */
  corner?: { width: number; height: number }
}

export function JournalSheet({ text, items, onTextChange, onItemsChange, placeholder, captionPlaceholder, lang, label, apiRef, richText, corner }: Props) {
  const editable = Boolean(onTextChange && onItemsChange)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [sheet, setSheet] = useState<HTMLDivElement | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const width = useWidth(sheet)
  const outlineOf = useOutlines(items)
  // How far each picture's caption (or caption box, while editing) reaches below it, measured whenever a
  // picture or caption changes size, so the text wraps around the caption as it is, not a guess.
  const [captions, setCaptions] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!sheet) return
    const measure = () => {
      const next: Record<string, number> = {}
      for (const el of sheet.querySelectorAll<HTMLElement>('.sheet-item[data-id]')) {
        const img = el.querySelector('img')
        const caption = el.querySelector<HTMLElement>('.item-caption, .item-caption-input')
        if (img && caption) next[el.dataset.id!] = Math.max(0, caption.offsetTop + caption.offsetHeight - img.offsetHeight)
      }
      setCaptions((prev) => {
        const same =
          Object.keys(next).length === Object.keys(prev).length &&
          Object.entries(next).every(([id, h]) => Math.abs((prev[id] ?? -1) - h) < 1)
        return same ? prev : next
      })
    }
    // Fires once for each element as it starts being observed (so after a caption comes or goes too), then
    // on every resize.
    const observer = new ResizeObserver(measure)
    for (const el of sheet.querySelectorAll('.sheet-item img, .item-caption, .item-caption-input')) observer.observe(el)
    return () => observer.disconnect()
  }, [sheet, items, selected])
  const floats = wrapFloats(items, width, outlineOf, (i) => captions[i.id] ?? 0, corner)
  // The latest items, for drags: a drag's pointer handlers outlive the render that started it.
  const itemsRef = useRef(items)
  useLayoutEffect(() => {
    itemsRef.current = items
  })

  // The page is at least as tall as its lowest photo or sticker.
  const bottom = Math.max(0, ...items.map((i) => i.y + i.w * i.aspect))

  // A tap anywhere outside the selected picture (the text, the toolbar, the page around it) puts its edit
  // handles away; tapping a picture selects it again. Its caption box is inside it, so typing there keeps it.
  useEffect(() => {
    if (!selected) return
    const onDown = (e: globalThis.PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('.sheet-item.selected')) setSelected(null)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [selected])

  const setItems = (next: SheetItem[]) => {
    itemsRef.current = next
    onItemsChange?.(next)
  }

  const update = (id: string, change: Partial<SheetItem>) =>
    setItems(itemsRef.current.map((i) => (i.id === id ? { ...i, ...change } : i)))

  const select = (id: string) => {
    setSelected(id)
    // The picked item comes to the front.
    const list = itemsRef.current
    const item = list.find((i) => i.id === id)
    if (item && list[list.length - 1].id !== id) setItems([...list.filter((i) => i.id !== id), item])
  }

  const remove = (id: string) => {
    setItems(itemsRef.current.filter((i) => i.id !== id))
    setSelected(null)
  }

  // Dragging: `mode` says what the pointer is doing; changes are computed from where the drag started.
  const startDrag = (e: PointerEvent, item: SheetItem, mode: 'move' | 'resize' | 'rotate') => {
    if (!editable || !sheetRef.current) return
    e.preventDefault()
    e.stopPropagation()
    select(item.id)
    const rect = sheetRef.current.getBoundingClientRect()
    const width = rect.width
    const start = { x: e.clientX, y: e.clientY }
    const centre = {
      x: rect.left + (item.x + item.w / 2) * width,
      y: rect.top + (item.y + (item.w * item.aspect) / 2) * width,
    }
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)

    const onMove = (ev: globalThis.PointerEvent) => {
      const dx = (ev.clientX - start.x) / width
      const dy = (ev.clientY - start.y) / width
      if (mode === 'move') {
        update(item.id, {
          x: clamp(item.x + dx, -item.w / 2, 1 - item.w / 2),
          y: Math.max(-(item.w * item.aspect) / 2, item.y + dy),
        })
      } else if (mode === 'resize') {
        // Grows from the centre, by how far the handle moved away from it.
        const before = Math.hypot(start.x - centre.x, start.y - centre.y)
        const after = Math.hypot(ev.clientX - centre.x, ev.clientY - centre.y)
        const w = clamp(item.w * (after / Math.max(1, before)), MIN_W, MAX_W)
        update(item.id, { w, x: item.x + (item.w - w) / 2, y: item.y + ((item.w - w) * item.aspect) / 2 })
      } else {
        const angle = (a: { x: number; y: number }) => (Math.atan2(a.y - centre.y, a.x - centre.x) * 180) / Math.PI
        const rotation = item.rotation + angle({ x: ev.clientX, y: ev.clientY }) - angle(start)
        update(item.id, { rotation: Math.round(rotation) })
      }
    }
    const onUp = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  // Keyboard: arrows move, + and - resize, [ and ] rotate, Delete removes.
  const onItemKey = (e: KeyboardEvent, item: SheetItem) => {
    const step = e.shiftKey ? 0.05 : 0.01
    const moves: Record<string, Partial<SheetItem>> = {
      ArrowLeft: { x: item.x - step },
      ArrowRight: { x: item.x + step },
      ArrowUp: { y: item.y - step },
      ArrowDown: { y: item.y + step },
      '+': { w: clamp(item.w * 1.1, MIN_W, MAX_W) },
      '=': { w: clamp(item.w * 1.1, MIN_W, MAX_W) },
      '-': { w: clamp(item.w / 1.1, MIN_W, MAX_W) },
      '[': { rotation: item.rotation - 5 },
      ']': { rotation: item.rotation + 5 },
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      remove(item.id)
    } else if (moves[e.key]) {
      e.preventDefault()
      update(item.id, moves[e.key])
    }
  }

  return (
    <div className="journal-sheet-frame">
      <div
        ref={(el) => {
          sheetRef.current = el
          setSheet(el)
        }}
        className={`journal-sheet${editable ? ' editing' : ''}`}
        // Captions hang below their pictures: leave room for one.
        style={{ minHeight: `calc(${bottom * 100}cqw + ${items.some((i) => i.caption || i.id === selected) ? 56 : 24}px)` }}
        onPointerDown={() => setSelected(null)}
      >
        {/* The pictures' stand-ins, then the text, which wraps around them. */}
        <div className="journal-flow">
          {floats.map((f) => (
            <span
              key={f.key}
              className={`wrap-float ${f.side}`}
              aria-hidden="true"
              contentEditable={false}
              style={{ width: f.width, height: f.height, shapeOutside: f.shape }}
            />
          ))}
          {editable ? (
            <EditableText
              text={text}
              onChange={onTextChange!}
              lang={lang}
              label={label}
              placeholder={placeholder}
              sheetRef={sheetRef}
              apiRef={apiRef}
            />
          ) : (
            <div className={richText ? 'journal-text annotated' : 'journal-text'} lang={lang}>
              {richText ?? text}
            </div>
          )}
        </div>
        {items.map((item) => (
          <ItemView
            key={item.id}
            item={item}
            editable={editable}
            selected={selected === item.id}
            onStart={(e, mode) => startDrag(e, item, mode)}
            onKey={(e) => onItemKey(e, item)}
            onCaption={(caption) => update(item.id, { caption })}
            captionPlaceholder={captionPlaceholder}
            lang={lang}
            onFocus={() => setSelected(item.id)}
            onRemove={() => remove(item.id)}
          />
        ))}
      </div>
    </div>
  )
}

type ItemProps = {
  item: SheetItem
  editable: boolean
  selected: boolean
  onStart: (e: PointerEvent, mode: 'move' | 'resize' | 'rotate') => void
  onKey: (e: KeyboardEvent) => void
  onFocus: () => void
  onRemove: () => void
  onCaption: (caption: string) => void
  captionPlaceholder?: string
  lang?: string
}

function ItemView({ item, editable, selected, onStart, onKey, onFocus, onRemove, onCaption, captionPlaceholder, lang }: ItemProps) {
  const url = objectUrl(item.image)
  const name = item.kind === 'photo' ? 'Photo' : 'Sticker'
  return (
    <div
      className={`sheet-item ${item.kind}${selected ? ' selected' : ''}`}
      data-id={item.id}
      style={{
        left: `${item.x * 100}cqw`,
        top: `${item.y * 100}cqw`,
        width: `${item.w * 100}cqw`,
        transform: `rotate(${item.rotation}deg)`,
      }}
      {...(editable && {
        tabIndex: 0,
        role: 'button',
        'aria-label': `${name}: drag to move. Arrow keys move, + and − resize, [ and ] rotate, Delete removes.`,
        onPointerDown: (e: PointerEvent) => onStart(e, 'move'),
        onKeyDown: onKey,
        onFocus,
      })}
    >
      <img src={url} alt={editable ? '' : item.caption || name} draggable={false} />
      {editable && selected ? (
        // Typing here mustn't drag the picture or reach its keyboard shortcuts (Backspace removes it).
        <input
          className="item-caption-input"
          value={item.caption ?? ''}
          placeholder={captionPlaceholder}
          lang={lang}
          aria-label={`${name} caption`}
          enterKeyHint="done"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          onChange={(e) => onCaption(e.target.value)}
        />
      ) : (
        item.caption && <Caption item={item} lang={lang} />
      )}
      {editable && selected && (
        <>
          <button
            type="button"
            className="item-handle remove"
            aria-label={`Remove ${name.toLowerCase()}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onRemove}
          >
            ✕
          </button>
          <span className="item-handle rotate" aria-hidden="true" onPointerDown={(e) => onStart(e, 'rotate')}>
            ⟳
          </span>
          <span className="item-handle resize" aria-hidden="true" onPointerDown={(e) => onStart(e, 'resize')} />
        </>
      )}
    </div>
  )
}

// A picture's caption, hanging below it with a small arrow, like a zine sticker's label. The learner's words
// are blue; when Mai changed them, they're struck out and her version follows in red.
function Caption({ item, lang }: { item: SheetItem; lang?: string }) {
  const caption = item.caption ?? ''
  const check = item.captionCheck?.input === caption ? item.captionCheck : undefined
  const fixed = check && check.corrected.trim() !== caption.trim() ? check : undefined
  return (
    <p className="item-caption" lang={lang} title={fixed?.changes.map((c) => c.why).join(' ')}>
      <span className="caption-arrow" aria-hidden="true">
        ↳
      </span>
      {fixed ? (
        <>
          <s>{caption}</s> <strong className="caption-fix">{fixed.corrected}</strong>
        </>
      ) : (
        <span>{caption}</span>
      )}
    </p>
  )
}

// Browsers that can't edit plain text only (`plaintext-only`) get a rich editable area whose pastes are
// turned into plain text.
const PLAIN_ONLY = (() => {
  if (typeof document === 'undefined') return false
  const probe = document.createElement('div')
  probe.contentEditable = 'plaintext-only'
  return probe.contentEditable === 'plaintext-only'
})()

// The text as the learner sees it, with line breaks however the browser made them (newlines or <br>s).
const readText = (el: HTMLElement) => el.innerText.replace(/\u00a0/g, ' ').replace(/\n$/, '')

type EditableTextProps = {
  text: string
  onChange: (text: string) => void
  lang?: string
  label?: string
  placeholder?: string
  sheetRef: RefObject<HTMLDivElement | null>
  apiRef?: RefObject<SheetApi | null>
}

// The page's text while editing: an editable area (not a textarea), so it wraps around the pictures'
// floats like the saved page. React doesn't render its text (that would fight the browser's editing);
// the text is put in when it changes from outside (a frame inserted, an entry opened).
function EditableText({ text, onChange, lang, label, placeholder, sheetRef, apiRef }: EditableTextProps) {
  const ref = useRef<HTMLDivElement>(null)
  const shown = useRef<string | null>(null)
  // The last cursor position inside the text, so a frame goes where the learner was writing.
  const lastRange = useRef<Range | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (el && text !== shown.current) {
      el.textContent = text
      shown.current = text
    }
  }, [text])

  useEffect(() => {
    const onSelection = () => {
      const sel = document.getSelection()
      const el = ref.current
      if (sel?.rangeCount && el?.contains(sel.anchorNode)) lastRange.current = sel.getRangeAt(0).cloneRange()
    }
    document.addEventListener('selectionchange', onSelection)
    return () => document.removeEventListener('selectionchange', onSelection)
  }, [])

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      insert(insertText, select) {
        const el = ref.current
        const sel = document.getSelection()
        if (!el || !sel) return
        el.focus()
        let range = lastRange.current && el.contains(lastRange.current.startContainer) ? lastRange.current : null
        if (!range) {
          range = document.createRange()
          range.selectNodeContents(el)
          range.collapse(false)
        }
        sel.removeAllRanges()
        sel.addRange(range)
        // A space before the inserted text unless the cursor is at the start or after a space.
        const before = document.createRange()
        before.setStart(el, 0)
        before.setEnd(range.startContainer, range.startOffset)
        const gap = before.toString() && !/\s$/.test(before.toString()) ? ' ' : ''
        // insertText keeps the browser's undo history and fires `input`, which saves the change.
        document.execCommand('insertText', false, gap + insertText)
        if (select) {
          const modify = (sel as Selection & { modify?: (a: string, d: string, g: string) => void }).modify?.bind(sel)
          if (modify) {
            for (let i = 0; i < insertText.length - select.start; i++) modify('move', 'backward', 'character')
            for (let i = 0; i < select.end - select.start; i++) modify('extend', 'forward', 'character')
          }
        }
      },
      textBottom() {
        const el = ref.current
        const sheet = sheetRef.current
        if (!el || !sheet || !el.textContent) return 0
        const range = document.createRange()
        range.selectNodeContents(el)
        const rects = range.getClientRects()
        const last = rects[rects.length - 1]
        const box = sheet.getBoundingClientRect()
        return last ? (last.bottom - box.top) / box.width : 0
      },
    }
  }, [apiRef, sheetRef])

  return (
    <div
      ref={ref}
      className={`journal-text${text ? '' : ' empty'}`}
      contentEditable={PLAIN_ONLY ? 'plaintext-only' : true}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      data-placeholder={placeholder}
      lang={lang}
      onInput={(e) => {
        const value = readText(e.currentTarget)
        shown.current = value
        onChange(value)
      }}
      onPaste={(e) => {
        // Pictures are handled by the editor (they become stickers); text comes in as plain text.
        if ([...e.clipboardData.files].some((f) => f.type.startsWith('image/'))) return
        if (PLAIN_ONLY) return
        e.preventDefault()
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  )
}
