import type { AttendanceRecord, Subject } from '../types'
import { keyToDate } from './date'

export interface SessionSlot {
  subject: Subject
  sessionIndex: number
  /** True when nothing on the timetable explains this slot any more. */
  unscheduled: boolean
}

/**
 * Expands a day's timetable into the individual sessions a person can mark.
 *
 * Records are folded in as well. A subject's timetable can change mid-semester,
 * and without this an already-marked class would quietly disappear from a past
 * day — visible in the totals but impossible to correct.
 */
export function sessionsForDate(
  subjects: Subject[],
  records: AttendanceRecord[],
  dateKeyValue: string
): SessionSlot[] {
  const weekday = keyToDate(dateKeyValue).getDay()
  const byId = new Map(subjects.map((subject) => [subject.id, subject]))
  const slots: SessionSlot[] = []
  const seen = new Set<string>()

  for (const subject of subjects) {
    if (subject.isArchived) continue
    const entry = subject.schedule.find((item) => item.weekday === weekday)
    if (!entry) continue

    for (let index = 1; index <= entry.sessionsPerDay; index += 1) {
      slots.push({ subject, sessionIndex: index, unscheduled: false })
      seen.add(`${subject.id}|${index}`)
    }
  }

  for (const record of records) {
    if (record.recordDate !== dateKeyValue) continue
    const key = `${record.subjectId}|${record.sessionIndex}`
    if (seen.has(key)) continue

    const subject = byId.get(record.subjectId)
    if (!subject) continue

    slots.push({ subject, sessionIndex: record.sessionIndex, unscheduled: true })
    seen.add(key)
  }

  return slots.sort((a, b) => {
    const byName = a.subject.name.localeCompare(b.subject.name)
    return byName !== 0 ? byName : a.sessionIndex - b.sessionIndex
  })
}

/** Total sessions a subject meets in a normal week. */
export function weeklyLoad(subject: Subject): number {
  return subject.schedule.reduce((total, item) => total + item.sessionsPerDay, 0)
}
