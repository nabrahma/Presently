/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { StoreProvider } from '../lib/store'

/*
  jsdom has no layout engine, so these assert the structural rules the layout
  depends on rather than measuring pixels.

  The rule below is not a style preference. The shell pins itself to the
  viewport and delegates all scrolling to one region; if any flex ancestor of
  that region can refuse to shrink, the region never scrolls and the dock is
  pushed off-screen. That shipped once.
*/

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

function seedOnboardedAccount() {
  window.localStorage.setItem(
    'presently:v3:data:guest',
    JSON.stringify({
      profile: {
        id: 'local',
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
          schedule: [{ weekday: 1, sessionsPerDay: 1 }]
        }
      ],
      records: [
        {
          id: 'rec-1',
          subjectId: 'sub-1',
          recordDate: '2026-01-05',
          sessionIndex: 1,
          status: 'present',
          createdAt: '',
          updatedAt: ''
        },
        {
          id: 'rec-2',
          subjectId: 'sub-1',
          recordDate: '2026-01-12',
          sessionIndex: 1,
          status: 'absent',
          createdAt: '',
          updatedAt: ''
        }
      ]
    })
  )
}

function mount(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <StoreProvider>
        <App />
      </StoreProvider>
    </MemoryRouter>
  )
}

const classesOf = (element: Element) => element.className.split(/\s+/).filter(Boolean)

/** Strips a responsive prefix so `md:flex-1` counts as `flex-1`. */
const bare = (token: string) => token.replace(/^[a-z]+:/, '')

beforeEach(() => {
  window.localStorage.clear()
  seedOnboardedAccount()
})

afterEach(cleanup)

describe('the scroll chain', () => {
  it('lets every flexible ancestor of the scroll region shrink', async () => {
    mount('/')
    await screen.findByText('Overall')

    const region = document.querySelector('main.scroll-region')
    expect(region).not.toBeNull()

    const offenders: string[] = []
    let node = region!.parentElement

    while (node && node.id !== 'root' && node !== document.body) {
      const tokens = classesOf(node).map(bare)
      const grows = tokens.includes('flex-1') || tokens.some((token) => token.startsWith('basis-'))
      const canShrink = tokens.includes('min-h-0') || tokens.includes('h-full')

      if (grows && !canShrink) offenders.push(node.className)
      node = node.parentElement
    }

    expect(offenders).toEqual([])
  })

  it('keeps the scroll region itself able to shrink', async () => {
    mount('/')
    await screen.findByText('Overall')

    const tokens = classesOf(document.querySelector('main.scroll-region')!)
    expect(tokens).toContain('min-h-0')
    expect(tokens).toContain('flex-1')
  })

  it('pins the shell to the viewport so the page never scrolls', async () => {
    mount('/')
    await screen.findByText('Overall')

    const shell = document.querySelector('main.scroll-region')!.closest('.h-full')
    expect(shell).not.toBeNull()
    expect(classesOf(shell!)).toContain('flex')
  })

  it('keeps the navigation out of the scrolling region', async () => {
    mount('/')
    await screen.findByText('Overall')

    const nav = screen.getByRole('navigation')
    // Inside the scroll region the dock would scroll away with the content.
    expect(document.querySelector('main.scroll-region')!.contains(nav)).toBe(false)
    expect(classesOf(nav).map(bare)).toContain('shrink-0')
  })
})

describe('screen structure', () => {
  it('renders one scroll region, not one per screen', async () => {
    mount('/')
    await screen.findByText('Overall')

    expect(document.querySelectorAll('main.scroll-region')).toHaveLength(1)
  })

  it('survives navigating between screens', async () => {
    mount('/settings')
    await screen.findByRole('heading', { name: /^settings$/i })

    expect(document.querySelectorAll('main.scroll-region')).toHaveLength(1)
    expect(screen.getByRole('navigation')).toBeTruthy()
  })
})

describe('subject detail', () => {
  it('renders a subject with its margin, totals and history', async () => {
    mount('/subjects/sub-1')

    expect(await screen.findByRole('heading', { name: 'Algorithms' })).toBeTruthy()

    // 1 of 2 counted is 50%, below the 75% target, so the margin is the run
    // needed to recover rather than classes to spare.
    expect(screen.getByText('Margin')).toBeTruthy()
    expect(screen.getByText(/attend the next 2/i)).toBeTruthy()
    expect(screen.getByText('50')).toBeTruthy()

    expect(screen.getByText(/history · 2/i)).toBeTruthy()
    expect(document.querySelectorAll('main.scroll-region')).toHaveLength(1)
  })

  it('sends an unknown subject back to the list', async () => {
    mount('/subjects/does-not-exist')
    expect(await screen.findByRole('heading', { name: /^subjects$/i })).toBeTruthy()
  })
})
