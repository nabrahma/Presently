import { MAX_TARGET, MIN_TARGET, type AttendanceRecord } from '../types'

export interface AttendanceStats {
  present: number
  absent: number
  cancelled: number
  holiday: number
  /** Classes that count toward the percentage: present + absent. */
  total: number
  /** Every record, including the ones excluded from the percentage. */
  recorded: number
  percentage: number | null
  /** Classes that can still be missed while staying on target, or null if below target. */
  bunkable: number | null
  /** Consecutive classes needed to reach target, or null if already on target. */
  comeback: number | null
}

export const EMPTY_STATS: AttendanceStats = {
  present: 0,
  absent: 0,
  cancelled: 0,
  holiday: 0,
  total: 0,
  recorded: 0,
  percentage: null,
  bunkable: null,
  comeback: null
}

/** Guards against a stored target of 0, NaN, or something above 100. */
export function normalizeTarget(target: number): number {
  if (!Number.isFinite(target)) return 75
  return Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(target)))
}

/**
 * Floating point makes `0.75 * 20` land at 14.999999999999998, which would turn
 * an exact boundary into an off-by-one. Comparisons are done in integer space
 * instead: `present * 100 >= target * total`.
 */
export function attendanceStats(records: AttendanceRecord[], targetPercentage: number): AttendanceStats {
  let present = 0
  let absent = 0
  let cancelled = 0
  let holiday = 0

  for (const record of records) {
    if (record.status === 'present') present += 1
    else if (record.status === 'absent') absent += 1
    else if (record.status === 'cancelled') cancelled += 1
    else if (record.status === 'holiday') holiday += 1
  }

  const total = present + absent
  const recorded = present + absent + cancelled + holiday
  const target = normalizeTarget(targetPercentage)

  if (total === 0) {
    return { ...EMPTY_STATS, present, absent, cancelled, holiday, total, recorded }
  }

  const percentage = Math.round((present / total) * 1000) / 10
  const onTarget = present * 100 >= target * total

  if (onTarget) {
    // Largest n where present / (total + n) still meets target.
    const bunkable = Math.max(0, Math.floor((present * 100 - target * total) / target))
    return { present, absent, cancelled, holiday, total, recorded, percentage, bunkable, comeback: null }
  }

  // A 100% target can never be recovered once a class has been missed.
  if (target >= 100) {
    return { present, absent, cancelled, holiday, total, recorded, percentage, bunkable: null, comeback: null }
  }

  // Smallest n where (present + n) / (total + n) meets target.
  const comeback = Math.max(1, Math.ceil((target * total - present * 100) / (100 - target)))
  return { present, absent, cancelled, holiday, total, recorded, percentage, bunkable: null, comeback }
}

export type SafetyZone = 'neutral' | 'danger' | 'caution' | 'safe'

export function safetyZone(percentage: number | null, target: number): SafetyZone {
  if (percentage === null) return 'neutral'
  const normalized = normalizeTarget(target)
  if (percentage < normalized) return 'danger'
  if (percentage < normalized + 5) return 'caution'
  return 'safe'
}

/**
 * Overall attendance pools every counted class rather than averaging subject
 * percentages, so a subject with two classes cannot outweigh one with thirty.
 */
export function overallStats(records: AttendanceRecord[], targetPercentage: number): AttendanceStats {
  return attendanceStats(records, targetPercentage)
}
