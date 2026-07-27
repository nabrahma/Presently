import type { AttendanceRecord } from '../types'

export interface AttendanceStats {
  present: number
  absent: number
  cancelled: number
  holiday: number
  total: number
  percentage: number | null
  bunkable: number | null
  comeback: number | null
}

export function attendanceStats(records: AttendanceRecord[], targetPercentage: number): AttendanceStats {
  const present = records.filter((record) => record.status === 'present').length
  const absent = records.filter((record) => record.status === 'absent').length
  const cancelled = records.filter((record) => record.status === 'cancelled').length
  const holiday = records.filter((record) => record.status === 'holiday').length
  const total = present + absent
  const tau = targetPercentage / 100

  if (total === 0) return { present, absent, cancelled, holiday, total, percentage: null, bunkable: null, comeback: null }

  const percentage = Math.round((present / total) * 1000) / 10
  if (present / total >= tau) {
    const bunkable = tau === 0 ? 0 : Math.max(0, Math.floor(present / tau - total + 1e-9))
    return { present, absent, cancelled, holiday, total, percentage, bunkable, comeback: null }
  }
  const comeback = tau >= 1 ? Number.POSITIVE_INFINITY : Math.max(0, Math.ceil((tau * total - present) / (1 - tau) - 1e-9))
  return { present, absent, cancelled, holiday, total, percentage, bunkable: null, comeback }
}

export function safetyZone(percentage: number | null, target: number): 'neutral' | 'danger' | 'caution' | 'safe' {
  if (percentage === null) return 'neutral'
  if (percentage < target) return 'danger'
  if (percentage < target + 5) return 'caution'
  return 'safe'
}

export function overallStats(records: AttendanceRecord[]) {
  return attendanceStats(records, 75)
}
