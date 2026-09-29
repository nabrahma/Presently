import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toast } from 'sonner'
import type {
  AppData,
  AttendanceRecord,
  AttendanceStatus,
  Profile,
  ScheduleItem,
  Subject
} from '../types'
import { MAX_SEMESTER, MAX_TARGET, MIN_SEMESTER, MIN_TARGET } from '../types'
import {
  describeError,
  ensureFreshSession,
  isCloudEnabled,
  isTokenFault,
  supabase,
  tokenFault,
  withValidToken
} from './supabaseClient'
import {
  EMPTY_DATA,
  EMPTY_OUTBOX,
  GUEST_ACCOUNT,
  clearAccount,
  createId,
  outboxSize,
  readData,
  readMode,
  readOutbox,
  writeData,
  writeMode,
  writeOutbox,
  type Outbox
} from './storage'
import { demoData } from './demoData'

type SubjectInput = Omit<Subject, 'id' | 'createdAt'>

export interface RecordInput {
  subjectId: string
  recordDate: string
  sessionIndex: number
  status: AttendanceStatus
}

interface Store extends AppData {
  /** False until it is known whether this device has an account and its data. */
  hydrated: boolean
  account: string
  userId: string | null
  email: string | null
  isDemo: boolean
  cloud: boolean
  online: boolean
  syncing: boolean
  pendingCount: number
  saveProfile: (profile: Omit<Profile, 'id' | 'onboarded'> & { onboarded?: boolean }) => Promise<void>
  addSubject: (subject: SubjectInput) => Promise<string>
  updateSubject: (id: string, changes: Partial<SubjectInput>) => Promise<void>
  deleteSubject: (id: string) => Promise<void>
  setRecords: (entries: RecordInput[]) => Promise<void>
  removeRecord: (id: string) => Promise<void>
  clearAllData: () => Promise<void>
  signOut: () => Promise<void>
  startDemo: () => void
  refresh: () => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

const nowIso = () => new Date().toISOString()

const clamp = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback

const recordKey = (subjectId: string, recordDate: string, sessionIndex: number) =>
  `${subjectId}|${recordDate}|${sessionIndex}`

/**
 * How long to wait before trying again after the database called a token
 * early. The gap is its clock lagging the auth server's, and it closes as the
 * token ages, so a single later attempt is all it takes.
 */
const EARLY_TOKEN_RETRY_MS = 15_000

/* -------------------------------------------------------------------------- */
/* Row mapping                                                                 */
/* -------------------------------------------------------------------------- */

type Row = Record<string, unknown>

function toSubject(row: Row, scheduleRows: Row[]): Subject {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    code: row.code ? String(row.code) : undefined,
    subjectType: (row.subject_type as Subject['subjectType']) ?? 'lecture',
    color: String(row.color ?? '#6f6f77'),
    targetPercentage: clamp(Number(row.target_percentage), MIN_TARGET, MAX_TARGET, 75),
    isArchived: Boolean(row.is_archived),
    createdAt: String(row.created_at ?? nowIso()),
    schedule: scheduleRows
      .filter((schedule) => schedule.subject_id === row.id)
      .map((schedule) => ({
        weekday: Number(schedule.weekday),
        sessionsPerDay: Number(schedule.sessions_per_day)
      }))
      .sort((a, b) => a.weekday - b.weekday)
  }
}

function toRecord(row: Row): AttendanceRecord {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    recordDate: String(row.record_date),
    sessionIndex: Number(row.session_index),
    status: row.status as AttendanceStatus,
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso())
  }
}

function toProfile(row: Row): Profile {
  return {
    id: String(row.id),
    fullName: row.full_name ? String(row.full_name) : undefined,
    branch: row.branch ? String(row.branch) : 'CSE',
    semester: clamp(Number(row.semester), MIN_SEMESTER, MAX_SEMESTER, 1),
    defaultTargetPercentage: clamp(Number(row.default_target_percentage), MIN_TARGET, MAX_TARGET, 75),
    // A row created by the signup trigger has neither field set.
    onboarded: row.branch !== null && row.semester !== null
  }
}

const subjectPayload = (subject: Subject, userId: string) => ({
  id: subject.id,
  user_id: userId,
  name: subject.name,
  code: subject.code ?? null,
  subject_type: subject.subjectType,
  color: subject.color,
  target_percentage: subject.targetPercentage,
  is_archived: subject.isArchived,
  created_at: subject.createdAt
})

const schedulePayload = (subjectId: string, schedule: ScheduleItem[]) =>
  schedule.map((item) => ({
    subject_id: subjectId,
    weekday: item.weekday,
    sessions_per_day: item.sessionsPerDay
  }))

/* -------------------------------------------------------------------------- */
/* Outbox helpers                                                              */
/* -------------------------------------------------------------------------- */

const without = (list: string[], id: string) => list.filter((item) => item !== id)
const withId = (list: string[], id: string) => (list.includes(id) ? list : [...list, id])

/* -------------------------------------------------------------------------- */
/* Provider                                                                    */
/* -------------------------------------------------------------------------- */

export function StoreProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string>(GUEST_ACCOUNT)
  const [data, setData] = useState<AppData>(EMPTY_DATA)
  const [hydrated, setHydrated] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [isDemo, setIsDemo] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [outbox, setOutbox] = useState<Outbox>(EMPTY_OUTBOX)
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  )

  /*
    The refs are the source of truth, not a mirror of state.

    Async work reads them immediately after a mutation, long before React has
    committed a render. Updating them from an effect meant that signing in and
    loading in the same tick saw a null user id and an empty queue, so pending
    work was never replayed and the fetch that followed erased it.
  */
  const dataRef = useRef(data)
  const outboxRef = useRef(outbox)
  const accountRef = useRef(account)
  const userIdRef = useRef(userId)
  const persistRef = useRef(false)

  /**
   * Commits a value to the ref, to React, and to disk in one step.
   *
   * Persisting here rather than in an effect matters: marking a class and
   * immediately swiping the app away used to kill the process before the
   * effect ran, losing the very write it was meant to save.
   */
  const commitData = useCallback((next: AppData | ((previous: AppData) => AppData)) => {
    const value = typeof next === 'function' ? next(dataRef.current) : next
    dataRef.current = value
    setData(value)
    if (persistRef.current) writeData(accountRef.current, value)
  }, [])

  const commitOutbox = useCallback((next: Outbox | ((previous: Outbox) => Outbox)) => {
    const value = typeof next === 'function' ? next(outboxRef.current) : next
    outboxRef.current = value
    setOutbox(value)
    if (persistRef.current) writeOutbox(accountRef.current, value)
  }, [])

  const commitAccount = useCallback((next: string, uid: string | null, canPersist: boolean) => {
    accountRef.current = next
    userIdRef.current = uid
    persistRef.current = canPersist
    setAccount(next)
    setUserId(uid)
  }, [])

  const markDirty = commitOutbox

  /* --- background retry -------------------------------------------------- */

  /*
    A token the database called early cannot be fixed by the client, only
    waited out. Rather than leave the work until the next resume or reconnect,
    one retry is scheduled. `load` also covers everything `flush` does.
  */
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryKindRef = useRef<'flush' | 'load'>('flush')
  const retryRef = useRef<(kind: 'flush' | 'load') => void>(() => undefined)

  const cancelRetry = useCallback(() => {
    if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
    retryTimerRef.current = null
    retryKindRef.current = 'flush'
  }, [])

  const scheduleRetry = useCallback((kind: 'flush' | 'load') => {
    if (kind === 'load') retryKindRef.current = 'load'
    if (retryTimerRef.current !== null) return

    const uid = userIdRef.current
    retryTimerRef.current = setTimeout(() => {
      const pending = retryKindRef.current
      retryTimerRef.current = null
      retryKindRef.current = 'flush'
      // Signed out or switched accounts while waiting: nothing left to do.
      if (uid && uid === userIdRef.current) retryRef.current(pending)
    }, EARLY_TOKEN_RETRY_MS)
  }, [])

  useEffect(() => cancelRetry, [cancelRetry])

  /* --- remote writes ----------------------------------------------------- */

  /**
   * Every remote write funnels through here.
   *
   * The caller has already queued the entity before calling, so a failure
   * simply leaves it queued; success is what removes it. An expired token is
   * refreshed and the write retried once, because a phone waking from sleep
   * hitting a dead token is routine rather than a fault.
   */
  const attempt = useCallback(
    async (
      // Supabase query builders are thenable rather than real promises.
      run: (client: SupabaseClient, uid: string) => PromiseLike<{ error: unknown }>,
      description: string
    ): Promise<boolean> => {
      const client = supabase
      const uid = userIdRef.current
      if (!client || !uid) return true // guest and demo modes are local by design

      try {
        const { error } = await withValidToken(client, () => run(client, uid))
        if (error) throw error
        return true
      } catch (error) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          // Offline is expected, not an error worth interrupting anyone for.
          return false
        }
        // Recoverable: it stays queued and the retry will come.
        if (tokenFault(error) === 'early') scheduleRetry('flush')
        if (isTokenFault(error)) return false
        toast.error(`${description} did not sync`, { description: describeError(error) })
        return false
      }
    },
    [scheduleRetry]
  )

  const pushSubject = useCallback(
    async (subject: Subject) => {
      // Queued before the request leaves, so a process killed mid-flight still
      // has a record of the intent.
      markDirty((previous) => ({ ...previous, subjects: withId(previous.subjects, subject.id) }))

      const ok = await attempt(async (client, uid) => {
        const upsert = await client.from('subjects').upsert(subjectPayload(subject, uid))
        if (upsert.error) return upsert

        const cleared = await client.from('subject_schedule').delete().eq('subject_id', subject.id)
        if (cleared.error) return cleared

        if (subject.schedule.length === 0) return { error: null }
        return client.from('subject_schedule').insert(schedulePayload(subject.id, subject.schedule))
      }, subject.name)

      if (ok) {
        markDirty((previous) => ({ ...previous, subjects: without(previous.subjects, subject.id) }))
      }
    },
    [attempt, markDirty]
  )

  /**
   * Ids are assigned by the database. The optimistic local id is provisional
   * until the server answers, at which point the two are reconciled — without
   * that step, deleting a freshly created record would silently miss.
   */
  const pushRecords = useCallback(
    async (records: AttendanceRecord[]) => {
      if (records.length === 0) return

      const client = supabase
      const uid = userIdRef.current

      // Queued first and unconditionally. In guest mode there is nothing to
      // send, but for an account this is what survives the app being closed
      // the instant after a class is marked.
      if (client && uid) {
        markDirty((previous) => ({
          ...previous,
          records: records.reduce((list, record) => withId(list, record.id), previous.records)
        }))
      }
      if (!client || !uid) return

      const send = () =>
        client
          .from('attendance_records')
          .upsert(
            records.map((record) => ({
              user_id: uid,
              subject_id: record.subjectId,
              record_date: record.recordDate,
              session_index: record.sessionIndex,
              status: record.status,
              updated_at: nowIso()
            })),
            { onConflict: 'subject_id,record_date,session_index' }
          )
          .select('id, subject_id, record_date, session_index')

      try {
        // A token that aged out while the app was closed, or that the database
        // thinks was issued in its future, is recovered and the write repeated
        // rather than surfaced as a failure.
        const response = await withValidToken(client, send)
        if (response.error) throw response.error

        const serverIds = new Map<string, string>()
        for (const row of (response.data ?? []) as Row[]) {
          serverIds.set(
            recordKey(String(row.subject_id), String(row.record_date), Number(row.session_index)),
            String(row.id)
          )
        }

        if (serverIds.size > 0) {
          commitData((previous) => ({
            ...previous,
            records: previous.records.map((record) => {
              const serverId = serverIds.get(
                recordKey(record.subjectId, record.recordDate, record.sessionIndex)
              )
              return serverId && serverId !== record.id ? { ...record, id: serverId } : record
            })
          }))
        }

        // Confirmed on the server, so it no longer needs replaying. Matched on
        // the natural key because the local id may have just been reconciled.
        const settled = new Set(
          records.map((record) => recordKey(record.subjectId, record.recordDate, record.sessionIndex))
        )
        markDirty((previous) => ({
          ...previous,
          records: previous.records.filter((id) => {
            const record = dataRef.current.records.find((item) => item.id === id)
            if (!record) return !records.some((sent) => sent.id === id)
            return !settled.has(recordKey(record.subjectId, record.recordDate, record.sessionIndex))
          })
        }))
      } catch (error) {
        if (tokenFault(error) === 'early') scheduleRetry('flush')
        if (isTokenFault(error)) return // stays queued for the next flush
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          toast.error('Attendance did not sync', { description: describeError(error) })
        }
      }
    },
    [markDirty, scheduleRetry]
  )

  /* --- flush ------------------------------------------------------------- */

  /**
   * Replays outstanding work. Entries are references, so this always sends the
   * entity's current shape and never an outdated snapshot.
   */
  const flush = useCallback(async (): Promise<void> => {
    const client = supabase
    const uid = userIdRef.current
    const pending = outboxRef.current
    if (!client || !uid || outboxSize(pending) === 0) return

    // One refresh up front rather than an expiry failure on each entry below.
    await ensureFreshSession(client)

    const current = dataRef.current

    /** True when the request went through; an early token also books a retry. */
    const sent = (error: unknown) => {
      if (tokenFault(error) === 'early') scheduleRetry('flush')
      return !error
    }

    for (const id of pending.deletedRecords) {
      const { error } = await withValidToken(client, () =>
        client.from('attendance_records').delete().eq('id', id)
      )
      if (!sent(error)) return
      markDirty((previous) => ({ ...previous, deletedRecords: without(previous.deletedRecords, id) }))
    }

    for (const id of pending.deletedSubjects) {
      const { error } = await withValidToken(client, () =>
        client.from('subjects').delete().eq('id', id)
      )
      if (!sent(error)) return
      markDirty((previous) => ({ ...previous, deletedSubjects: without(previous.deletedSubjects, id) }))
    }

    if (pending.profile && current.profile) {
      const profile = current.profile
      const { error } = await withValidToken(client, () => pushProfileRemote(client, uid, profile))
      if (sent(error)) markDirty((previous) => ({ ...previous, profile: false }))
    }

    for (const id of pending.subjects) {
      const subject = current.subjects.find((item) => item.id === id)
      if (!subject) {
        markDirty((previous) => ({ ...previous, subjects: without(previous.subjects, id) }))
        continue
      }
      await pushSubject(subject)
    }

    const records = pending.records
      .map((id) => current.records.find((record) => record.id === id))
      .filter((record): record is AttendanceRecord => Boolean(record))

    if (records.length > 0) await pushRecords(records)
  }, [markDirty, pushRecords, pushSubject, scheduleRetry])

  /* --- load -------------------------------------------------------------- */

  const loadAccount = useCallback(
    async (uid: string): Promise<void> => {
      const client = supabase
      if (!client) return

      setSyncing(true)
      let waitingOnToken = false
      try {
        // An app reopened after a long gap starts with a dead access token.
        // Refreshing before any query is what stops the JWT error on launch.
        await ensureFreshSession(client)

        // Unsent work goes first, so a fetch can never overwrite it.
        await flush()

        // Read as one unit, so a refused token is recovered once for all three
        // rather than three times over.
        const fetched = await withValidToken(client, async () => {
          const [profileResult, subjectsResult, recordsResult] = await Promise.all([
            client.from('profiles').select('*').eq('id', uid).maybeSingle(),
            client.from('subjects').select('*').eq('user_id', uid).order('created_at'),
            client.from('attendance_records').select('*').eq('user_id', uid)
          ])
          return {
            profileResult,
            subjectsResult,
            recordsResult,
            error: profileResult.error ?? subjectsResult.error ?? recordsResult.error
          }
        })
        if (fetched.error) throw fetched.error
        const { profileResult, subjectsResult, recordsResult } = fetched

        const subjectRows = (subjectsResult.data ?? []) as Row[]
        const subjectIds = subjectRows.map((row) => String(row.id))

        let scheduleRows: Row[] = []
        if (subjectIds.length > 0) {
          const schedules = await withValidToken(client, () =>
            client.from('subject_schedule').select('*').in('subject_id', subjectIds)
          )
          if (schedules.error) throw schedules.error
          scheduleRows = (schedules.data ?? []) as Row[]
        }

        const remote: AppData = {
          profile: profileResult.data ? toProfile(profileResult.data as Row) : null,
          subjects: subjectRows.map((row) => toSubject(row, scheduleRows)),
          records: ((recordsResult.data ?? []) as Row[]).map(toRecord)
        }

        // Anything still queued failed to send; keep the local version visible
        // rather than appearing to discard the user's edit.
        const stillPending = outboxRef.current
        const local = dataRef.current

        if (stillPending.subjects.length > 0) {
          const pendingSubjects = local.subjects.filter((subject) =>
            stillPending.subjects.includes(subject.id)
          )
          const ids = new Set(pendingSubjects.map((subject) => subject.id))
          remote.subjects = [...remote.subjects.filter((subject) => !ids.has(subject.id)), ...pendingSubjects]
        }

        if (stillPending.records.length > 0) {
          const pendingRecords = local.records.filter((record) => stillPending.records.includes(record.id))
          const keys = new Set(
            pendingRecords.map((record) => recordKey(record.subjectId, record.recordDate, record.sessionIndex))
          )
          remote.records = [
            ...remote.records.filter(
              (record) => !keys.has(recordKey(record.subjectId, record.recordDate, record.sessionIndex))
            ),
            ...pendingRecords
          ]
        }

        if (stillPending.profile && local.profile) remote.profile = local.profile

        if (stillPending.deletedSubjects.length > 0) {
          remote.subjects = remote.subjects.filter(
            (subject) => !stillPending.deletedSubjects.includes(subject.id)
          )
        }
        if (stillPending.deletedRecords.length > 0) {
          remote.records = remote.records.filter(
            (record) => !stillPending.deletedRecords.includes(record.id)
          )
        }

        commitData(remote)
      } catch (error) {
        if (tokenFault(error) === 'early') {
          waitingOnToken = true
          scheduleRetry('load')
        }
        if (typeof navigator !== 'undefined' && navigator.onLine && !isTokenFault(error)) {
          toast.error('Could not refresh your attendance', { description: describeError(error) })
        }
      } finally {
        setSyncing(false)
        // A device with nothing cached keeps its loading state while the retry
        // is pending. Showing an empty account instead is what sends someone
        // who just signed in on a new phone back through onboarding, where
        // they recreate subjects they already have.
        if (!waitingOnToken || dataRef.current.profile) setHydrated(true)
      }
    },
    [commitData, flush, scheduleRetry]
  )

  useEffect(() => {
    retryRef.current = (kind) => {
      const uid = userIdRef.current
      if (!uid) return
      void (kind === 'load' ? loadAccount(uid) : flush())
    }
  }, [flush, loadAccount])

  /* --- session ----------------------------------------------------------- */

  useEffect(() => {
    if (!supabase) {
      // Without credentials the app is a purely local tool.
      commitAccount(GUEST_ACCOUNT, null, true)
      commitData(readData(GUEST_ACCOUNT))
      setIsDemo(readMode() === 'demo')
      setHydrated(true)
      return
    }

    const client = supabase
    let cancelled = false

    const enterGuest = () => {
      if (cancelled) return
      cancelRetry()
      const demo = readMode() === 'demo'
      commitAccount(GUEST_ACCOUNT, null, demo)
      setEmail(null)
      setIsDemo(demo)
      commitData(demo ? readData(GUEST_ACCOUNT) : EMPTY_DATA)
      commitOutbox(EMPTY_OUTBOX)
      setHydrated(true)
    }

    const enterAccount = (uid: string, userEmail: string | null) => {
      if (cancelled) return
      const cached = readData(uid)

      // Signing in ends any demo session; real data must never mix with it.
      writeMode(null)
      setIsDemo(false)
      setEmail(userEmail)

      // Account, data and queue are all committed synchronously before the
      // load starts. Setting these through React alone left the load reading a
      // null user and an empty queue, so it skipped the replay and then wrote
      // the server's answer straight over the unsent marks.
      commitAccount(uid, uid, true)
      commitData(cached)
      commitOutbox(readOutbox(uid))

      // A device with no cache has nothing trustworthy to show, so the app
      // keeps its loading state until the first fetch resolves. Showing an
      // empty account here is what used to push returning users back through
      // onboarding and duplicate their subjects.
      if (cached.profile) setHydrated(true)

      void loadAccount(uid)
    }

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      const sessionUser = session?.user

      if (event === 'TOKEN_REFRESHED') return // nothing about the data changed
      if (event === 'SIGNED_OUT' || !sessionUser) {
        enterGuest()
        return
      }
      if (event === 'USER_UPDATED') {
        setEmail(sessionUser.email ?? null)
        return
      }
      if (sessionUser.id === userIdRef.current) return

      enterAccount(sessionUser.id, sessionUser.email ?? null)
    })

    // onAuthStateChange fires INITIAL_SESSION, but a network stall would
    // otherwise leave the app on its loading screen indefinitely.
    void client.auth.getSession().then(({ data: result }) => {
      if (cancelled || result.session) return
      enterGuest()
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [cancelRetry, commitAccount, commitData, commitOutbox, loadAccount])

  /* --- connectivity ------------------------------------------------------ */

  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      void flush()
    }
    const goOffline = () => setOnline(false)

    /**
     * Reopening an installed app fires this rather than a fresh load, so it is
     * the moment to refresh a token that died while the app was away and to
     * replay anything the previous session could not finish.
     */
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return

      const uid = userIdRef.current
      if (!uid || !supabase) return

      void (async () => {
        await ensureFreshSession(supabase)
        await flush()
      })()
    }

    /*
      The last chance to persist before the process is frozen or killed.
      Commits are already synchronous, so this only has to catch a queue that
      changed during an in-flight request.
    */
    const persistNow = () => {
      if (!persistRef.current) return
      writeData(accountRef.current, dataRef.current)
      writeOutbox(accountRef.current, outboxRef.current)
    }

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    window.addEventListener('pagehide', persistNow)
    document.addEventListener('visibilitychange', onVisible)
    document.addEventListener('visibilitychange', persistNow)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('pagehide', persistNow)
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('visibilitychange', persistNow)
    }
  }, [flush])

  /* --- mutations --------------------------------------------------------- */

  const saveProfile = useCallback<Store['saveProfile']>(
    async (input) => {
      const uid = userIdRef.current
      const next: Profile = {
        id: uid ?? dataRef.current.profile?.id ?? createId(),
        fullName: input.fullName,
        branch: input.branch,
        semester: clamp(input.semester, MIN_SEMESTER, MAX_SEMESTER, 1),
        defaultTargetPercentage: clamp(input.defaultTargetPercentage, MIN_TARGET, MAX_TARGET, 75),
        onboarded: input.onboarded ?? true
      }

      commitData((previous) => ({ ...previous, profile: next }))

      const client = supabase
      if (!client || !uid) return

      // Queued before sending, cleared only once the server has it.
      markDirty((previous) => ({ ...previous, profile: true }))

      const ok = await attempt(
        (activeClient, activeUid) => pushProfileRemote(activeClient, activeUid, next),
        'Preferences'
      )

      if (ok) markDirty((previous) => ({ ...previous, profile: false }))
    },
    [attempt, markDirty]
  )

  const addSubject = useCallback<Store['addSubject']>(
    async (input) => {
      const subject: Subject = { ...input, id: createId(), createdAt: nowIso() }
      commitData((previous) => ({ ...previous, subjects: [...previous.subjects, subject] }))
      await pushSubject(subject)
      return subject.id
    },
    [pushSubject]
  )

  const updateSubject = useCallback<Store['updateSubject']>(
    async (id, changes) => {
      const existing = dataRef.current.subjects.find((subject) => subject.id === id)
      if (!existing) return

      const next: Subject = { ...existing, ...changes }
      commitData((previous) => ({
        ...previous,
        subjects: previous.subjects.map((subject) => (subject.id === id ? next : subject))
      }))
      await pushSubject(next)
    },
    [pushSubject]
  )

  const deleteSubject = useCallback<Store['deleteSubject']>(
    async (id) => {
      commitData((previous) => ({
        ...previous,
        subjects: previous.subjects.filter((subject) => subject.id !== id),
        // Records go too: the database cascades, and leaving them locally would
        // keep them in the overall percentage until the next refresh.
        records: previous.records.filter((record) => record.subjectId !== id)
      }))

      // The upsert queue no longer applies; the deletion takes its place.
      markDirty((previous) => ({
        ...previous,
        subjects: without(previous.subjects, id),
        deletedSubjects: withId(previous.deletedSubjects, id)
      }))

      const ok = await attempt(
        (client) => client.from('subjects').delete().eq('id', id),
        'Deleting the subject'
      )

      if (ok) {
        markDirty((previous) => ({ ...previous, deletedSubjects: without(previous.deletedSubjects, id) }))
      }
    },
    [attempt, markDirty]
  )

  const setRecords = useCallback<Store['setRecords']>(
    async (entries) => {
      if (entries.length === 0) return

      const touched: AttendanceRecord[] = []

      commitData((previous) => {
        const records = [...previous.records]
        const timestamp = nowIso()

        for (const entry of entries) {
          const index = records.findIndex(
            (record) =>
              record.subjectId === entry.subjectId &&
              record.recordDate === entry.recordDate &&
              record.sessionIndex === entry.sessionIndex
          )

          if (index >= 0) {
            // Re-tapping the current status is a no-op rather than a write.
            if (records[index].status === entry.status) {
              touched.push(records[index])
              continue
            }
            records[index] = { ...records[index], status: entry.status, updatedAt: timestamp }
            touched.push(records[index])
          } else {
            const created: AttendanceRecord = {
              id: createId(),
              subjectId: entry.subjectId,
              recordDate: entry.recordDate,
              sessionIndex: entry.sessionIndex,
              status: entry.status,
              createdAt: timestamp,
              updatedAt: timestamp
            }
            records.push(created)
            touched.push(created)
          }
        }

        return { ...previous, records }
      })

      await pushRecords(touched)
    },
    [pushRecords]
  )

  const removeRecord = useCallback<Store['removeRecord']>(
    async (id) => {
      commitData((previous) => ({
        ...previous,
        records: previous.records.filter((record) => record.id !== id)
      }))

      // The upsert queue no longer applies; the deletion takes its place.
      markDirty((previous) => ({
        ...previous,
        records: without(previous.records, id),
        deletedRecords: withId(previous.deletedRecords, id)
      }))

      const ok = await attempt(
        (client) => client.from('attendance_records').delete().eq('id', id),
        'Removing the record'
      )

      if (ok) {
        markDirty((previous) => ({ ...previous, deletedRecords: without(previous.deletedRecords, id) }))
      }
    },
    [attempt, markDirty]
  )

  const clearAllData = useCallback<Store['clearAllData']>(async () => {
    const uid = userIdRef.current
    const client = supabase

    if (client && uid) {
      await ensureFreshSession(client)

      // Subjects cascade to schedules and records; the profile is reset rather
      // than deleted so the account keeps working.
      const removal = await withValidToken(client, () =>
        client.from('subjects').delete().eq('user_id', uid)
      )
      const leftovers = await withValidToken(client, () =>
        client.from('attendance_records').delete().eq('user_id', uid)
      )
      const reset = await withValidToken(client, () =>
        client
          .from('profiles')
          .update({ branch: null, semester: null, default_target_percentage: 75 })
          .eq('id', uid)
      )

      const failure = removal.error ?? leftovers.error ?? reset.error
      if (failure) {
        toast.error('Could not delete everything', { description: describeError(failure) })
        return
      }
    }

    clearAccount(accountRef.current)
    writeMode(null)
    setIsDemo(false)
    commitOutbox(EMPTY_OUTBOX)
    commitData(EMPTY_DATA)
  }, [commitData, commitOutbox])

  const signOut = useCallback<Store['signOut']>(async () => {
    const previousAccount = accountRef.current
    cancelRetry()

    if (supabase) {
      try {
        // A local scope still clears this device when the network is down.
        const { error } = await supabase.auth.signOut()
        if (error) await supabase.auth.signOut({ scope: 'local' })
      } catch {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
      }
    }

    // Cached attendance is cleared on an explicit sign-out so the next person
    // to open the app on a shared device sees nothing.
    clearAccount(previousAccount)
    writeMode(null)

    setEmail(null)
    setIsDemo(false)
    // Persistence off: a signed-out device should leave nothing behind.
    commitAccount(GUEST_ACCOUNT, null, false)
    commitData(EMPTY_DATA)
    commitOutbox(EMPTY_OUTBOX)
    setHydrated(true)
  }, [cancelRetry, commitAccount, commitData, commitOutbox])

  const startDemo = useCallback<Store['startDemo']>(() => {
    writeMode('demo')
    setIsDemo(true)
    commitAccount(GUEST_ACCOUNT, null, true)
    commitData(demoData())
    commitOutbox(EMPTY_OUTBOX)
    setHydrated(true)
  }, [commitAccount, commitData, commitOutbox])

  const refresh = useCallback<Store['refresh']>(async () => {
    const uid = userIdRef.current
    if (!uid) return
    await loadAccount(uid)
  }, [loadAccount])

  const value = useMemo<Store>(
    () => ({
      ...data,
      hydrated,
      account,
      userId,
      email,
      isDemo,
      cloud: isCloudEnabled,
      online,
      syncing,
      pendingCount: outboxSize(outbox),
      saveProfile,
      addSubject,
      updateSubject,
      deleteSubject,
      setRecords,
      removeRecord,
      clearAllData,
      signOut,
      startDemo,
      refresh
    }),
    [
      account,
      addSubject,
      clearAllData,
      data,
      deleteSubject,
      email,
      hydrated,
      isDemo,
      online,
      outbox,
      refresh,
      removeRecord,
      saveProfile,
      setRecords,
      signOut,
      startDemo,
      syncing,
      updateSubject,
      userId
    ]
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

async function pushProfileRemote(client: SupabaseClient, uid: string, profile: Profile) {
  return client.from('profiles').upsert({
    id: uid,
    full_name: profile.fullName ?? null,
    branch: profile.branch,
    semester: profile.semester,
    default_target_percentage: profile.defaultTargetPercentage
  })
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used within a StoreProvider')
  return store
}
