import { cn } from '../lib/cn'
import type { SafetyZone } from '../lib/attendanceMath'

const TRACK: Record<SafetyZone, string> = {
  neutral: 'bg-ink-faint',
  safe: 'bg-positive',
  caution: 'bg-warning',
  danger: 'bg-critical'
}

interface MeterProps {
  percentage: number | null
  target: number
  zone: SafetyZone
}

/**
 * The percentage as a line, with the target marked on it.
 *
 * A bare number answers "where am I"; the marker answers "am I past the line",
 * which is the question people actually open the app with.
 */
export function AttendanceMeter({ percentage, target, zone }: MeterProps) {
  const filled = Math.max(0, Math.min(100, percentage ?? 0))

  return (
    <div>
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-line"
        role="img"
        aria-label={
          percentage === null
            ? `No classes recorded. Target ${target} percent.`
            : `${percentage} percent attendance against a ${target} percent target.`
        }
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', TRACK[zone])}
          style={{ width: `${filled}%` }}
        />
      </div>

      <div className="relative mt-1.5 h-4">
        <span
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[0.6rem] font-semibold
                     tracking-[0.08em] text-ink-faint uppercase"
          style={{ left: `${Math.min(94, Math.max(6, target))}%` }}
        >
          {target}% target
        </span>
      </div>
    </div>
  )
}

/** The same idea at list density: no labels, just position against target. */
export function MiniMeter({ percentage, target, zone }: MeterProps) {
  const filled = Math.max(0, Math.min(100, percentage ?? 0))

  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-line">
      <div className={cn('h-full rounded-full', TRACK[zone])} style={{ width: `${filled}%` }} />
      <span
        aria-hidden
        className="absolute top-0 h-full w-px bg-ink/40"
        style={{ left: `${Math.min(100, Math.max(0, target))}%` }}
      />
    </div>
  )
}
