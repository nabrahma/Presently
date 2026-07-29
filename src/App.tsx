import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Auth, AuthLoading } from './screens/Auth'
import { Calendar } from './screens/Calendar'
import { Onboarding } from './screens/Onboarding'
import { Settings } from './screens/Settings'
import { SubjectDetail } from './screens/SubjectDetail'
import { Subjects } from './screens/Subjects'
import { Today } from './screens/Today'
import { useStore } from './lib/store'

/**
 * Route protection has three distinct answers, and collapsing any two of them
 * is what caused the old app to send returning users back through setup:
 *
 *   still loading  → wait, decide nothing
 *   no session     → sign in
 *   setup unfinished → onboarding
 */
function Protected({ children }: { children: ReactNode }) {
  const { hydrated, userId, profile, cloud, isDemo } = useStore()

  if (!hydrated) return <AuthLoading />
  if (cloud && !userId && !isDemo) return <Navigate to="/auth" replace />
  if (!profile?.onboarded) return <Navigate to="/onboarding" replace />

  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      {/* The previous release linked people to these paths directly. */}
      <Route path="/auth/sign-in" element={<Navigate to="/auth" replace />} />
      <Route path="/auth/sign-up" element={<Navigate to="/auth" replace />} />

      <Route path="/onboarding" element={<Onboarding />} />

      <Route
        path="/"
        element={
          <Protected>
            <Today />
          </Protected>
        }
      />
      <Route
        path="/subjects"
        element={
          <Protected>
            <Subjects />
          </Protected>
        }
      />
      <Route
        path="/subjects/:id"
        element={
          <Protected>
            <SubjectDetail />
          </Protected>
        }
      />
      <Route
        path="/calendar"
        element={
          <Protected>
            <Calendar />
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected>
            <Settings />
          </Protected>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
