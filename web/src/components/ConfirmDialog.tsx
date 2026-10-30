import { useEffect, useId } from 'react'

// A small window over the page asking "are you sure?" before something that can't be undone (owner's
// request 2026-10-30: the last of three clicks to delete a journal entry). The same backdrop and card as
// StickerMaker's modal; Escape or a click outside keeps things as they are.
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Keep',
  onConfirm,
  onCancel,
}: {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const titleId = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        {message && <p className="muted">{message}</p>}
        <div className="confirm-actions">
          <button type="button" className="chip" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button type="button" className="chip danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
