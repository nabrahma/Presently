import { Suspense, lazy, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Booting } from './components/Booting'
import { Shell } from './components/Shell'
import { Today } from './screens/Today'
import { useStore } from './lib/store'

/*
  Today is the reason the app gets opened, so it ships in the entry chunk and
  paints immediately. The rest load when first visited, which keeps the drawer
  and calendar libraries off the launch path.
*/
const Auth = lazy(() => import('./screens/Auth').then((m) => ({ default: m.Auth })))
const Onboarding = lazy(() => import('./screens/Onboarding').then((m) => ({ default: m.Onboarding })))

// The tabs' loaders are named so they can be warmed ahead of the first tap.
const loadSubjects = () => import('./screens/Subjects')
const loadSubjectDetail = () => import('./screens/SubjectDetail')
const loadCalendar = () => import('./screens/Calendar')
const loadSettings = () => import('./screens/Settings')

const Subjects = lazy(() => loadSubjects().then((m) => ({ default: m.Subjects })))
const SubjectDetail = lazy(() => loadSubjectDetail().then((m) => ({ default: m.SubjectDetail })))
const Calendar = lazy(() => loadCalendar().then((m) => ({ default: m.Calendar })))
const Settings = lazy(() => loadSettings().then((m) => ({ default: m.Settings })))

/**
 * Fetches every tab's code once the launch has painted, so the first visit to
 * a tab does not wait on the network after the indicator has already moved.
 * Launch stays as light as before; this runs only when the browser is idle.
 */
function usePreloadedTabs() {
  useEffect(() => {
    // Tests render every screen directly; there is nothing to warm there.
    if (import.meta.env.MODE === 'test') return

    const warm = () => {
      for (const load of [loadSubjects, loadCalendar, loadSettings, loadSubjectDetail]) {
        void load().catch(() => undefined) // a failed prefetch just means a normal load later
      }
    }

    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(warm, { timeout: 3000 })
      return () => window.cancelIdleCallback(handle)
    }
    const timer = window.setTimeout(warm, 1200)
    return () => window.clearTimeout(timer)
  }, [])
}

/**
 * Access control has three distinct answers, and collapsing any two of them is
 * what previously sent returning users back through setup:
 *
 *   still loading    → wait, decide nothing
 *   no session       → sign in
 *   setup unfinished → onboarding
 */
function Protected({ children }: { children: ReactNode }) {
  const { hydrated, userId, profile, cloud, isDemo } = useStore()

  if (!hydrated) return <Booting />
  if (cloud && !userId && !isDemo) return <Navigate to="/auth" replace />
  if (!profile?.onboarded) return <Navigate to="/onboarding" replace />

  return <Warmed>{children}</Warmed>
}

/** Mounted only once someone is inside the app, so sign-in stays lean. */
function Warmed({ children }: { children: ReactNode }) {
  usePreloadedTabs()
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      {/* Screens outside the tabbed shell own their own full-height layout. */}
      <Route
        path="/auth"
        element={
          <Suspense fallback={<Booting />}>
            <Auth />
          </Suspense>
        }
      />
      {/* The previous release linked people straight to these paths. */}
      <Route path="/auth/sign-in" element={<Navigate to="/auth" replace />} />
      <Route path="/auth/sign-up" element={<Navigate to="/auth" replace />} />
      <Route
        path="/onboarding"
        element={
          <Suspense fallback={<Booting />}>
            <Onboarding />
          </Suspense>
        }
      />

      {/* The shell mounts once and every tab renders into its outlet. */}
      <Route
        element={
          <Protected>
            <Shell />
          </Protected>
        }
      >
        <Route path="/" element={<Today />} />
        <Route path="/subjects" element={<Subjects />} />
        <Route path="/subjects/:id" element={<SubjectDetail />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
