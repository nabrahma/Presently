import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  destructive?: boolean
  /** When set, the exact word a person must type before confirming. */
  requirePhrase?: string
}

/**
 * Destructive actions get one deliberate step. The typed-phrase variant is
 * reserved for the irreversible ones, where a mis-tap should not be enough.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = false,
  requirePhrase
}: ConfirmDialogProps) {
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setPhrase('')
      setBusy(false)
    }
  }, [open])

  const ready = !requirePhrase || phrase.trim() === requirePhrase

  const confirm = async () => {
    if (!ready || busy) return
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <p className="text-[0.88rem] leading-relaxed text-ink-muted">{description}</p>

      {requirePhrase ? (
        <label className="mt-5 block">
          <span className="field-label">
            Type “{requirePhrase}” to confirm
          </span>
          <input
            className="field"
            value={phrase}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(event) => setPhrase(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void confirm()
            }}
          />
        </label>
      ) : null}

      <div className="mt-6 flex gap-2.5">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={destructive ? 'btn-danger flex-1' : 'btn-primary flex-1'}
          disabled={!ready || busy}
          onClick={() => void confirm()}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}
