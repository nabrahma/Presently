/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { StoreProvider } from '../lib/store'
import { todayKey } from '../lib/date'

// These tests run the app with no Supabase credentials, which is the
// local-only mode a contributor gets after a plain `npm install`.
vi.mock('../lib/supabaseClient', () => ({
  supabase: null,
  isCloudEnabled: false,
  describeError: (error: unknown) => String(error)
}))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => undefined],
    offlineReady: [false, () => undefined],
    updateServiceWorker: async () => undefined
  })
}))

function mount(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <StoreProvider>
        <App />
      </StoreProvider>
    </MemoryRouter>
  )
}

/** Anchors on a fixed string rather than the date, which changes daily. */
const onTodayScreen = () => screen.findByText('Least spare')

/** Runs setup and leaves the app on the daily check-in. */
async function completeSetup(withSubject: boolean) {
  const user = userEvent.setup()
  mount('/onboarding')

  await user.click(await screen.findByRole('button', { name: /continue/i }))

  if (withSubject) {
    await user.type(screen.getByLabelText(/subject name/i), 'Algorithms')
    // Every weekday, so the check-in always has something to show today.
    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      await user.click(screen.getByRole('button', { name: day }))
    }
    await user.click(screen.getByRole('button', { name: /add to list/i }))
  }

  await user.click(await screen.findByRole('button', { name: withSubject ? /finish/i : /skip/i }))
  await onTodayScreen()

  return user
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(cleanup)

describe('first run', () => {
  it('sends a brand new visitor into setup rather than a blank dashboard', async () => {
    mount('/')
    expect(await screen.findByRole('heading', { name: /about your term/i })).toBeTruthy()
  })

  it('completes setup and lands on the daily check-in', async () => {
    await completeSetup(true)
    // Rendered uppercase by CSS, so the underlying text is unchanged.
    expect(screen.getByText('Algorithms')).toBeTruthy()
  })
})

describe('daily check-in', () => {
  it('records a class and reflects it in the subject standing', async () => {
    const user = await completeSetup(true)

    const present = screen.getAllByRole('button', { name: 'Present' })[0]
    await user.click(present)

    // The gauge and the readout both show the figure, so more than one match
    // is expected here.
    await waitFor(() => expect(screen.getAllByText('100').length).toBeGreaterThan(0))
    expect(present.getAttribute('aria-pressed')).toBe('true')
  })

  it('replaces a status instead of adding a second record', async () => {
    const user = await completeSetup(true)

    await user.click(screen.getAllByRole('button', { name: 'Present' })[0])
    await user.click(screen.getAllByRole('button', { name: 'Absent' })[0])

    // A second record rather than a replacement would read 1/2, not 0/1.
    await user.click(screen.getByRole('link', { name: /subjects/i }))
    expect(await screen.findByText('0/1')).toBeTruthy()
  })
})

describe('subject validation', () => {
  it('refuses a name that is only whitespace', async () => {
    const user = userEvent.setup()
    mount('/onboarding')

    await user.click(await screen.findByRole('button', { name: /continue/i }))
    await user.type(screen.getByLabelText(/subject name/i), '   ')
    await user.click(screen.getByRole('button', { name: /add to list/i }))

    expect(await screen.findByText(/give the subject a name/i)).toBeTruthy()
  })

  it('refuses a target outside 1 to 100', async () => {
    const user = userEvent.setup()
    mount('/onboarding')

    await user.click(await screen.findByRole('button', { name: /continue/i }))
    await user.type(screen.getByLabelText(/subject name/i), 'Physics')

    const target = screen.getByLabelText(/^target$/i)
    await user.clear(target)
    await user.type(target, '0')
    await user.click(screen.getByRole('button', { name: /add to list/i }))

    expect(await screen.findByText(/pick a target between/i)).toBeTruthy()
  })
})

describe('calendar', () => {
  it('does not allow marking a day that has not happened yet', async () => {
    const user = await completeSetup(false)

    await user.click(screen.getByRole('link', { name: /calendar/i }))
    await screen.findByRole('heading', { name: /^calendar$/i })

    for (const day of screen.queryAllByRole('button', { name: /in the future/i })) {
      expect((day as HTMLButtonElement).disabled).toBe(true)
    }

    // Today itself must remain markable.
    const today = document.querySelector('button[aria-current="date"]') as HTMLButtonElement | null
    expect(today).not.toBeNull()
    expect(today!.disabled).toBe(false)
  })
})

describe('persistence', () => {
  it('keeps subjects across a reload', async () => {
    await completeSetup(true)

    cleanup()
    mount('/subjects')

    expect(await screen.findByText('Algorithms')).toBeTruthy()
  })

  it('survives a corrupted cache instead of crashing', async () => {
    window.localStorage.setItem('presently:v3:data:guest', '{ not json')
    mount('/')
    expect(await screen.findByRole('heading', { name: /about your term/i })).toBeTruthy()
  })
})

describe('navigation', () => {
  it('renders exactly one set of section links', async () => {
    await completeSetup(false)

    // The dock and the desktop rail are the same element restyled. Rendering a
    // second copy for wide screens would duplicate every link in the document
    // and give screen readers two identical menus.
    for (const label of ['Today', 'Subjects', 'Calendar', 'Settings']) {
      expect(screen.getAllByRole('link', { name: label })).toHaveLength(1)
    }
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
  })
})

describe('dialogs', () => {
  // The sheet's own behaviour is covered in sheet.test.tsx, where it can be
  // driven without a route transition in the way. This checks only the wiring.
  it('opens the subject sheet from the add button', async () => {
    const user = await completeSetup(false)

    await user.click(screen.getByRole('link', { name: /subjects/i }))
    await user.click(await screen.findByRole('button', { name: /add a subject/i }))

    expect(await screen.findByRole('dialog')).toBeTruthy()
  })
})

describe('today key', () => {
  it('uses the local calendar day for new records', async () => {
    // Guards the original defect directly: 01:30 local, east of UTC.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 29, 1, 30))
    expect(todayKey()).toBe('2026-07-29')
    vi.useRealTimers()
  })
})

describe('today summary', () => {
  /*
    The demo account's numbers: DSA 18/21 and DBMS-L 12/14 are on target with
    3 and 2 to spare, MA201 is 10/16 and below. A pooled view called this 78.4%
    overall with 5 classes to miss, which no single subject could afford.
  */
  function seedStanding() {
    const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, sessionsPerDay: 1 }))
    const subject = (id: string, code: string) => ({
      id,
      name: code,
      code,
      subjectType: 'lecture',
      color: '#7fc99a',
      targetPercentage: 75,
      isArchived: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      schedule: EVERY_DAY
    })

    let day = 0
    const marks = (subjectId: string, present: number, absent: number) =>
      [...Array(present).fill('present'), ...Array(absent).fill('absent')].map((status) => {
        day += 1
        const date = new Date(Date.UTC(2025, 0, 1 + day)).toISOString().slice(0, 10)
        return {
          id: `${subjectId}-${day}`,
          subjectId,
          recordDate: date,
          sessionIndex: 1,
          status,
          createdAt: '',
          updatedAt: ''
        }
      })

    window.localStorage.setItem(
      'presently:v3:data:guest',
      JSON.stringify({
        profile: { id: 'guest', branch: 'CSE', semester: 5, defaultTargetPercentage: 75, onboarded: true },
        subjects: [subject('dsa', 'DSA'), subject('dbms', 'DBMS-L'), subject('ma', 'MA201')],
        records: [...marks('dsa', 18, 3), ...marks('dbms', 12, 2), ...marks('ma', 10, 6)]
      })
    )
  }

  it('leads with the lowest subject rather than a pooled percentage', async () => {
    seedStanding()
    mount()
    await onTodayScreen()

    expect(screen.getByText('Lowest · MA201')).toBeTruthy()
    expect(screen.getByText('10/16 · target 75%')).toBeTruthy()
    expect(screen.queryByText('Overall')).toBeNull()
    expect(screen.queryByText('78.4')).toBeNull()
  })

  it('shows the smallest margin instead of adding margins together', async () => {
    seedStanding()
    mount()
    await onTodayScreen()

    const tile = screen.getByText('Least spare').closest('section') as HTMLElement
    expect(tile.textContent).toBe('Least spare2classesDBMS-L')
  })

  it("puts each subject's own margin beside today's classes", async () => {
    seedStanding()
    mount()
    await onTodayScreen()

    expect(screen.getByText(/· 3 spare/)).toBeTruthy()
    expect(screen.getByText(/· 2 spare/)).toBeTruthy()
    // 10/16 needs (10 + n) / (16 + n) ≥ 75%, so 8 in a row.
    expect(screen.getByText(/· attend next 8/i)).toBeTruthy()
  })
})
