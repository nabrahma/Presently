/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { StoreProvider } from '../lib/store'
import { readOutbox } from '../lib/storage'

/*
  These cover the sync path against a stand-in Supabase, because the failures
  they guard only appear in the seam between an optimistic local write and the
  server confirming it.

  The shared state is declared through vi.hoisted so the mock factory — which
  is lifted above every import — can reach it.
*/
const h = vi.hoisted(() => {
  interface ServerRecord {
    id: string
    user_id: string
    subject_id: string
    record_date: string
    session_index: number
    status: string
    created_at: string
    updated_at: string
  }

  return {
    USER: { id: 'user-1', email: 'a@b.c' },
    server: {
      records: [] as ServerRecord[],
      subjects: [] as Record<string, unknown>[],
      schedules: [] as Record<string, unknown>[],
      profile: null as Record<string, unknown> | null,
      /** Makes every write fail, standing in for being offline. */
      writesFail: false,
      /** Fails the next request once with an expired-token error. */
      expireNextToken: false,
      /** Seconds until the access token expires, as reported by getSession. */
      expiresIn: 3600,
      refreshes: 0
    },
    auth: { callback: null as ((event: string, session: unknown) => void) | null }
  }
})

const { USER, server } = h

vi.mock('../lib/supabaseClient', async () => {
  const actual =
    await vi.importActual<typeof import('../lib/supabaseClient')>('../lib/supabaseClient')

  // Built per call so a test can age the token mid-run.
  const session = () => ({
    user: h.USER,
    expires_at: Math.floor(Date.now() / 1000) + h.server.expiresIn
  })

  const expired = { code: 'PGRST301', message: 'JWT expired' }
  const offline = { message: 'Failed to fetch' }

  const wrap = (value: unknown) => Promise.resolve({ data: value, error: null })

  const table = (name: string) => {
    let produced: unknown[] = []

    const rowsFor = () =>
      name === 'attendance_records'
        ? h.server.records
        : name === 'subjects'
          ? h.server.subjects
          : name === 'subject_schedule'
            ? h.server.schedules
            : []

    /** Applies a write, or returns the error a test has armed. */
    const guard = <T,>(apply: () => T): { data: T | null; error: unknown } => {
      if (h.server.expireNextToken) {
        h.server.expireNextToken = false
        return { data: null, error: expired }
      }
      if (h.server.writesFail) return { data: null, error: offline }
      return { data: apply(), error: null }
    }

    const applyUpsert = (rows: Record<string, unknown>[]) => {
      if (name === 'attendance_records') {
        produced = rows.map((entry) => {
          const key = `${entry.subject_id}|${entry.record_date}|${entry.session_index}`
          const existing = h.server.records.find(
            (item) => `${item.subject_id}|${item.record_date}|${item.session_index}` === key
          )
          if (existing) {
            existing.status = String(entry.status)
            return existing
          }
          const created = {
            id: `server-${key}`,
            user_id: String(entry.user_id),
            subject_id: String(entry.subject_id),
            record_date: String(entry.record_date),
            session_index: Number(entry.session_index),
            status: String(entry.status),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
          h.server.records.push(created)
          return created
        })
        return produced
      }

      if (name === 'subjects') {
        for (const entry of rows) {
          const index = h.server.subjects.findIndex((item) => item.id === entry.id)
          if (index >= 0) h.server.subjects[index] = entry
          else h.server.subjects.push(entry)
        }
      }
      if (name === 'subject_schedule') h.server.schedules.push(...rows)
      if (name === 'profiles') h.server.profile = rows[0]
      return []
    }

    const builder: Record<string, unknown> = {
      select: () => {
        const chain: Record<string, unknown> = {
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          maybeSingle: () => wrap(name === 'profiles' ? h.server.profile : null),
          then: (resolve: (value: unknown) => void) => resolve({ data: rowsFor(), error: null })
        }
        return chain
      },

      upsert: (payload: unknown) => {
        const rows = (Array.isArray(payload) ? payload : [payload]) as Record<string, unknown>[]
        const run = () => guard(() => applyUpsert(rows))

        return {
          select: () => ({
            then: (resolve: (value: unknown) => void) => resolve(run())
          }),
          then: (resolve: (value: unknown) => void) => resolve(run())
        }
      },

      update: () => ({ eq: () => Promise.resolve(guard(() => null)) }),
      delete: () => ({ eq: () => Promise.resolve(guard(() => null)) })
    }

    builder.insert = builder.upsert
    return builder
  }

  return {
    ...actual,
    isCloudEnabled: true,
    supabase: {
      from: (name: string) => table(name),
      auth: {
        getSession: () => wrap({ session: session() }),
        refreshSession: () => {
          h.server.refreshes += 1
          // A refresh restores a full lifetime, as the real endpoint does.
          h.server.expiresIn = 3600
          return wrap({ session: session() })
        },
        signOut: () => Promise.resolve({ error: null }),
        onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
          h.auth.callback = callback
          // The real client emits the initial session asynchronously.
          setTimeout(() => callback('INITIAL_SESSION', session()), 0)
          return { data: { subscription: { unsubscribe: () => undefined } } }
        }
      }
    }
  }
})

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => undefined],
    offlineReady: [false, () => undefined],
    updateServiceWorker: async () => undefined
  })
}))

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

function seedAccount() {
  window.localStorage.setItem(
    `presently:v3:data:${USER.id}`,
    JSON.stringify({
      profile: {
        id: USER.id,
        branch: 'CSE',
        semester: 5,
        defaultTargetPercentage: 75,
        onboarded: true
      },
      subjects: [
        {
          id: 'sub-1',
          name: 'Algorithms',
          code: 'CS201',
          subjectType: 'lecture',
          color: '#7fc99a',
          targetPercentage: 75,
          isArchived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          // Every weekday, so today always has a class to mark.
          schedule: EVERY_DAY.map((weekday) => ({ weekday, sessionsPerDay: 1 }))
        }
      ],
      records: []
    })
  )

  server.subjects = [
    {
      id: 'sub-1',
      user_id: USER.id,
      name: 'Algorithms',
      code: 'CS201',
      subject_type: 'lecture',
      color: '#7fc99a',
      target_percentage: 75,
      is_archived: false,
      created_at: '2026-01-01T00:00:00.000Z'
    }
  ]
  server.schedules = EVERY_DAY.map((weekday) => ({
    subject_id: 'sub-1',
    weekday,
    sessions_per_day: 1
  }))
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <StoreProvider>
        <App />
      </StoreProvider>
    </MemoryRouter>
  )
}

const cachedRecords = () =>
  JSON.parse(window.localStorage.getItem(`presently:v3:data:${USER.id}`) ?? '{}').records ?? []

beforeEach(() => {
  window.localStorage.clear()
  h.auth.callback = null
  server.records = []
  server.subjects = []
  server.schedules = []
  server.profile = {
    id: USER.id,
    branch: 'CSE',
    semester: 5,
    default_target_percentage: 75,
    full_name: null
  }
  server.writesFail = false
  server.expireNextToken = false
  server.expiresIn = 3600
  server.refreshes = 0
  seedAccount()
})

afterEach(cleanup)

describe('marking attendance', () => {
  it('reaches the server straight away', async () => {
    const user = userEvent.setup()
    mount()

    await screen.findByText('Overall')
    await user.click(screen.getAllByRole('button', { name: 'Present' })[0])

    await waitFor(() => expect(server.records).toHaveLength(1))
    expect(server.records[0].status).toBe('present')
  })

  it('adopts the id the server assigned', async () => {
    const user = userEvent.setup()
    mount()

    await screen.findByText('Overall')
    await user.click(screen.getAllByRole('button', { name: 'Present' })[0])

    // Without reconciliation the local id stays provisional, and a later
    // delete silently misses on the server.
    await waitFor(() => expect(cachedRecords()[0]?.id).toBe(server.records[0].id))
  })

  it('clears the queue once the server confirms', async () => {
    const user = userEvent.setup()
    mount()

    await screen.findByText('Overall')
    await user.click(screen.getAllByRole('button', { name: 'Present' })[0])

    await waitFor(() => expect(readOutbox(USER.id).records).toHaveLength(0))
    expect(server.records).toHaveLength(1)
  })
})

describe('a mark that never reached the server', () => {
  it('is queued and persisted before any response arrives', async () => {
    server.writesFail = true
    const user = userEvent.setup()
    mount()

    await screen.findByText('Overall')
    await user.click(screen.getAllByRole('button', { name: 'Present' })[0])

    // Written synchronously, so closing the app right here cannot lose it.
    await waitFor(() => expect(readOutbox(USER.id).records.length).toBeGreaterThan(0))
    expect(cachedRecords()).toHaveLength(1)
  })

  it('survives a reopen instead of being erased by the fetch', async () => {
    server.writesFail = true
    const user = userEvent.setup()
    mount()

    await screen.findByText('Overall')
    await user.click(screen.getAllByRole('button', { name: 'Present' })[0])
    await waitFor(() => expect(readOutbox(USER.id).records.length).toBeGreaterThan(0))

    // Reopen. The server still knows nothing about the mark, so a load that
    // ignored the queue would overwrite it with an empty set.
    cleanup()
    expect(server.records).toHaveLength(0)
    server.writesFail = false

    mount()
    await screen.findByText('Overall')

    await waitFor(() => expect(server.records).toHaveLength(1))
    expect(server.records[0].status).toBe('present')

    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Present' })[0].getAttribute('aria-pressed')
      ).toBe('true')
    )
  })

  it('is not overwritten by a refresh while it is still queued', async () => {
    server.writesFail = true
    const user = userEvent.setup()
    mount()

    await screen.findByText('Overall')
    await user.click(screen.getAllByRole('button', { name: 'Absent' })[0])
    await waitFor(() => expect(readOutbox(USER.id).records.length).toBeGreaterThan(0))

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })

    expect(screen.getAllByRole('button', { name: 'Absent' })[0].getAttribute('aria-pressed')).toBe(
      'true'
    )
  })
})

describe('an expired token', () => {
  it('is retried rather than reported when a write is rejected', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByText('Overall')

    server.expireNextToken = true
    await user.click(screen.getAllByRole('button', { name: 'Present' })[0])

    await waitFor(() => expect(server.records).toHaveLength(1))
    // Recoverable and recovered, so nothing is said to the user.
    expect(screen.queryByText(/did not sync/i)).toBeNull()
  })

  it('is refreshed on launch when it aged out while the app was closed', async () => {
    // Ten seconds of life left is inside the headroom, as an app reopened
    // after a long gap would find.
    server.expiresIn = 10
    mount()

    await screen.findByText('Overall')
    await waitFor(() => expect(server.refreshes).toBeGreaterThan(0))
    expect(screen.queryByText(/could not refresh/i)).toBeNull()
  })

  it('leaves the mark queued when the retry also fails', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByText('Overall')

    server.writesFail = true
    await user.click(screen.getAllByRole('button', { name: 'Present' })[0])

    await waitFor(() => expect(readOutbox(USER.id).records.length).toBeGreaterThan(0))
  })
})

describe('session events', () => {
  it('does not reload the account for a token refresh alone', async () => {
    mount()
    await screen.findByText('Overall')

    await act(async () => {
      h.auth.callback?.('TOKEN_REFRESHED', { user: USER })
      await Promise.resolve()
    })

    expect(screen.getByText('Overall')).toBeTruthy()
  })
})
