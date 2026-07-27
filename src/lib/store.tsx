import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppData, AttendanceRecord, AttendanceStatus, Profile, Subject } from '../types'
import { supabase } from './supabaseClient'

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
  userId: string | null
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
  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) }, [data])

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let mounted = true
    const load = async (id: string) => {
      const [{ data: profileRow }, { data: subjectRows }, { data: scheduleRows }, { data: recordRows }] = await Promise.all([
        client.from('profiles').select('*').eq('id', id).maybeSingle(),
        client.from('subjects').select('*').eq('user_id', id).order('created_at'),
        client.from('subject_schedule').select('*'),
        client.from('attendance_records').select('*').eq('user_id', id)
      ])
      if (!mounted) return
      const subjects = (subjectRows ?? []).map((row) => ({
        id: row.id, name: row.name, code: row.code ?? undefined, subjectType: row.subject_type, color: row.color,
        targetPercentage: Number(row.target_percentage), isArchived: row.is_archived, createdAt: row.created_at,
        schedule: (scheduleRows ?? []).filter((item) => item.subject_id === row.id).map((item) => ({ weekday: item.weekday, sessionsPerDay: item.sessions_per_day }))
      })) as Subject[]
      const records = (recordRows ?? []).map((row) => ({ id: row.id, subjectId: row.subject_id, recordDate: row.record_date, sessionIndex: row.session_index, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at })) as AttendanceRecord[]
      setData({ profile: profileRow ? { id: profileRow.id, fullName: profileRow.full_name ?? undefined, branch: profileRow.branch ?? 'CSE', semester: profileRow.semester ?? 1, defaultTargetPercentage: Number(profileRow.default_target_percentage ?? 75) } : null, subjects, records })
    }
    const initialise = async () => { const { data: { session } } = await client.auth.getSession(); if (session) { setUserId(session.user.id); void load(session.user.id) } }
    void initialise()
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => { setUserId(session?.user.id ?? null); if (session) void load(session.user.id); else setData(readData()) })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  const value = useMemo<Store>(() => ({
    ...data, ready, userId,
    saveProfile: (profile) => { setData((previous) => ({ ...previous, profile })); if (supabase && userId) void supabase.from('profiles').upsert({ id: userId, full_name: profile.fullName ?? null, branch: profile.branch, semester: profile.semester, default_target_percentage: profile.defaultTargetPercentage }) },
    addSubject: (subject) => {
      const subjectId = id()
      const createdAt = isoNow(); setData((previous) => ({ ...previous, subjects: [...previous.subjects, { ...subject, id: subjectId, createdAt }] }))
      if (supabase && userId) void (async () => { await supabase.from('subjects').insert({ id: subjectId, user_id: userId, name: subject.name, code: subject.code ?? null, subject_type: subject.subjectType, color: subject.color, target_percentage: subject.targetPercentage, is_archived: subject.isArchived, created_at: createdAt }); if (subject.schedule.length) await supabase.from('subject_schedule').insert(subject.schedule.map((item) => ({ subject_id: subjectId, weekday: item.weekday, sessions_per_day: item.sessionsPerDay }))) })()
      return subjectId
    },
    updateSubject: (subjectId, changes) => { setData((previous) => ({ ...previous, subjects: previous.subjects.map((subject) => subject.id === subjectId ? { ...subject, ...changes } : subject) })); if (supabase && userId) { const client = supabase; void (async () => { const current = data.subjects.find((item) => item.id === subjectId); if (!current) return; const next = { ...current, ...changes }; await client.from('subjects').update({ name: next.name, code: next.code ?? null, subject_type: next.subjectType, color: next.color, target_percentage: next.targetPercentage, is_archived: next.isArchived }).eq('id', subjectId); if (changes.schedule) { await client.from('subject_schedule').delete().eq('subject_id', subjectId); if (next.schedule.length) await client.from('subject_schedule').insert(next.schedule.map((item) => ({ subject_id: subjectId, weekday: item.weekday, sessions_per_day: item.sessionsPerDay }))) } })() } },
    upsertRecord: (subjectId, recordDate, sessionIndex, status) => setData((previous) => {
      const existing = previous.records.find((record) => record.subjectId === subjectId && record.recordDate === recordDate && record.sessionIndex === sessionIndex)
      const records = existing
        ? previous.records.map((record) => record.id === existing.id ? { ...record, status, updatedAt: isoNow() } : record)
        : [...previous.records, { id: id(), subjectId, recordDate, sessionIndex, status, createdAt: isoNow(), updatedAt: isoNow() }]
      if (supabase && userId) void supabase.from('attendance_records').upsert({ subject_id: subjectId, user_id: userId, record_date: recordDate, session_index: sessionIndex, status }, { onConflict: 'subject_id,record_date,session_index' })
      return { ...previous, records }
    }),
    removeRecord: (recordId) => { setData((previous) => ({ ...previous, records: previous.records.filter((record) => record.id !== recordId) })); if (supabase && userId) void supabase.from('attendance_records').delete().eq('id', recordId) },
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
