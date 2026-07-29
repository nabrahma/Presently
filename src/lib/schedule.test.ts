import { describe, expect, it } from 'vitest'
import { sessionsForDate, weeklyLoad } from './schedule'
import type { AttendanceRecord, Subject } from '../types'

const subject = (overrides: Partial<Subject> = {}): Subject => ({
  id: 's1',
  name: 'Algorithms',
  subjectType: 'lecture',
  color: '#000000',
  targetPercentage: 75,
  isArchived: false,
  schedule: [{ weekday: 3, sessionsPerDay: 1 }],
  createdAt: '',
  ...overrides
})

const entry = (overrides: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  id: 'r1',
  subjectId: 's1',
  recordDate: '2026-07-29',
  sessionIndex: 1,
  status: 'present',
  createdAt: '',
  updatedAt: '',
  ...overrides
})

// 29 July 2026 is a Wednesday (weekday 3).
const WEDNESDAY = '2026-07-29'
const THURSDAY = '2026-07-30'

describe('sessionsForDate', () => {
  it('expands the timetable for the matching weekday', () => {
    const slots = sessionsForDate([subject()], [], WEDNESDAY)
    expect(slots).toHaveLength(1)
    expect(slots[0]).toMatchObject({ sessionIndex: 1, unscheduled: false })
  })

  it('returns nothing on a day the subject does not meet', () => {
    expect(sessionsForDate([subject()], [], THURSDAY)).toHaveLength(0)
  })

  it('creates one slot per session for a multi-session day', () => {
    const slots = sessionsForDate([subject({ schedule: [{ weekday: 3, sessionsPerDay: 3 }] })], [], WEDNESDAY)
    expect(slots.map((slot) => slot.sessionIndex)).toEqual([1, 2, 3])
  })

  it('skips archived subjects', () => {
    expect(sessionsForDate([subject({ isArchived: true })], [], WEDNESDAY)).toHaveLength(0)
  })

  it('keeps a record whose day was removed from the timetable', () => {
    // The class happened and was marked; moving the timetable afterwards must
    // not hide it, or the record becomes impossible to correct.
    const moved = subject({ schedule: [{ weekday: 5, sessionsPerDay: 1 }] })
    const slots = sessionsForDate([moved], [entry()], WEDNESDAY)

    expect(slots).toHaveLength(1)
    expect(slots[0].unscheduled).toBe(true)
  })

  it('keeps an extra session recorded beyond the scheduled count', () => {
    const slots = sessionsForDate([subject()], [entry({ sessionIndex: 2 })], WEDNESDAY)
    expect(slots.map((slot) => slot.sessionIndex)).toEqual([1, 2])
    expect(slots[1].unscheduled).toBe(true)
  })

  it('does not duplicate a session that is both scheduled and recorded', () => {
    expect(sessionsForDate([subject()], [entry()], WEDNESDAY)).toHaveLength(1)
  })

  it('ignores records belonging to another date', () => {
    const moved = subject({ schedule: [] })
    expect(sessionsForDate([moved], [entry({ recordDate: THURSDAY })], WEDNESDAY)).toHaveLength(0)
  })

  it('ignores a record whose subject no longer exists', () => {
    expect(sessionsForDate([], [entry({ subjectId: 'gone' })], WEDNESDAY)).toHaveLength(0)
  })

  it('orders slots by subject name, then session', () => {
    const slots = sessionsForDate(
      [
        subject({ id: 'b', name: 'Zoology', schedule: [{ weekday: 3, sessionsPerDay: 2 }] }),
        subject({ id: 'a', name: 'Anatomy' })
      ],
      [],
      WEDNESDAY
    )
    expect(slots.map((slot) => `${slot.subject.name}${slot.sessionIndex}`)).toEqual([
      'Anatomy1',
      'Zoology1',
      'Zoology2'
    ])
  })
})

describe('weeklyLoad', () => {
  it('adds up sessions across every scheduled day', () => {
    expect(
      weeklyLoad(
        subject({
          schedule: [
            { weekday: 1, sessionsPerDay: 2 },
            { weekday: 3, sessionsPerDay: 1 }
          ]
        })
      )
    ).toBe(3)
  })

  it('is zero for a subject with no days set', () => {
    expect(weeklyLoad(subject({ schedule: [] }))).toBe(0)
  })
})
