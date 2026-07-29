import { describe, expect, it } from 'vitest'
import { attendanceStats, normalizeTarget, safetyZone } from './attendanceMath'
import type { AttendanceRecord, AttendanceStatus } from '../types'

let counter = 0
const record = (status: AttendanceStatus): AttendanceRecord => ({
  id: `r${(counter += 1)}`,
  subjectId: 's',
  recordDate: '2026-01-01',
  sessionIndex: 1,
  status,
  createdAt: '',
  updatedAt: ''
})

const build = (present: number, absent: number, cancelled = 0, holiday = 0): AttendanceRecord[] => [
  ...Array.from({ length: present }, () => record('present')),
  ...Array.from({ length: absent }, () => record('absent')),
  ...Array.from({ length: cancelled }, () => record('cancelled')),
  ...Array.from({ length: holiday }, () => record('holiday'))
]

describe('attendanceStats', () => {
  it('matches the documented worked examples', () => {
    expect(attendanceStats(build(12, 5), 75)).toMatchObject({ percentage: 70.6, comeback: 3 })
    expect(attendanceStats(build(15, 2), 75)).toMatchObject({ percentage: 88.2, bunkable: 3 })
    expect(attendanceStats(build(11, 5), 75)).toMatchObject({ percentage: 68.8, comeback: 4 })
  })

  it('excludes cancelled and holiday sessions from the percentage', () => {
    expect(attendanceStats(build(1, 1, 5, 3), 75)).toMatchObject({
      total: 2,
      percentage: 50,
      cancelled: 5,
      holiday: 3,
      recorded: 10
    })
  })

  it('reports no data rather than zero for an empty set', () => {
    expect(attendanceStats([], 75)).toMatchObject({
      percentage: null,
      bunkable: null,
      comeback: null,
      total: 0
    })
  })

  it('treats sitting exactly on target as safe with no room to spare', () => {
    // 15/20 is exactly 75%: on target, but one more absence breaks it.
    expect(attendanceStats(build(15, 5), 75)).toMatchObject({ percentage: 75, bunkable: 0 })
  })

  it('survives the float boundaries that a fractional target lands just under', () => {
    // Evaluated in float space, 0.75 * 20 is 14.999999999999998 and these
    // exactly-on-target cases wrongly report a comeback instead.
    expect(attendanceStats(build(3, 1), 75).bunkable).toBe(0)
    expect(attendanceStats(build(30, 10), 75).bunkable).toBe(0)
    expect(attendanceStats(build(60, 20), 75).bunkable).toBe(0)
  })

  it('never suggests a comeback of zero while below target', () => {
    for (let present = 0; present <= 40; present += 1) {
      for (let absent = 1; absent <= 20; absent += 1) {
        const stats = attendanceStats(build(present, absent), 75)
        if (stats.comeback === null) continue
        expect(stats.comeback).toBeGreaterThan(0)
      }
    }
  })

  it('produces the smallest comeback that actually reaches the target', () => {
    for (let present = 0; present <= 30; present += 1) {
      for (let absent = 1; absent <= 15; absent += 1) {
        const stats = attendanceStats(build(present, absent), 75)
        if (stats.comeback === null) continue

        const total = present + absent
        expect((present + stats.comeback) / (total + stats.comeback)).toBeGreaterThanOrEqual(0.75)
        expect(
          (present + stats.comeback - 1) / (total + stats.comeback - 1)
        ).toBeLessThan(0.75)
      }
    }
  })

  it('produces the largest bunkable count that still stays on target', () => {
    for (let present = 1; present <= 40; present += 1) {
      for (let absent = 0; absent <= 15; absent += 1) {
        const stats = attendanceStats(build(present, absent), 75)
        if (stats.bunkable === null) continue

        const total = present + absent
        expect(present / (total + stats.bunkable)).toBeGreaterThanOrEqual(0.75)
        expect(present / (total + stats.bunkable + 1)).toBeLessThan(0.75)
      }
    }
  })

  it('reports an unrecoverable 100% target instead of an infinite comeback', () => {
    const stats = attendanceStats(build(9, 1), 100)
    expect(stats.percentage).toBe(90)
    expect(stats.comeback).toBeNull()
    expect(stats.bunkable).toBeNull()
  })

  it('allows a perfect record to satisfy a 100% target', () => {
    expect(attendanceStats(build(5, 0), 100)).toMatchObject({ percentage: 100, bunkable: 0 })
  })

  it('never divides by a zero, negative, or non-finite target', () => {
    for (const target of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const stats = attendanceStats(build(3, 1), target)
      expect(Number.isFinite(stats.bunkable ?? stats.comeback ?? 0)).toBe(true)
    }
  })

  it('handles a record set with no attended classes at all', () => {
    expect(attendanceStats(build(0, 4), 75)).toMatchObject({ percentage: 0, comeback: 12 })
  })
})

describe('normalizeTarget', () => {
  it('clamps anything unusable into a sane range', () => {
    expect(normalizeTarget(0)).toBe(1)
    expect(normalizeTarget(-5)).toBe(1)
    expect(normalizeTarget(140)).toBe(100)
    expect(normalizeTarget(Number.NaN)).toBe(75)
    expect(normalizeTarget(74.6)).toBe(75)
  })
})

describe('safetyZone', () => {
  it('separates below target, close to target, and clear of it', () => {
    expect(safetyZone(null, 75)).toBe('neutral')
    expect(safetyZone(74.9, 75)).toBe('danger')
    expect(safetyZone(75, 75)).toBe('caution')
    expect(safetyZone(79.9, 75)).toBe('caution')
    expect(safetyZone(80, 75)).toBe('safe')
  })
})
