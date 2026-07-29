import { motion } from 'motion/react'
import { cn } from '../lib/cn'
import { ATTENDANCE_STATUSES, STATUS_LABELS, STATUS_SHORT, type AttendanceStatus } from '../types'

const FILL: Record<AttendanceStatus, string> = {
  present: 'bg-accent',
  absent: 'bg-danger',
  cancelled: 'bg-ink-muted',
  holiday: 'bg-ink-muted'
}

interface StatusControlProps {
  value?: AttendanceStatus
  onChange: (status: AttendanceStatus) => void
  /** Initials instead of words, for dense list rows. */
  compact?: boolean
  label: string
  /** Distinguishes the sliding indicator between simultaneously mounted controls. */
  layoutId?: string
}

/**
 * Four exclusive states, one tap each.
 *
 * The selected option is the only filled tile and every button keeps its
 * full-word accessible name, so the control still works in greyscale and
 * reads correctly to a screen reader.
 */
export function StatusControl({
  value,
  onChange,
  compact = false,
  label,
  layoutId
}: StatusControlProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'relative flex rounded-full border border-line p-[3px]',
        compact ? 'shrink-0' : 'w-full'
      )}
    >
      {ATTENDANCE_STATUSES.map((status) => {
        const selected = value === status
        return (
          <button
            key={status}
            type="button"
            aria-pressed={selected}
            aria-label={STATUS_LABELS[status]}
            title={STATUS_LABELS[status]}
            onClick={() => onChange(status)}
            className={cn(
              'relative rounded-full font-mono text-[0.68rem] font-medium tracking-[0.06em]',
              'transition-colors duration-150',
              compact ? 'h-8 w-9' : 'h-10 flex-1 px-2 uppercase',
              selected ? 'text-bg' : 'text-ink-muted'
            )}
          >
            {selected ? (
              <motion.span
                layoutId={layoutId ? `${layoutId}-status` : undefined}
                className={cn('absolute inset-0 rounded-full', FILL[status])}
                transition={{ type: 'spring', stiffness: 460, damping: 36 }}
              />
            ) : null}
            <span className="relative z-10">
              {compact ? STATUS_SHORT[status] : STATUS_LABELS[status]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
