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
const onTodayScreen = () => screen.findByText('Overall')

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
  it('records a class and reflects it in the overall percentage', async () => {
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
