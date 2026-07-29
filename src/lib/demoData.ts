import type { AppData, AttendanceStatus, Subject } from '../types'
import { dateKey, shiftKey, todayKey } from './date'

/**
 * A demo has to look like a real half-semester or the numbers it shows are
 * meaningless, so this generates eight weeks of plausible history around the
 * current date rather than a fixed set of rows.
 */
export function demoData(): AppData {
  const today = todayKey()
  const start = shiftKey(today, -56)

  const subjects: Subject[] = [
    {
      id: 'demo-dsa',
      name: 'Data Structures & Algorithms',
      code: 'DSA',
      subjectType: 'lecture',
      color: '#2b7fd4',
      targetPercentage: 75,
      isArchived: false,
      createdAt: new Date().toISOString(),
      schedule: [
        { weekday: 1, sessionsPerDay: 1 },
        { weekday: 3, sessionsPerDay: 1 },
        { weekday: 5, sessionsPerDay: 1 }
      ]
    },
    {
      id: 'demo-dbms',
      name: 'Database Systems Lab',
      code: 'DBMS-L',
      subjectType: 'lab',
      color: '#1f8a4c',
      targetPercentage: 75,
      isArchived: false,
      createdAt: new Date().toISOString(),
      schedule: [{ weekday: 2, sessionsPerDay: 2 }]
    },
    {
      id: 'demo-maths',
      name: 'Discrete Mathematics',
      code: 'MA201',
      subjectType: 'lecture',
      color: '#e2503a',
      targetPercentage: 80,
      isArchived: false,
      createdAt: new Date().toISOString(),
      schedule: [
        { weekday: 2, sessionsPerDay: 1 },
        { weekday: 4, sessionsPerDay: 1 }
      ]
    }
  ]

  // A fixed pattern per subject keeps the demo identical on every visit, which
  // matters when the numbers on screen are the thing being demonstrated.
  const patterns: Record<string, AttendanceStatus[]> = {
    'demo-dsa': ['present', 'present', 'present', 'absent', 'present', 'present', 'cancelled', 'present'],
    'demo-dbms': ['present', 'present', 'absent', 'present', 'present', 'holiday', 'present', 'present'],
    'demo-maths': ['present', 'absent', 'present', 'absent', 'present', 'present', 'absent', 'present']
  }

  const records: AppData['records'] = []
  const counters: Record<string, number> = { 'demo-dsa': 0, 'demo-dbms': 0, 'demo-maths': 0 }
  const stamp = new Date().toISOString()

  for (let offset = 0; ; offset += 1) {
    const key = shiftKey(start, offset)
    if (key > today) break

    const weekday = new Date(`${key}T12:00:00`).getDay()

    for (const subject of subjects) {
      const slot = subject.schedule.find((item) => item.weekday === weekday)
      if (!slot) continue

      for (let session = 1; session <= slot.sessionsPerDay; session += 1) {
        const pattern = patterns[subject.id]
        const status = pattern[counters[subject.id] % pattern.length]
        counters[subject.id] += 1

        records.push({
          id: `demo-${subject.id}-${key}-${session}`,
          subjectId: subject.id,
          recordDate: key,
          sessionIndex: session,
          status,
          createdAt: stamp,
          updatedAt: stamp
        })
      }
    }
  }

  return {
    profile: {
      id: 'demo',
      branch: 'CSE',
      semester: 5,
      defaultTargetPercentage: 75,
      fullName: 'Demo',
      onboarded: true
    },
    subjects,
    // Today stays unmarked so the daily check-in has something to do.
    records: records.filter((record) => record.recordDate !== dateKey(new Date()))
  }
}
