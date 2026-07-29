import { cn } from '../lib/cn'
import { ATTENDANCE_STATUSES, STATUS_LABELS, STATUS_SHORT, type AttendanceStatus } from '../types'

const ACTIVE: Record<AttendanceStatus, string> = {
  present: 'bg-positive text-white',
  absent: 'bg-critical text-white',
  cancelled: 'bg-ink-muted text-white',
  holiday: 'bg-ink-muted text-white'
}

interface StatusControlProps {
  value?: AttendanceStatus
  onChange: (status: AttendanceStatus) => void
  /** Letters instead of words, for dense list rows. */
  compact?: boolean
  disabled?: boolean
  label: string
}

/**
 * Four mutually exclusive states, one tap each.
 *
 * Colour alone never carries the meaning: the selected option is also the only
 * filled tile and every button keeps a full-word accessible name, so the
 * control still reads correctly in greyscale and to a screen reader.
 */
export function StatusControl({
  value,
  onChange,
  compact = false,
  disabled = false,
  label
}: StatusControlProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'overflow-hidden rounded-xl border border-line bg-canvas',
        compact ? 'inline-flex shrink-0' : 'flex w-full',
        disabled && 'opacity-50'
      )}
    >
      {ATTENDANCE_STATUSES.map((status) => {
        const selected = value === status
        return (
          <button
            key={status}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            aria-label={STATUS_LABELS[status]}
            title={STATUS_LABELS[status]}
            onClick={() => onChange(status)}
            className={cn(
              'h-11 border-r border-line text-[0.72rem] font-semibold transition-colors last:border-r-0',
              compact ? 'w-10' : 'flex-1 px-3',
              selected ? ACTIVE[status] : 'text-ink-muted hover:bg-surface hover:text-ink',
              disabled && 'cursor-not-allowed'
            )}
          >
            {compact ? STATUS_SHORT[status] : STATUS_LABELS[status]}
          </button>
        )
      })}
    </div>
  )
}
