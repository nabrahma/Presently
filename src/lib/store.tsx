import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppData, AttendanceRecord, AttendanceStatus, Profile, Subject } from '../types'
import { supabase } from './supabaseClient'

const STORAGE_KEY_PREFIX = 'presently-data-v2'
const emptyData: AppData = { profile: null, subjects: [], records: [] }

const createId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
const now = () => new Date().toISOString()

function cacheKey(accountId: string) {
  return `${STORAGE_KEY_PREFIX}:${accountId}`
}

function readCachedData(accountId: string): AppData {
  try {
    const raw = localStorage.getItem(cacheKey(accountId))
    return raw ? JSON.parse(raw) as AppData : emptyData
  } catch {
    return emptyData
  }
}

function writeCachedData(accountId: string, data: AppData) {
  localStorage.setItem(cacheKey(accountId), JSON.stringify(data))
}

function clearCachedData(accountId: string) {
  localStorage.removeItem(cacheKey(accountId))
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
  const [data, setData] = useState<AppData>(() => supabase ? emptyData : readCachedData('local'))
  const [ready, setReady] = useState(!supabase)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    if (userId) writeCachedData(userId, data)
    else if (!supabase) writeCachedData('local', data)
  }, [data, userId])

  useEffect(() => {
    if (!supabase) return

    const client = supabase
    let active = true
    let activeAccountId: string | null = null

    const syncCachedAccount = async (id: string, cached: AppData) => {
      if (cached.profile) {
        await client.from('profiles').upsert({
          id,
          full_name: cached.profile.fullName ?? null,
          branch: cached.profile.branch,
          semester: cached.profile.semester,
          default_target_percentage: cached.profile.defaultTargetPercentage
        })
      }
      if (cached.subjects.length) {
        await client.from('subjects').upsert(cached.subjects.map((subject) => ({
          id: subject.id,
          user_id: id,
          name: subject.name,
          code: subject.code ?? null,
          subject_type: subject.subjectType,
          color: subject.color,
          target_percentage: subject.targetPercentage,
          is_archived: subject.isArchived,
          created_at: subject.createdAt
        })))
        const schedules = cached.subjects.flatMap((subject) => subject.schedule.map((item) => ({
          subject_id: subject.id,
          weekday: item.weekday,
          sessions_per_day: item.sessionsPerDay
        })))
        if (schedules.length) await client.from('subject_schedule').upsert(schedules, { onConflict: 'subject_id,weekday' })
      }
      if (cached.records.length) {
        await client.from('attendance_records').upsert(cached.records.map((record) => ({
          user_id: id,
          subject_id: record.subjectId,
          record_date: record.recordDate,
          session_index: record.sessionIndex,
          status: record.status
        })), { onConflict: 'subject_id,record_date,session_index' })
      }
    }

    const loadAccount = async (id: string, cached: AppData) => {
      await syncCachedAccount(id, cached)
      const [profileResult, subjectsResult, schedulesResult, recordsResult] = await Promise.all([
        client.from('profiles').select('*').eq('id', id).maybeSingle(),
        client.from('subjects').select('*').eq('user_id', id).order('created_at'),
        client.from('subject_schedule').select('*'),
        client.from('attendance_records').select('*').eq('user_id', id)
      ])

      if (!active) return
      if (profileResult.error || subjectsResult.error || schedulesResult.error || recordsResult.error) return

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
        activeAccountId = null
        setUserId(null)
        setData(emptyData)
        setReady(true)
        return
      }

      activeAccountId = session.user.id
      setUserId(session.user.id)
      const cached = readCachedData(session.user.id)
      setData(cached)
      setReady(true)
      void loadAccount(session.user.id, cached)
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => handleSession(session))
    const syncOnReconnect = () => {
      if (!activeAccountId) return
      const cached = readCachedData(activeAccountId)
      void loadAccount(activeAccountId, cached)
    }
    window.addEventListener('online', syncOnReconnect)
    return () => {
      active = false
      subscription.unsubscribe()
      window.removeEventListener('online', syncOnReconnect)
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
      if (userId) clearCachedData(userId)
      else clearCachedData('local')
    },
    signOut: async () => {
      if (supabase) await supabase.auth.signOut()
      setUserId(null)
      setData(emptyData)
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
