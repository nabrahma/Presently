import { describe, expect, it } from 'vitest'
import { attendanceStats } from './attendanceMath'
import type { AttendanceRecord } from '../types'

const records = (present: number, absent: number): AttendanceRecord[] => [
  ...Array.from({ length: present }, (_, i) => ({ id: `p${i}`, subjectId: 's', recordDate: '2026-01-01', sessionIndex: i, status: 'present' as const, createdAt: '', updatedAt: '' })),
  ...Array.from({ length: absent }, (_, i) => ({ id: `a${i}`, subjectId: 's', recordDate: '2026-01-02', sessionIndex: i, status: 'absent' as const, createdAt: '', updatedAt: '' }))
]

describe('attendance math', () => {
  it('calculates PRD worked examples', () => {
    // The PRD arithmetic labels this as 1, but (0.75 * 17 - 12) / 0.25 = 3.
    // Three presents are required: 15 / 20 = 75%.
    expect(attendanceStats(records(12, 5), 75)).toMatchObject({ percentage: 70.6, comeback: 3 })
    expect(attendanceStats(records(15, 2), 75)).toMatchObject({ percentage: 88.2, bunkable: 3 })
    expect(attendanceStats(records(11, 5), 75)).toMatchObject({ percentage: 68.8, comeback: 4 })
  })
  it('keeps cancelled and holidays out of totals', () => {
    const data = [...records(1, 1), { id: 'c', subjectId: 's', recordDate: '', sessionIndex: 9, status: 'cancelled' as const, createdAt: '', updatedAt: '' }]
    expect(attendanceStats(data, 75)).toMatchObject({ total: 2, percentage: 50 })
  })
  it('reports no data for an empty record set', () => expect(attendanceStats([], 75).percentage).toBeNull())
})
