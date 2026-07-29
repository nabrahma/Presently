import { Suspense, lazy, type ReactNode } from 'react'
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
const Subjects = lazy(() => import('./screens/Subjects').then((m) => ({ default: m.Subjects })))
const SubjectDetail = lazy(() =>
  import('./screens/SubjectDetail').then((m) => ({ default: m.SubjectDetail }))
)
const Calendar = lazy(() => import('./screens/Calendar').then((m) => ({ default: m.Calendar })))
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })))

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
