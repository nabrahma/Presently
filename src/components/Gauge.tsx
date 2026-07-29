import { motion } from 'motion/react'
import { cn } from '../lib/cn'
import type { SafetyZone } from '../lib/attendanceMath'

const STROKE: Record<SafetyZone, string> = {
  neutral: 'stroke-ink-faint',
  safe: 'stroke-accent',
  caution: 'stroke-warn',
  danger: 'stroke-danger'
}

const TEXT: Record<SafetyZone, string> = {
  neutral: 'text-ink-faint',
  safe: 'text-accent',
  caution: 'text-warn',
  danger: 'text-danger'
}

interface GaugeProps {
  percentage: number | null
  zone: SafetyZone
  size?: number
  className?: string
}

/**
 * A thin ring with the figure inside it.
 *
 * Drawn as an SVG rather than a conic gradient so the track keeps an even
 * width, the ends stay round, and the sweep can animate.
 */
export function Gauge({ percentage, zone, size = 76, className }: GaugeProps) {
  const stroke = 3
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const filled = Math.max(0, Math.min(100, percentage ?? 0))

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={percentage === null ? 'No attendance recorded' : `${percentage} percent attendance`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-line"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={STROKE[zone]}
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: circumference - (filled / 100) * circumference }}
          transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
        />
      </svg>

      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center font-mono text-[0.82rem] tabular-nums',
          TEXT[zone]
        )}
      >
        {percentage === null ? '––' : Math.round(percentage)}
      </span>
    </div>
  )
}

/** The same reading as a horizontal line, with the target marked on it. */
export function Meter({
  percentage,
  target,
  zone
}: {
  percentage: number | null
  target: number
  zone: SafetyZone
}) {
  const filled = Math.max(0, Math.min(100, percentage ?? 0))
  const FILL: Record<SafetyZone, string> = {
    neutral: 'bg-ink-faint',
    safe: 'bg-accent',
    caution: 'bg-warn',
    danger: 'bg-danger'
  }

  return (
    <div className="relative h-[3px] w-full rounded-full bg-line">
      <motion.div
        className={cn('h-full rounded-full', FILL[zone])}
        initial={false}
        animate={{ width: `${filled}%` }}
        transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      />
      <span
        aria-hidden
        className="absolute -top-1 h-[11px] w-px bg-ink-muted"
        style={{ left: `${Math.min(100, Math.max(0, target))}%` }}
      />
    </div>
  )
}
