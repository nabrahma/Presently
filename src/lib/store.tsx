import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppData, AttendanceRecord, AttendanceStatus, Profile, Subject } from '../types'
import { supabase } from './supabaseClient'

const STORAGE_KEY = 'presently-data-v1'
const emptyData: AppData = { profile: null, subjects: [], records: [] }

const createId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
const now = () => new Date().toISOString()

function readCachedData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as AppData : emptyData
  } catch {
    return emptyData
  }
}

function clearCachedData() {
  localStorage.removeItem(STORAGE_KEY)
}

interface Store extends AppData {
  ready: boolean
  userId: string | null
  saveProfile: (profile: Profile) => void
  addSubject: (subject: Omit<Subject, 'id' | 'createdAt'>) => string
  updateSubject: (id: string, changes: Partial<Subject>) => void
  upsertRecord: (subjectId: string, recordDate: string, sessionIndex: number, status: AttendanceStatus) => void
  removeRecord: (id: string) => void
  exportCsv: () => string
  reset: () => void
  signOut: () => Promise<void>
  loadDemo: () => void
}

const StoreContext = createContext<Store | null>(null)

function toSubject(row: Record<string, unknown>, scheduleRows: Array<Record<string, unknown>>): Subject {
  return {
    id: String(row.id),
    name: String(row.name),
    code: row.code ? String(row.code) : undefined,
    subjectType: row.subject_type as Subject['subjectType'],
    color: String(row.color),
    targetPercentage: Number(row.target_percentage),
    isArchived: Boolean(row.is_archived),
    createdAt: String(row.created_at),
    schedule: scheduleRows
      .filter((schedule) => schedule.subject_id === row.id)
      .map((schedule) => ({ weekday: Number(schedule.weekday), sessionsPerDay: Number(schedule.sessions_per_day) }))
  }
}

function toRecord(row: Record<string, unknown>): AttendanceRecord {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    recordDate: String(row.record_date),
    sessionIndex: Number(row.session_index),
    status: row.status as AttendanceStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => supabase ? emptyData : readCachedData())
  const [ready, setReady] = useState(!supabase)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

  useEffect(() => {
    if (!supabase) return

    const client = supabase
    let active = true

    const loadAccount = async (id: string) => {
      const [profileResult, subjectsResult, schedulesResult, recordsResult] = await Promise.all([
        client.from('profiles').select('*').eq('id', id).maybeSingle(),
        client.from('subjects').select('*').eq('user_id', id).order('created_at'),
        client.from('subject_schedule').select('*'),
        client.from('attendance_records').select('*').eq('user_id', id)
      ])

      if (!active) return

      const profileRow = profileResult.data as Record<string, unknown> | null
      const subjectRows = (subjectsResult.data ?? []) as Array<Record<string, unknown>>
      const scheduleRows = (schedulesResult.data ?? []) as Array<Record<string, unknown>>
      const recordRows = (recordsResult.data ?? []) as Array<Record<string, unknown>>

      setData({
        profile: profileRow
          ? {
              id: String(profileRow.id),
              fullName: profileRow.full_name ? String(profileRow.full_name) : undefined,
              branch: profileRow.branch ? String(profileRow.branch) : 'CSE',
              semester: Number(profileRow.semester ?? 1),
              defaultTargetPercentage: Number(profileRow.default_target_percentage ?? 75)
            }
          : null,
        subjects: subjectRows.map((row) => toSubject(row, scheduleRows)),
        records: recordRows.map(toRecord)
      })
      setReady(true)
    }

    const handleSession = (session: { user: { id: string } } | null) => {
      if (!session) {
        setUserId(null)
        setData(emptyData)
        clearCachedData()
        setReady(true)
        return
      }

      setUserId(session.user.id)
      setReady(false)
      void loadAccount(session.user.id)
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => handleSession(session))
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<Store>(() => ({
    ...data,
    ready,
    userId,
    saveProfile: (profile) => {
      setData((previous) => ({ ...previous, profile }))
      if (supabase && userId) {
        void supabase.from('profiles').upsert({
          id: userId,
          full_name: profile.fullName ?? null,
          branch: profile.branch,
          semester: profile.semester,
          default_target_percentage: profile.defaultTargetPercentage
        })
      }
    },
    addSubject: (subject) => {
      const subjectId = createId()
      const createdAt = now()
      setData((previous) => ({
        ...previous,
        subjects: [...previous.subjects, { ...subject, id: subjectId, createdAt }]
      }))

      if (supabase && userId) {
        void (async () => {
          await supabase.from('subjects').insert({
            id: subjectId,
            user_id: userId,
            name: subject.name,
            code: subject.code ?? null,
            subject_type: subject.subjectType,
            color: subject.color,
            target_percentage: subject.targetPercentage,
            is_archived: subject.isArchived,
            created_at: createdAt
          })
          if (subject.schedule.length) {
            await supabase.from('subject_schedule').insert(
              subject.schedule.map((item) => ({
                subject_id: subjectId,
                weekday: item.weekday,
                sessions_per_day: item.sessionsPerDay
              }))
            )
          }
        })()
      }

      return subjectId
    },
    updateSubject: (subjectId, changes) => {
      setData((previous) => ({
        ...previous,
        subjects: previous.subjects.map((subject) => subject.id === subjectId ? { ...subject, ...changes } : subject)
      }))

      const current = data.subjects.find((subject) => subject.id === subjectId)
      if (!supabase || !userId || !current) return

      const next = { ...current, ...changes }
      void (async () => {
        await supabase.from('subjects').update({
          name: next.name,
          code: next.code ?? null,
          subject_type: next.subjectType,
          color: next.color,
          target_percentage: next.targetPercentage,
          is_archived: next.isArchived
        }).eq('id', subjectId)

        if (changes.schedule) {
          await supabase.from('subject_schedule').delete().eq('subject_id', subjectId)
          if (next.schedule.length) {
            await supabase.from('subject_schedule').insert(
              next.schedule.map((item) => ({
                subject_id: subjectId,
                weekday: item.weekday,
                sessions_per_day: item.sessionsPerDay
              }))
            )
          }
        }
      })()
    },
    upsertRecord: (subjectId, recordDate, sessionIndex, status) => {
      setData((previous) => {
        const existing = previous.records.find((record) => (
          record.subjectId === subjectId && record.recordDate === recordDate && record.sessionIndex === sessionIndex
        ))
        const timestamp = now()
        const records = existing
          ? previous.records.map((record) => record.id === existing.id ? { ...record, status, updatedAt: timestamp } : record)
          : [...previous.records, { id: createId(), subjectId, recordDate, sessionIndex, status, createdAt: timestamp, updatedAt: timestamp }]

        return { ...previous, records }
      })

      if (supabase && userId) {
        void supabase.from('attendance_records').upsert({
          subject_id: subjectId,
          user_id: userId,
          record_date: recordDate,
          session_index: sessionIndex,
          status
        }, { onConflict: 'subject_id,record_date,session_index' })
      }
    },
    removeRecord: (recordId) => {
      setData((previous) => ({
        ...previous,
        records: previous.records.filter((record) => record.id !== recordId)
      }))
      if (supabase && userId) void supabase.from('attendance_records').delete().eq('id', recordId)
    },
    exportCsv: () => {
      const header = 'subject,date,session,status\n'
      const rows = data.records.map((record) => {
        const subject = data.subjects.find((item) => item.id === record.subjectId)
        const name = (subject?.name ?? 'Archived subject').replaceAll('"', '""')
        return `"${name}",${record.recordDate},${record.sessionIndex},${record.status}`
      })
      return header + rows.join('\n')
    },
    reset: () => {
      setData(emptyData)
      clearCachedData()
    },
    signOut: async () => {
      if (supabase) await supabase.auth.signOut()
      setUserId(null)
      setData(emptyData)
      clearCachedData()
    },
    loadDemo: () => {
      const today = new Date()
      const date = today.toISOString().slice(0, 10)
      const weekday = today.getDay()
      const profile: Profile = { id: 'local-demo', branch: 'CSE', semester: 5, defaultTargetPercentage: 75, fullName: 'Student' }
      const subjects: Subject[] = [
        { id: 'dsa', name: 'Data Structures & Algorithms', code: 'DSA', subjectType: 'lecture', color: '#6D5EF7', targetPercentage: 75, isArchived: false, createdAt: now(), schedule: [{ weekday, sessionsPerDay: 1 }, { weekday: (weekday + 2) % 7, sessionsPerDay: 1 }] },
        { id: 'em', name: 'Engineering Mathematics II', code: 'EM-II', subjectType: 'lecture', color: '#0F766E', targetPercentage: 75, isArchived: false, createdAt: now(), schedule: [{ weekday, sessionsPerDay: 1 }, { weekday: (weekday + 1) % 7, sessionsPerDay: 1 }] }
      ]
      const statuses: AttendanceStatus[] = ['present', 'present', 'absent', 'present', 'present', 'absent', 'present', 'present']
      const records: AttendanceRecord[] = statuses.map((status, index) => ({
        id: `demo-${index}`,
        subjectId: index < 5 ? 'dsa' : 'em',
        recordDate: new Date(today.getTime() - (index + 1) * 86400000).toISOString().slice(0, 10),
        sessionIndex: 1,
        status,
        createdAt: now(),
        updatedAt: now()
      }))
      setData({
        profile,
        subjects,
        records: [...records, { id: 'today-demo', subjectId: 'dsa', recordDate: date, sessionIndex: 1, status: 'present', createdAt: now(), updatedAt: now() }]
      })
    }
  }), [data, ready, userId])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used within StoreProvider')
  return store
}
