import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppData, AttendanceRecord, AttendanceStatus, Profile, Subject } from '../types'

const STORAGE_KEY = 'presently-data-v1'
const blank: AppData = { profile: null, subjects: [], records: [] }
const id = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
const isoNow = () => new Date().toISOString()

function readData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as AppData : blank
  } catch { return blank }
}

interface Store extends AppData {
  ready: boolean
  saveProfile: (profile: Profile) => void
  addSubject: (subject: Omit<Subject, 'id' | 'createdAt'>) => string
  updateSubject: (id: string, changes: Partial<Subject>) => void
  upsertRecord: (subjectId: string, recordDate: string, sessionIndex: number, status: AttendanceStatus) => void
  removeRecord: (id: string) => void
  exportCsv: () => string
  reset: () => void
  loadDemo: () => void
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(readData)
  const [ready] = useState(true)
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) }, [data])

  const value = useMemo<Store>(() => ({
    ...data, ready,
    saveProfile: (profile) => setData((previous) => ({ ...previous, profile })),
    addSubject: (subject) => {
      const subjectId = id()
      setData((previous) => ({ ...previous, subjects: [...previous.subjects, { ...subject, id: subjectId, createdAt: isoNow() }] }))
      return subjectId
    },
    updateSubject: (subjectId, changes) => setData((previous) => ({ ...previous, subjects: previous.subjects.map((subject) => subject.id === subjectId ? { ...subject, ...changes } : subject) })),
    upsertRecord: (subjectId, recordDate, sessionIndex, status) => setData((previous) => {
      const existing = previous.records.find((record) => record.subjectId === subjectId && record.recordDate === recordDate && record.sessionIndex === sessionIndex)
      const records = existing
        ? previous.records.map((record) => record.id === existing.id ? { ...record, status, updatedAt: isoNow() } : record)
        : [...previous.records, { id: id(), subjectId, recordDate, sessionIndex, status, createdAt: isoNow(), updatedAt: isoNow() }]
      return { ...previous, records }
    }),
    removeRecord: (recordId) => setData((previous) => ({ ...previous, records: previous.records.filter((record) => record.id !== recordId) })),
    exportCsv: () => {
      const header = 'subject,date,session,status\n'
      const rows = data.records.map((record) => {
        const subject = data.subjects.find((item) => item.id === record.subjectId)
        return `"${(subject?.name ?? 'Archived subject').replaceAll('"', '""')}",${record.recordDate},${record.sessionIndex},${record.status}`
      })
      return header + rows.join('\n')
    },
    reset: () => setData(blank),
    loadDemo: () => {
      const today = new Date()
      const date = today.toISOString().slice(0, 10)
      const weekday = today.getDay()
      const profile: Profile = { id: 'local-demo', branch: 'CSE', semester: 5, defaultTargetPercentage: 75, fullName: 'Student' }
      const subjects: Subject[] = [
        { id: 'dsa', name: 'Data Structures & Algorithms', code: 'DSA', subjectType: 'lecture', color: '#6D5EF7', targetPercentage: 75, isArchived: false, createdAt: isoNow(), schedule: [{ weekday, sessionsPerDay: 1 }, { weekday: (weekday + 2) % 7, sessionsPerDay: 1 }] },
        { id: 'em', name: 'Engineering Mathematics II', code: 'EM-II', subjectType: 'lecture', color: '#0F766E', targetPercentage: 75, isArchived: false, createdAt: isoNow(), schedule: [{ weekday, sessionsPerDay: 1 }, { weekday: (weekday + 1) % 7, sessionsPerDay: 1 }] }
      ]
      const statuses: AttendanceStatus[] = ['present', 'present', 'absent', 'present', 'present', 'absent', 'present', 'present']
      const records: AttendanceRecord[] = statuses.map((status, index) => ({ id: `demo-${index}`, subjectId: index < 5 ? 'dsa' : 'em', recordDate: new Date(today.getTime() - (index + 1) * 86400000).toISOString().slice(0, 10), sessionIndex: 1, status, createdAt: isoNow(), updatedAt: isoNow() }))
      setData({ profile, subjects, records: [...records, { id: 'today-demo', subjectId: 'dsa', recordDate: date, sessionIndex: 1, status: 'present', createdAt: isoNow(), updatedAt: isoNow() }] })
    }
  }), [data, ready])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used within StoreProvider')
  return store
}
