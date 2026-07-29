/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { StoreProvider } from '../lib/store'
import { todayKey } from '../lib/date'

// These tests exercise the app with no Supabase credentials, which is the
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
    const user = userEvent.setup()
    mount('/onboarding')

    await user.click(await screen.findByRole('button', { name: /continue/i }))

    await user.type(screen.getByLabelText(/subject name/i), 'Algorithms')
    // Every weekday selected, so the check-in has something to show today.
    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      await user.click(screen.getByRole('button', { name: day }))
    }
    await user.click(screen.getByRole('button', { name: /add to list/i }))

    await user.click(await screen.findByRole('button', { name: /finish with 1 subject/i }))

    expect(await screen.findByRole('heading', { name: /^today$/i })).toBeTruthy()
    expect(screen.getByText('Algorithms')).toBeTruthy()
  })
})

describe('daily check-in', () => {
  async function setUpWithSubject() {
    const user = userEvent.setup()
    mount('/onboarding')

    await user.click(await screen.findByRole('button', { name: /continue/i }))
    await user.type(screen.getByLabelText(/subject name/i), 'Algorithms')
    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      await user.click(screen.getByRole('button', { name: day }))
    }
    await user.click(screen.getByRole('button', { name: /add to list/i }))
    await user.click(await screen.findByRole('button', { name: /finish with 1 subject/i }))
    await screen.findByRole('heading', { name: /^today$/i })

    return user
  }

  it('records a class and reflects it in the overall percentage', async () => {
    const user = await setUpWithSubject()

    const list = screen.getByRole('list', { name: '' }) ?? document.body
    const present = within(list).getAllByRole('button', { name: 'Present' })[0]
    await user.click(present)

    await waitFor(() => {
      expect(screen.getByText('100')).toBeTruthy()
    })
    expect(present.getAttribute('aria-pressed')).toBe('true')
  })

  it('replaces a status instead of adding a second record', async () => {
    const user = await setUpWithSubject()

    await user.click(screen.getAllByRole('button', { name: 'Present' })[0])
    await user.click(screen.getAllByRole('button', { name: 'Absent' })[0])

    await waitFor(() => {
      expect(screen.getByText('0')).toBeTruthy()
    })

    // One absent and no present: a second record would read 50%.
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

    const target = screen.getByLabelText(/attendance target/i)
    await user.clear(target)
    await user.type(target, '0')
    await user.click(screen.getByRole('button', { name: /add to list/i }))

    expect(await screen.findByText(/pick a target between/i)).toBeTruthy()
  })
})

describe('calendar', () => {
  it('does not allow marking a day that has not happened yet', async () => {
    const user = userEvent.setup()
    mount('/onboarding')

    await user.click(await screen.findByRole('button', { name: /continue/i }))
    await user.click(screen.getByRole('button', { name: /skip for now/i }))
    await screen.findByRole('heading', { name: /^today$/i })

    await user.click(screen.getByRole('link', { name: /calendar/i }))
    await screen.findByRole('heading', { name: /^calendar$/i })

    const future = screen.queryAllByRole('button', { name: /in the future/i })
    for (const day of future) {
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
    const user = userEvent.setup()
    mount('/onboarding')

    await user.click(await screen.findByRole('button', { name: /continue/i }))
    await user.type(screen.getByLabelText(/subject name/i), 'Thermodynamics')
    await user.click(screen.getByRole('button', { name: /add to list/i }))
    await user.click(await screen.findByRole('button', { name: /finish with 1 subject/i }))
    await screen.findByRole('heading', { name: /^today$/i })

    cleanup()
    mount('/subjects')

    expect(await screen.findByText('Thermodynamics')).toBeTruthy()
  })

  it('survives a corrupted cache instead of crashing', async () => {
    window.localStorage.setItem('presently:v3:data:guest', '{ not json')
    mount('/')
    expect(await screen.findByRole('heading', { name: /about your term/i })).toBeTruthy()
  })
})

describe('dialogs', () => {
  it('closes the subject sheet on Escape and restores focus', async () => {
    const user = userEvent.setup()
    mount('/onboarding')

    await user.click(await screen.findByRole('button', { name: /continue/i }))
    await user.click(screen.getByRole('button', { name: /skip for now/i }))
    await screen.findByRole('heading', { name: /^today$/i })

    await user.click(screen.getByRole('link', { name: /subjects/i }))
    const add = await screen.findByRole('button', { name: /add a subject/i })
    await user.click(add)

    expect(await screen.findByRole('dialog')).toBeTruthy()
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(add))
  })
})

describe('today key', () => {
  it('uses the local calendar day for new records', async () => {
    // Guards the original defect directly: an 01:30 local clock east of UTC.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 29, 1, 30))
    expect(todayKey()).toBe('2026-07-29')
    vi.useRealTimers()
  })
})
